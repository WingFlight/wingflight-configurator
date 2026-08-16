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
import { buildRemapTable } from "@/js/remap_fc/remap_table.js";

const IDLE_THRESHOLD_MS = 500;

class RemapFcTab {
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

  #dom = {
    contentWrapper: null,
    mountPoint: null,
  };

  get currentHardware() {
    return this.#currentHardware;
  }

  get defaultHardware() {
    return this.#defaultHardware;
  }

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

  onHtmlLoad(callback) {
    i18n.localizePage();

    this.#dom.contentWrapper = $("#remap_fc_content_wrapper");
    this.#dom.mountPoint = document.querySelector("#remap_fc_svelte_mount");

    this.#svelteComponent = mount(RemapFc, {
      target: this.#dom.mountPoint,
      props: {
        onRunClick: () => this.runSequence(),
      },
    });

    GUI.content_ready(callback);
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
   * controller sends back before going idle again.
   * @param {string} command
   * @returns {Promise<string>} the captured output
   */
  async #runCommandAndCapture(command) {
    const startLength = this.#cliEngine.outputHistory.length;

    this.#cliEngine.sendLine(command);
    await this.#waitForIdle();

    const newOutput = this.#cliEngine.outputHistory.slice(startLength);
    this.#svelteComponent?.appendOutput(command, newOutput);
    return newOutput;
  }

  // Exits CLI mode with "noreboot" rather than CliEngine.close()'s
  // hardcoded "exit", since we don't want the flight controller to
  // reboot after this sequence.
  #exitCliWithNoReboot() {
    return new Promise((resolve) => {
      this.#cliEngine.sendLine("noreboot", () => {
        CONFIGURATOR.cliEngineActive = false;
        CONFIGURATOR.cliEngineValid = false;
        CONFIGURATOR.cliTab = "";
        resolve();
      });
    });
  }

  async runSequence() {
    this.#svelteComponent?.setError(null);
    this.#svelteComponent?.setRunning(true);
    this.#svelteComponent?.setRemapTable([]);
    this.#currentHardware = null;
    this.#defaultHardware = null;

    try {
      await this.#activateCli();
      const currentDump = await this.#runCommandAndCapture("dump hardware");
      await this.#runCommandAndCapture("defaults nosave");
      const defaultDump = await this.#runCommandAndCapture("dump hardware");
      await this.#exitCliWithNoReboot();

      this.#currentHardware = parseHardwareDump(currentDump);
      this.#defaultHardware = parseHardwareDump(defaultDump);
      console.log("remap_fc: currentHardware", this.#currentHardware);
      console.log("remap_fc: defaultHardware", this.#defaultHardware);

      const rows = buildRemapTable(this.#currentHardware, this.#defaultHardware);
      this.#svelteComponent?.setRemapTable(rows);
    } catch (err) {
      console.error("remap_fc: CLI sequence failed", err);
      this.#svelteComponent?.setError(
        err?.message ?? i18n.getMessage("remapFcError"),
      );
    } finally {
      this.#svelteComponent?.setRunning(false);
    }
  }

  // read is called by the app's serial layer whenever this tab is the
  // active tab and data arrives — forward it straight to the engine.
  read(readInfo) {
    this.#cliEngine.readSerial(readInfo);
  }

  cleanup(callback) {
    if (this.#svelteComponent) {
      unmount(this.#svelteComponent);
      this.#svelteComponent = null;
    }

    if (
      !(
        CONFIGURATOR.connectionValid &&
        CONFIGURATOR.cliEngineActive &&
        CONFIGURATOR.cliEngineValid
      )
    ) {
      callback?.();
      return;
    }

    this.#cliEngine.close(() => {
      callback?.();
    });
  }
}

TABS["remap_fc"] = new RemapFcTab();

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
