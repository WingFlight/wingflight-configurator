/**
 * File: src/js/tabs/remap_fc.js
 * Tab controller for "Remap FC". Drives a headless CLI session to read
 * the flight controller's current hardware resource assignments and
 * the firmware's default ones, and mounts the RemapFc Svelte component
 * that presents them.
 */

import HeadlessCliEngine from "@/js/headless_cli_engine.js";
import { CONFIGURATOR } from "@/js/configurator.svelte.js";
import { FC } from "@/js/fc.svelte.js";
import { mount, unmount } from "svelte";
import RemapFc from "@/tabs/remap_fc/remap_fc.svelte";
import { parseHardwareDump, parseMcuType } from "@/js/remap_fc/hardware_parser.js";
import {
  parseReservedDmaStreams,
  parseReservedTimers,
} from "@/js/remap_fc/timer_dma_lookup.js";
import { fetchWingflightTargetDefaults } from "@/js/remap_fc/wingflight_target_source.js";

const IDLE_THRESHOLD_MS = 500;

// A generous ceiling for the config-diff restore step -- replaying
// `diff all`'s own captured text back to the flight controller once
// it's been reset to defaults (see #doRunSequence). `diff` only lists
// settings that actually differ from this firmware's own factory
// defaults, so it's normally short, but a heavily customised config
// (many mixer/servo rules, RC adjustment ranges, LED colours, ...)
// can still run long enough that CliEngine.executeCommandsArray's
// fixed ~15ms-per-line send delay, with no response synchronization,
// adds up to a real, non-instant wait. This is only meant to catch
// something actually going wrong (a dropped response, a serial write
// callback that never lands, ...), not to bound how long a
// legitimately large restore takes -- see the progress callback below
// for what actually keeps the UI from looking stuck during that time.
const BULK_TRANSFER_TIMEOUT_MS = 180000;

// Races `promise` against a timeout, rejecting with an error naming
// `label` if it fires first. Used to bound the two bulk-data steps in
// #doRunSequence -- see BULK_TRANSFER_TIMEOUT_MS.
function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Timed out waiting for ${label}`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

// `dump`/`diff` output is written to be self-contained when pasted
// onto a fresh board, so it ends with a bare `save` line -- which is
// exactly what we must NOT send here: this replay only exists to
// correct the flight controller's RAM back to what EEPROM already has
// after `defaults nosave` (see #doRunSequence), and `save` doesn't
// just persist that (harmless on its own, since it's the original
// config) -- it also reboots the flight controller, right in the
// middle of a "Read FC" that isn't expecting one, dropping the CLI
// session this whole sequence depends on. Drops any line that, once
// trimmed, is exactly "save" (case-insensitively, matching the CLI's
// own case-insensitive command parsing) -- deliberately not a prefix
// match, so a `set`/`resource`/... line that merely happens to
// contain the word "save" is left untouched.
function stripTrailingSave(dumpText) {
  return dumpText
    .split(/\r?\n/)
    .filter((line) => line.trim().toLowerCase() !== "save");
}

class RemapFcTab {
  // --- CLI engine and mounted Svelte component instances for this tab. ---
  /** @type {HeadlessCliEngine} */
  #cliEngine = null;

  /** @type {ReturnType<typeof mount>} */
  #svelteComponent = null;

  // Hardware resource maps parsed from the CLI sequence: the flight
  // controller's current pin configuration, and the pin configuration
  // it falls back to after `defaults nosave`.
  /** @type {?import("@/js/remap_fc/hardware_parser.js").HardwareMap} */
  #currentHardware = null;
  /** @type {?import("@/js/remap_fc/hardware_parser.js").HardwareMap} */
  #defaultHardware = null;

  // The flight controller's MCU family (e.g. "STM32F7X2"), parsed from
  // the first line of the current hardware dump. Matches the top-level
  // keys of MCU-all.json.
  /** @type {?string} */
  #mcuType = null;

  // DMA streams already claimed by something outside this tool's
  // control (SPI buses, ADC, ...), parsed from `dma show` -- see
  // timer_dma_lookup.js's parseReservedDmaStreams. Handed to the
  // Svelte component so its "Allocate Timers/DMA" pass never proposes
  // stealing one of these.
  /** @type {Set<string>} */
  #reservedDmaStreams = new Set();

  // Full timer+channel combinations already claimed by something
  // outside this tool's control (the gyro's clock/sync signal, ...),
  // parsed from `timer show` -- see timer_dma_lookup.js's
  // parseReservedTimers. Same treatment as #reservedDmaStreams.
  /** @type {Set<string>} */
  #reservedTimers = new Set();

  // Set to true once cleanup() starts, so an in-flight runSequence()
  // knows to stop sending further commands rather than racing with
  // the tab switch.
  #tornDown = false;

  // Set to true the moment "save" is actually sent to the flight
  // controller (see #doApplySequence), and only cleared again at the
  // start of the next #doRunSequence/#doApplySequence -- cleanup()
  // checks this before ever sending a real "exit": once "save" is on
  // the wire the FC is rebooting (or about to), and CONFIGURATOR's own
  // cliEngineActive/cliEngineValid flags can briefly still read true
  // in the short window before the base CliEngine's "Rebooting" text
  // detection actually fires. Sending "exit" into that window -- or
  // worse, racing another tab's own CLI activation trying to talk over
  // the same port during the reboot -- is exactly the kind of stray
  // write that can leave the flight controller wedged, needing a power
  // cycle to recover. Once #saveSent is true, cleanup() never sends
  // anything at all; the base reconnect flow is the only thing allowed
  // to touch the port until a fresh sequence starts.
  #saveSent = false;

  // The in-flight runSequence() promise, if any — cleanup() awaits it
  // so we don't switch tabs until the CLI session has actually been
  // exited.
  /** @type {?Promise<void>} */
  #runSequencePromise = null;

  // Read-only accessors so other code (e.g. tests, future features) can
  // inspect the last parsed hardware state without reaching into
  // private fields.
  get currentHardware() {
    return this.#currentHardware;
  }

  get defaultHardware() {
    return this.#defaultHardware;
  }

  get mcuType() {
    return this.#mcuType;
  }

  // initialize mounts the RemapFc Svelte component directly into #content
  // — no jQuery-loaded HTML shell, matching every other Svelte-only tab
  // (e.g. gyro.js) — so its own <Page> header is the tab's only header,
  // rather than duplicating a second, legacy title bar on top of it.
  /**
   * @param {?Function} callback
   */
  initialize(callback) {
    this.#cliEngine = new HeadlessCliEngine(this);

    if (GUI.active_tab !== "remap_fc") {
      GUI.active_tab = "remap_fc";
    }

    const target = document.querySelector("#content");
    target.innerHTML = "";
    this.#svelteComponent = mount(RemapFc, {
      target,
      props: {
        onRunClick: () => this.runSequence(),
        onLoadChanges: (commands) => this.runApplySequence(commands),
      },
    });

    GUI.content_ready(callback);
  }

  // activateCli enters CLI mode and resolves once the flight controller
  // should be ready to receive commands. Matches PresetsTab.activateCli()
  // and the plain CLI tab's activateCli() exactly (minus the CliEngine UI
  // wiring, setUi/initializeAutoComplete, that a headless engine doesn't
  // need) — waiting on CONFIGURATOR.cliEngineValid rather than a flat
  // delay, since that's the flag readSerial() only flips once it has
  // actually seen the flight controller's CLI banner text, not just
  // after some fixed time has passed.
  //
  // Unlike those two tabs, this one deliberately leaves a CLI session
  // open between runs (see #doRunSequence's comment), so this can be
  // called while already inside a valid CLI session -- e.g. "Load
  // Changes" right after a "Read FC". In that case enterCliMode() must
  // NOT be called again: it sends a bare, unterminated "#" byte, which
  // is only safe as the MSP->CLI entry trigger. Sent while already in
  // CLI mode, it just sits in the flight controller's input buffer and
  // glues onto the front of the next line sent, turning it into
  // "#resource ..." -- a comment line the CLI silently discards. So the
  // first real command of the batch would appear to never run.
  #activateCli() {
    if (CONFIGURATOR.cliEngineActive && CONFIGURATOR.cliEngineValid) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      CONFIGURATOR.cliEngineActive = true;
      CONFIGURATOR.cliTab = "remap_fc";
      this.#cliEngine.enterCliMode();

      const waitForValidCliEngine = setInterval(() => {
        if (CONFIGURATOR.cliEngineValid) {
          clearInterval(waitForValidCliEngine);
          GUI.timeout_add(
            "remap_fc_enter_cli_mode_done",
            () => resolve(),
            IDLE_THRESHOLD_MS,
          );
        }
      }, IDLE_THRESHOLD_MS);
    });
  }

  // Resolves once no CLI output has been received for IDLE_THRESHOLD_MS.
  // Commands aren't response-synchronized, so this is how we know a
  // command (e.g. a dump) has actually finished producing output.
  #waitForIdle() {
    return new Promise((resolve) => {
      let lastReceived = performance.now();
      this.#cliEngine.subscribeResponseCallback(() => {
        lastReceived = performance.now();
      });

      const intervalName = `remap_fc_idle_${performance.now()}`;
      GUI.interval_add(
        intervalName,
        () => {
          if (performance.now() - lastReceived > IDLE_THRESHOLD_MS) {
            GUI.interval_remove(intervalName);
            this.#cliEngine.unsubscribeResponseCallback();
            resolve();
          }
        },
        100,
        false,
      );
    });
  }

  /**
   * Sends a single CLI command and captures everything the flight
   * controller sends back before going idle again. The captured text
   * is only used for parsing — the CLI transcript itself isn't shown
   * in the UI.
   * @param {string} command
   * @returns {Promise<string>} the captured output
   */
  async #runCommandAndCapture(command) {
    const startLength = this.#cliEngine.outputHistory.length;

    this.#cliEngine.sendLine(command);
    await this.#waitForIdle();

    return this.#cliEngine.outputHistory.slice(startLength);
  }

  // runSequence kicks off #doRunSequence and remembers its promise, so
  // cleanup() can wait for the CLI session to actually be exited
  // before the tab switch proceeds.
  runSequence() {
    this.#runSequencePromise = this.#doRunSequence();
    return this.#runSequencePromise;
  }

  // #doRunSequence drives the whole "Read FC" flow: back up everything
  // about the FC's current configuration that isn't already sitting on
  // this firmware's own defaults (not just its hardware resources --
  // see the restore comment below for why that distinction matters),
  // reset to defaults and dump the hardware layout again so we have
  // both pin layouts, restore the flight controller's live state back
  // from that backup (`defaults nosave` leaves the FC running on
  // defaults otherwise), then hand the raw maps to the Svelte
  // component, which builds and owns the editable table itself.
  // Checks #tornDown between steps so a tab switch mid-run
  // stops it from sending further commands. Deliberately leaves the CLI
  // session open when the run finishes (or fails) — cleanup() is the
  // only place that actually exits CLI mode, once the user navigates
  // away from this tab, so repeated reads don't pay the cost of
  // re-entering CLI mode each time.
  async #doRunSequence() {
    this.#tornDown = false;
    this.#saveSent = false;
    this.#svelteComponent?.setError(null);
    this.#svelteComponent?.setRunning(true);
    // Deliberately not clearing the Svelte component's own hardware
    // state here -- setHardware({}, {}, null) used to be called at
    // this point, but it also flips hasRead to true with mcuType
    // null, which the component reads as "board not supported" for
    // the whole read (see mcuSupported there). The table is already
    // hidden behind the loading spinner while running is true, so
    // any stale data underneath is invisible anyway, and the real
    // setHardware call below overwrites it wholesale once the read
    // actually completes.
    this.#currentHardware = null;
    this.#defaultHardware = null;
    this.#mcuType = null;
    this.#reservedDmaStreams = new Set();
    this.#reservedTimers = new Set();

    try {
      await this.#activateCli();
      if (this.#tornDown) return;

      // `dump hardware` -- unchanged from before -- for #currentHardware
      // and #mcuType: this is the one thing that must list *every*
      // resource regardless of whether it happens to match this board's
      // own firmware defaults, which a diff, by definition, wouldn't
      // (see currentDiffAll below for the settings that do need that).
      const currentDump = await this.#runCommandAndCapture("dump hardware");
      console.log("remap_fc: dump hardware output", currentDump);
      if (this.#tornDown) return;

      // `diff all` -- not `dump all` -- captures everything about to be
      // wiped by `defaults nosave` further down (PID gains, rates, the
      // ESC protocol, filters, resource reassignments, ...) that isn't
      // *already* sitting on this firmware's own factory defaults. Once
      // `defaults nosave` actually runs, the flight controller is by
      // definition sitting on exactly those defaults -- so replaying
      // this diff back onto it (see the restore step below) reconstructs
      // the original live config exactly, without also resending every
      // setting that was already at its default value and so needed no
      // command at all. A full `dump all` restore is correct too (it's
      // just the diff plus a lot of redundant already-default lines),
      // but on a real config that's easily 1000+ lines it makes "Read
      // FC" take tens of seconds longer than it needs to, for no
      // benefit.
      const currentDiffAll = await withTimeout(
        this.#runCommandAndCapture("diff all"),
        BULK_TRANSFER_TIMEOUT_MS,
        "diff all",
      );
      console.log("remap_fc: diff all output", currentDiffAll);
      if (this.#tornDown) return;

      // `dma show` reports every DMA stream this board is actually
      // using right now, including ones outside this tool's control
      // entirely -- the gyro/flash SPI buses, the battery/current ADC.
      // Captured once, before `defaults nosave`, since these are fixed
      // by the board's own wiring rather than a user-configurable
      // resource -- there's nothing for `defaults nosave` to change
      // here regardless of when this runs.
      const dmaShowOutput = await this.#runCommandAndCapture("dma show");
      console.log("remap_fc: dma show output", dmaShowOutput);
      this.#reservedDmaStreams = parseReservedDmaStreams(dmaShowOutput);
      if (this.#tornDown) return;

      // `timer show` is the same idea for timer+channel claims -- the
      // gyro's clock/sync signal and any other fixed peripheral wiring
      // that isn't a user-configurable resource this tool manages.
      const timerShowOutput = await this.#runCommandAndCapture("timer show");
      console.log("remap_fc: timer show output", timerShowOutput);
      this.#reservedTimers = parseReservedTimers(timerShowOutput);
      if (this.#tornDown) return;

      await this.#runCommandAndCapture("defaults nosave");
      if (this.#tornDown) return;

      // Deliberately `dump hardware`, not `dump all`, here -- all we
      // need from the reset state is the factory-default pin layout
      // for the table; there's no need to also capture (and never any
      // intention of restoring) the FC's full factory-default config.
      const defaultDump = await this.#runCommandAndCapture("dump hardware");
      console.log("remap_fc: dump hardware (defaults) output", defaultDump);

      this.#currentHardware = parseHardwareDump(currentDump);
      this.#defaultHardware = parseHardwareDump(defaultDump);
      this.#mcuType = parseMcuType(currentDump);
      console.log("remap_fc: currentHardware", this.#currentHardware);
      console.log("remap_fc: defaultHardware", this.#defaultHardware);
      console.log("remap_fc: mcuType", this.#mcuType);

      // A board with no Rotorflight-specific build of its own (see
      // remap_fc.svelte's isGenericBoard for the same check) only
      // ever reports resources up to whatever Rotorflight's own
      // runtime was compiled to support -- kick off a lookup of the
      // richer default set its own shared Betaflight target actually
      // defines (see wingflight_target_source.js), in parallel with
      // the CLI restore sequence below since it's an unrelated
      // network fetch, not something to make the user wait on twice.
      // Purely for display -- this.#defaultHardware itself, used
      // below to compute what actually gets sent back to the FC,
      // stays exactly what was really read regardless of how this
      // resolves.
      const targetDefaultsPromise =
        !FC.CONFIG.boardDesign || FC.CONFIG.boardDesign === "BTFL"
          ? fetchWingflightTargetDefaults(
              FC.CONFIG.manufacturerId,
              FC.CONFIG.boardName,
            )
          : Promise.resolve(null);

      // `defaults nosave` doesn't just preview the factory defaults --
      // it actually resets the flight controller's *entire* live
      // configuration to them in RAM (that's the only way the CLI can
      // report what the defaults *are*), not only its resource/timer/
      // DMA state: PID gains, rates, filters, the ESC protocol, every
      // `set`-able value resets too. "nosave" only means it's never
      // written to EEPROM, so the persisted config is untouched, but
      // from this point on the FC is actually *running* on defaults
      // until something puts it back -- and every one of those other
      // settings would otherwise sit wrong in RAM for as long as the
      // tab stays open, or permanently if the user saved before
      // reading further.
      //
      // The fix is to replay currentDiffAll -- the raw `diff all` text
      // captured above, before any of this ran -- back to the flight
      // controller line for line, the exact mechanism presets.js's own
      // backup/restore relies on for a full `dump` (a dump/diff's own
      // header/section comments and blank lines are harmless to resend;
      // the CLI ignores them), just with the diff's much shorter output
      // instead. The flight controller is sitting on exactly this
      // firmware's own factory defaults at this exact point (that's
      // what `defaults nosave` just did), and a diff is precisely
      // "default plus these commands equals the original config" by
      // construction -- so replaying it here reconstructs the original
      // live state exactly, with no separate command-building step
      // needed.
      //
      // stripTrailingSave() is not optional: `dump`/`diff` output is
      // written to be pasteable onto a fresh board, so it ends with a
      // bare `save` line of its own -- sending that here would reboot
      // the flight controller in the middle of "Read FC", which isn't
      // expecting one and has no idea the CLI session it depends on is
      // about to drop. This restore only ever needs to correct RAM
      // back to what EEPROM already has, never to persist or reboot.
      //
      // Sent as a fast batch (CliEngine.executeCommandsArray -- the
      // array form of executeCommands, which is what presets.js's own
      // restore calls) rather than through #runCommandAndCapture one
      // at a time: each of those waits out a full IDLE_THRESHOLD_MS of
      // silence to confirm a command's *output* has finished, which
      // matters when parsing a dump's text, but these commands have no
      // output worth waiting for -- only that they were sent, which
      // the batch send confirms far faster (a fixed ~15ms line delay
      // instead of ~500ms+ per command). Still waits once for the
      // whole batch to go idle afterwards, so nothing races the flight
      // controller catching up before the user starts editing.
      const restoreStartedAt = performance.now();
      console.log(
        `remap_fc: restoring config diff to FC (${currentDiffAll.split(/\r?\n/).length} lines)`,
      );
      // Surfaces CliEngine's own per-line send progress (already tracked
      // internally by executeCommandsArray for every batch send, e.g.
      // presets.js's own restore) as a percentage on the "Reading FC"
      // button, so a restore that takes more than a moment reads as
      // "working" rather than "stuck" -- cleared in the `finally` below
      // alongside every other per-run bit of state.
      this.#cliEngine.setProgressCallback((percent) => {
        this.#svelteComponent?.setRestoreProgress(percent);
      });
      const restoreConfigDiff = async () => {
        await this.#cliEngine.executeCommandsArray(
          stripTrailingSave(currentDiffAll),
        );
        await this.#waitForIdle();
      };
      await withTimeout(
        restoreConfigDiff(),
        BULK_TRANSFER_TIMEOUT_MS,
        "the config restore",
      );
      console.log(
        `remap_fc: config restored (${Math.round(performance.now() - restoreStartedAt)}ms)`,
      );
      if (this.#tornDown) return;

      const targetDefaults = await targetDefaultsPromise;

      this.#svelteComponent?.setHardware(
        this.#currentHardware,
        targetDefaults ?? this.#defaultHardware,
        this.#mcuType,
        this.#reservedDmaStreams,
        this.#reservedTimers,
      );
    } catch (err) {
      console.error("remap_fc: CLI sequence failed", err);
      this.#svelteComponent?.setError(
        err?.message ?? i18n.getMessage("remapFcError"),
      );
    } finally {
      this.#cliEngine.setProgressCallback(null);
      this.#svelteComponent?.setRestoreProgress(null);
      this.#svelteComponent?.setRunning(false);
      this.#runSequencePromise = null;
    }
  }

  // runApplySequence mirrors runSequence(): kicks off #doApplySequence
  // and remembers its promise under the same #runSequencePromise field,
  // so cleanup() waits for a batch of pending changes to finish sending
  // exactly the same way it already waits for a read. Only one of the
  // two can be in flight at a time in practice, since the Svelte
  // component disables both the "Read FC" and "Load Changes" buttons
  // while running is true.
  /**
   * @param {string[]} commands
   */
  runApplySequence(commands) {
    this.#runSequencePromise = this.#doApplySequence(commands);
    return this.#runSequencePromise;
  }

  // #doApplySequence sends the given commands (already ordered by
  // buildChangeCommands() — every removal before any addition — with a
  // trailing "save" appended by the Svelte component) to apply the
  // table's staged edits. Checks #tornDown between commands the same
  // way #doRunSequence does.
  //
  // "save" is deliberately handled differently to every other command
  // here: it's what actually persists the resource reassignments and
  // is what reboots the flight controller to make them take effect (a
  // `resource` command alone only changes the in-memory config — the
  // peripherals themselves aren't reinitialised until the next boot).
  // Once it's sent, the CLI session is ending on its own terms, so
  // unlike every other command we don't wait for it to go idle (that
  // wait could race whatever the reconnect flow does once the flight
  // controller actually drops), and we don't try to re-read
  // `dump hardware` afterwards either, since there's nothing left to
  // read it from until reconnected. The base CliEngine already detects
  // the "Rebooting" text on its own and hands off to the same reconnect
  // path every other "Save & Reboot" button in this app already relies
  // on, so there's nothing more for this sequence to do once "save" is
  // on the wire — including exiting CLI mode, which that same
  // detection also takes care of, so cleanup() has nothing left to do
  // if the user switches tabs while the flight controller is rebooting.
  /**
   * @param {string[]} commands
   */
  async #doApplySequence(commands) {
    this.#tornDown = false;
    this.#saveSent = false;
    this.#svelteComponent?.setError(null);
    this.#svelteComponent?.setRunning(true);

    try {
      await this.#activateCli();
      if (this.#tornDown) return;

      for (const command of commands) {
        if (command === "save") {
          this.#saveSent = true;
          // The base CliEngine's own "Rebooting" text detection is
          // what normally sets this, but only if this tab is still
          // the active one when that text actually streams in --
          // switch tabs first and nothing is listening for it, so
          // main.js's tab-switch guard (`!GUI.reboot_in_progress`)
          // never engages and a newly-activated tab (e.g. CLI) can
          // start writing to the serial port while the flight
          // controller is still mid-reboot, well before the real,
          // USB-detection-based auto-reconnect has even noticed the
          // device drop. Since we know for certain a reboot is about
          // to happen, set it ourselves right now rather than waiting
          // on that detection -- serial_backend.js's finishOpen()
          // still clears it once the real reconnect completes,
          // exactly as it would for any other "Save & Reboot" action.
          GUI.reboot_in_progress = true;
          this.#cliEngine.sendLine(command);
          break;
        }

        await this.#runCommandAndCapture(command);
        if (this.#tornDown) return;
      }

      // The resource commands are confirmed sent (whether or not "save"
      // was reached yet) -- adopt the working copy as the new baseline
      // so the "Load Changes" button/preview collapse, since staying
      // staged after a successful send would just make the user think
      // nothing happened.
      this.#svelteComponent?.markApplied();
    } catch (err) {
      console.error("remap_fc: apply sequence failed", err);
      this.#svelteComponent?.setError(
        err?.message ?? i18n.getMessage("remapFcError"),
      );
    } finally {
      this.#svelteComponent?.setRunning(false);
      this.#runSequencePromise = null;
    }
  }

  // read is called by the app's serial layer whenever this tab is the
  // active tab and data arrives — forward it straight to the engine.
  read(readInfo) {
    this.#cliEngine.readSerial(readInfo);
  }

  // cleanup unmounts the Svelte component and is the sole place that
  // actually exits CLI mode — #doRunSequence() deliberately leaves the
  // session open on completion, so it's still here to be exited (rather
  // than re-entered) if the user reads again before switching away.
  // Uses CliEngine.close() — the same standard exit PresetsTab and the
  // plain CLI tab both use — rather than a bespoke non-reboot command:
  // it sends a real "exit", and the flight controller's actual reboot is
  // picked up by CliEngine.readSerial()'s own "Rebooting" detection,
  // which resets the CLI flags and calls reinitialiseConnection() — the
  // same reconnect path every other "Save & Reboot" action in this app
  // already relies on, rather than us reimplementing it.
  //
  // Never sends "exit" once #saveSent is true, even if
  // CONFIGURATOR.cliEngineActive/cliEngineValid still briefly read true
  // -- those flags don't flip to false until the base CliEngine
  // actually sees "Rebooting" text arrive over serial, which can lag
  // slightly behind "save" itself going out. Sending "exit" into that
  // window means writing to a port whose other end is already
  // rebooting, and doing so right as the user switches to another tab
  // (worst case, the CLI tab, whose own activation writes to the same
  // port too) is exactly the kind of colliding write that's left the
  // flight controller wedged, needing a power cycle to recover.
  cleanup(callback) {
    if (this.#svelteComponent) {
      unmount(this.#svelteComponent);
      this.#svelteComponent = null;
    }

    this.#tornDown = true;

    // #finishCleanup only runs once any in-flight run has actually
    // settled (#doRunSequence notices #tornDown and stops at its next
    // check), so it always sees the CLI session's true end-of-run
    // state rather than racing it.
    const finishCleanup = () => {
      if (
        !this.#saveSent &&
        CONFIGURATOR.connectionValid &&
        CONFIGURATOR.cliEngineActive &&
        CONFIGURATOR.cliEngineValid
      ) {
        this.#cliEngine.close(() => callback?.());
      } else {
        callback?.();
      }
    };

    if (this.#runSequencePromise) {
      this.#runSequencePromise.then(finishCleanup);
    } else {
      finishCleanup();
    }
  }
}

// Register this tab with the app's global tab registry.
TABS["remap_fc"] = new RemapFcTab();

// Vite HMR: re-run initialize() when this module reloads while the tab
// is active, and clean up before the old module instance is discarded.
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule && GUI.active_tab === "remap_fc") {
      TABS["remap_fc"].initialize();
    }
  });

  import.meta.hot.dispose(() => {
    TABS["remap_fc"].cleanup();
  });
}
