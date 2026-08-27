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
import { parseHardwareDump, parseMcuType } from "@/js/remap_fc/hardware_parser.js";

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
  // keys of STM32_timers.json/STM32_DMA.json.
  /** @type {?string} */
  #mcuType = null;

  // Set to true once cleanup() starts, so an in-flight runSequence()
  // knows to stop sending further commands rather than racing with
  // the tab switch.
  #tornDown = false;

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
        onAddOption: (option) => this.#onAddOption(option),
      },
    });

    GUI.content_ready(callback);
  }

  // Placeholder until adding an option actually issues a `resource`
  // reassignment to the flight controller.
  #onAddOption(option) {
    console.log("remap_fc: add option selected (not yet wired up)", option);
  }

  // activateCli enters CLI mode and resolves once the flight controller
  // should be ready to receive commands. Matches PresetsTab.activateCli()
  // and the plain CLI tab's activateCli() exactly (minus the CliEngine UI
  // wiring, setUi/initializeAutoComplete, that a headless engine doesn't
  // need) — waiting on CONFIGURATOR.cliEngineValid rather than a flat
  // delay, since that's the flag readSerial() only flips once it has
  // actually seen the flight controller's CLI banner text, not just
  // after some fixed time has passed.
  #activateCli() {
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
  // so we have both pin layouts, then parse and hand the raw maps to
  // the Svelte component, which builds and owns the editable table
  // itself. Checks #tornDown between steps so a tab switch mid-run
  // stops it from sending further commands. Deliberately leaves the CLI
  // session open when the run finishes (or fails) — cleanup() is the
  // only place that actually exits CLI mode, once the user navigates
  // away from this tab, so repeated reads don't pay the cost of
  // re-entering CLI mode each time.
  async #doRunSequence() {
    this.#tornDown = false;
    this.#svelteComponent?.setError(null);
    this.#svelteComponent?.setRunning(true);
    this.#svelteComponent?.setHardware({}, {}, null);
    this.#currentHardware = null;
    this.#defaultHardware = null;
    this.#mcuType = null;

    try {
      await this.#activateCli();
      if (this.#tornDown) return;

      const currentDump = await this.#runCommandAndCapture("dump hardware");
      console.log("remap_fc: dump hardware output", currentDump);
      if (this.#tornDown) return;

      await this.#runCommandAndCapture("defaults nosave");
      if (this.#tornDown) return;

      const defaultDump = await this.#runCommandAndCapture("dump hardware");

      this.#currentHardware = parseHardwareDump(currentDump);
      this.#defaultHardware = parseHardwareDump(defaultDump);
      this.#mcuType = parseMcuType(currentDump);
      console.log("remap_fc: currentHardware", this.#currentHardware);
      console.log("remap_fc: defaultHardware", this.#defaultHardware);
      console.log("remap_fc: mcuType", this.#mcuType);

      this.#svelteComponent?.setHardware(
        this.#currentHardware,
        this.#defaultHardware,
        this.#mcuType,
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
