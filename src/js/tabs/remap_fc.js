/**
 * File: src/js/tabs/remap_fc.js
 * Tab controller for "Remap FC". Drives a headless CLI session to read
 * the flight controller's current hardware resource assignments and
 * the firmware's default ones, and mounts the RemapFc Svelte component
 * that presents them.
 */

import HeadlessCliEngine from "@/js/headless_cli_engine.js";
import { CONFIGURATOR } from "@/js/configurator.svelte.js";
import { mount, unmount } from "svelte";
import RemapFc from "@/tabs/remap_fc/remap_fc.svelte";
import {
  parseHardwareDump,
  parseMcuType,
  buildTimerDmaReplayCommands,
} from "@/js/remap_fc/hardware_parser.js";
import { buildChangeCommands } from "@/js/remap_fc/remap_table.js";
import {
  parseReservedDmaStreams,
  parseReservedTimers,
} from "@/js/remap_fc/timer_dma_lookup.js";

const IDLE_THRESHOLD_MS = 500;

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

  // #doRunSequence drives the whole "Read FC" flow: enter CLI mode,
  // dump the current hardware config, reset to defaults and dump again
  // so we have both pin layouts, restore the flight controller's live
  // state back to what the first dump actually reported (see the
  // restoreCommands comment below -- `defaults nosave` leaves the FC
  // running on defaults otherwise), then hand the raw maps to the
  // Svelte component, which builds and owns the editable table itself.
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
    this.#svelteComponent?.setHardware({}, {}, null);
    this.#currentHardware = null;
    this.#defaultHardware = null;
    this.#mcuType = null;
    this.#reservedDmaStreams = new Set();
    this.#reservedTimers = new Set();

    try {
      await this.#activateCli();
      if (this.#tornDown) return;

      const currentDump = await this.#runCommandAndCapture("dump hardware");
      console.log("remap_fc: dump hardware output", currentDump);
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

      const defaultDump = await this.#runCommandAndCapture("dump hardware");
      console.log("remap_fc: dump hardware (defaults) output", defaultDump);

      this.#currentHardware = parseHardwareDump(currentDump);
      this.#defaultHardware = parseHardwareDump(defaultDump);
      this.#mcuType = parseMcuType(currentDump);
      console.log("remap_fc: currentHardware", this.#currentHardware);
      console.log("remap_fc: defaultHardware", this.#defaultHardware);
      console.log("remap_fc: mcuType", this.#mcuType);

      // `defaults nosave` doesn't just preview the factory defaults --
      // it actually resets the flight controller's live resource/
      // timer/DMA state to them in RAM (that's the only way the CLI
      // can report what the defaults *are*). "nosave" only means it's
      // never written to EEPROM, so the persisted config is untouched,
      // but from this point on the FC is actually *running* on
      // defaults until something puts it back. Replay the first
      // dump's own resource/timer/DMA commands to restore the live
      // state to match what was actually read, before the user starts
      // editing anything -- no `save` needed, since this only corrects
      // RAM back to what EEPROM already has.
      //
      // Sent as a fast batch (CliEngine.executeCommandsArray -- the
      // same paste-a-preset mechanism presets.js uses) rather than
      // through #runCommandAndCapture one at a time: each of those
      // waits out a full IDLE_THRESHOLD_MS of silence to confirm a
      // command's *output* has finished, which matters when parsing a
      // dump's text, but these commands have no output worth waiting
      // for -- only that they were sent, which the batch send confirms
      // far faster (a fixed ~15ms line delay instead of ~500ms+ per
      // command). Still waits once for the whole batch to go idle
      // afterwards, so nothing races the flight controller catching up
      // before the user starts editing.
      const restoreCommands = [
        ...buildChangeCommands(this.#defaultHardware, this.#currentHardware),
        ...buildTimerDmaReplayCommands(this.#currentHardware),
      ];
      console.log("remap_fc: loading config back to FC", restoreCommands);
      if (restoreCommands.length > 0) {
        await this.#cliEngine.executeCommandsArray(restoreCommands);
        await this.#waitForIdle();
        if (this.#tornDown) return;
      }

      this.#svelteComponent?.setHardware(
        this.#currentHardware,
        this.#defaultHardware,
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
