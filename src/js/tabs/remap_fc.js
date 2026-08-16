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
import { parseHardwareDump } from "@/js/remap_fc/hardware_parser.js";

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

  // DOM references populated once the tab's HTML has been loaded.
  #dom = {
    contentWrapper: null,
    mountPoint: null,
  };

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

  // initialize loads the tab's HTML shell and switches GUI.active_tab,
  // then hands off to onHtmlLoad once the markup is in the DOM.
  /**
   * @param {?Function} callback
   */
  initialize(callback) {
    this.#cliEngine = new HeadlessCliEngine(this);

    const self = this;
    $("#content").load(
      `${import.meta.env.BASE_URL}src/tabs/remap_fc/remap_fc.html`,
      () => self.onHtmlLoad(callback),
    );

    if (GUI.active_tab !== "remap_fc") {
      GUI.active_tab = "remap_fc";
    }
  }

  // onHtmlLoad wires up localization and DOM references, then mounts
  // the RemapFc Svelte component, passing it the callbacks it needs to
  // drive this controller.
  onHtmlLoad(callback) {
    i18n.localizePage();

    this.#dom.contentWrapper = $("#remap_fc_content_wrapper");
    this.#dom.mountPoint = document.querySelector("#remap_fc_svelte_mount");

    this.#svelteComponent = mount(RemapFc, {
      target: this.#dom.mountPoint,
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
  // should be ready to receive commands. Mirrors PresetsTab.activateCli(),
  // minus the CliEngine UI wiring (setUi) that we don't need here.
  #activateCli() {
    return new Promise((resolve) => {
      CONFIGURATOR.cliEngineActive = true;
      CONFIGURATOR.cliTab = "remap_fc";
      this.#cliEngine.enterCliMode();

      GUI.timeout_add(
        "remap_fc_enter_cli_mode_done",
        () => resolve(),
        IDLE_THRESHOLD_MS,
      );
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

  // Exits CLI mode with "noreboot" rather than CliEngine.close()'s
  // hardcoded "exit", since we don't want the flight controller to
  // reboot after this sequence. The sendLine callback only confirms
  // the write went out locally, not that the flight controller has
  // finished responding — a fixed delay after that risked flipping
  // cliEngineActive to false while the FC was still sending trailing
  // CLI-mode text, which would then get fed into the binary MSP parser
  // as garbage (CRC failures, desynced framing) once the next tab
  // started polling. So, exactly like every other command in this
  // sequence, we wait for the CLI channel to actually go idle before
  // considering the session over.
  #exitCliWithNoReboot() {
    console.log(
      "remap_fc: sending noreboot",
      "connectionValid:", CONFIGURATOR.connectionValid,
      "cliEngineActive:", CONFIGURATOR.cliEngineActive,
      "cliEngineValid:", CONFIGURATOR.cliEngineValid,
    );
    this.#cliEngine.sendLine("noreboot");
    return this.#waitForIdle().then(() => {
      CONFIGURATOR.cliEngineActive = false;
      CONFIGURATOR.cliEngineValid = false;
      CONFIGURATOR.cliTab = "";
      console.log(
        "remap_fc: CLI session exited",
        "connectionValid:", CONFIGURATOR.connectionValid,
      );
    });
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
  // stops it from sending further commands, and always exits CLI mode
  // with "noreboot" in the finally block — whether the run finished,
  // failed, or was cut short — so we never leave the flight controller
  // sitting in CLI mode when this tab is left.
  async #doRunSequence() {
    this.#tornDown = false;
    this.#svelteComponent?.setError(null);
    this.#svelteComponent?.setRunning(true);
    this.#svelteComponent?.setHardware({}, {});
    this.#currentHardware = null;
    this.#defaultHardware = null;

    try {
      await this.#activateCli();
      if (this.#tornDown) return;

      const currentDump = await this.#runCommandAndCapture("dump hardware");
      if (this.#tornDown) return;

      await this.#runCommandAndCapture("defaults nosave");
      if (this.#tornDown) return;

      const defaultDump = await this.#runCommandAndCapture("dump hardware");

      this.#currentHardware = parseHardwareDump(currentDump);
      this.#defaultHardware = parseHardwareDump(defaultDump);
      console.log("remap_fc: currentHardware", this.#currentHardware);
      console.log("remap_fc: defaultHardware", this.#defaultHardware);

      this.#svelteComponent?.setHardware(this.#currentHardware, this.#defaultHardware);
    } catch (err) {
      console.error("remap_fc: CLI sequence failed", err);
      this.#svelteComponent?.setError(
        err?.message ?? i18n.getMessage("remapFcError"),
      );
    } finally {
      console.log(
        "remap_fc: doRunSequence finally",
        "tornDown:", this.#tornDown,
        "cliEngineActive:", CONFIGURATOR.cliEngineActive,
      );
      if (CONFIGURATOR.cliEngineActive) {
        await this.#exitCliWithNoReboot();
      }
      this.#svelteComponent?.setRunning(false);
      this.#runSequencePromise = null;
    }
  }

  // read is called by the app's serial layer whenever this tab is the
  // active tab and data arrives — forward it straight to the engine.
  read(readInfo) {
    this.#cliEngine.readSerial(readInfo);
  }

  // cleanup unmounts the Svelte component and makes sure the CLI
  // session is actually exited before switching away from this tab.
  // Deliberately never calls CliEngine.close() (which sends a
  // hardcoded "exit" and reboots the flight controller) — that would
  // both defeat the point of #exitCliWithNoReboot() and race with a
  // still-running #doRunSequence(), which is exactly what was leaving
  // the FC stuck in CLI mode (and other tabs waiting for data) after
  // switching away from this one.
  cleanup(callback) {
    console.log(
      "remap_fc: cleanup called",
      "runInFlight:", this.#runSequencePromise !== null,
      "connectionValid:", CONFIGURATOR.connectionValid,
      "cliEngineActive:", CONFIGURATOR.cliEngineActive,
      "cliEngineValid:", CONFIGURATOR.cliEngineValid,
    );

    if (this.#svelteComponent) {
      unmount(this.#svelteComponent);
      this.#svelteComponent = null;
    }

    this.#tornDown = true;

    // A run is still in flight: let it notice #tornDown and exit
    // cleanly on its own via #doRunSequence()'s finally block, then
    // proceed with the tab switch.
    if (this.#runSequencePromise) {
      this.#runSequencePromise.then(() => {
        console.log("remap_fc: cleanup proceeding after in-flight run exited");
        callback?.();
      });
      return;
    }

    if (
      !(
        CONFIGURATOR.connectionValid &&
        CONFIGURATOR.cliEngineActive &&
        CONFIGURATOR.cliEngineValid
      )
    ) {
      console.log("remap_fc: cleanup found no active CLI session to close");
      callback?.();
      return;
    }

    this.#exitCliWithNoReboot().then(() => callback?.());
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
