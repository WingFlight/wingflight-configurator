/**
 * File: src/js/remap_fc/wiring_session.svelte.js
 * The engine underneath the setup journey's wiring stage: a Svelte-runes
 * store that reads the flight controller's pin/timer/DMA tables over a
 * headless CLI session, matches the board to a profile (silkscreen
 * labels + pad coordinates), turns a "put function X on pad Y" request
 * into a reconciled CLI diff, and -- only inside apply(), only after the
 * user pressed the button, and only after a full `dump all` backup was
 * saved -- writes that diff back and reboots.
 *
 * The CLI enter/exit dance is preserved from Rotorflight PR #433's
 * remap_fc.js: entering CLI mode sends a bare "#" and waits for
 * CONFIGURATOR.cliEngineValid (the flag CliEngine flips once it has
 * seen the CLI banner); commands are not response-synchronised, so a
 * command is "done" once no output has arrived for IDLE_THRESHOLD_MS;
 * read() deliberately leaves the CLI session OPEN afterwards, because
 * the firmware's `exit` reboots the flight controller (cli.c's cliExit
 * calls cliReboot()) -- the owner of the wiring stage calls close()
 * when leaving it, exactly as the PR's tab did in cleanup(). "save" is
 * the only other way out, and CliEngine's own "Rebooting" detection
 * resets the CLI flags and calls reinitialiseConnection() for it.
 *
 * Unlike the PR, defaults are NOT obtained with `defaults nosave` plus a
 * replayed `diff all`: Wingflight's cli.c prints the default of every
 * changed line as a '#'-prefixed companion when asked (`diff hardware
 * defaults`, via cliDefaultPrintLinef), so one extra read-only command
 * gives the factory pin/timer/DMA layout without ever changing the FC's
 * live state. See hardware_parser.js's parseHardwareDefaults.
 *
 * In virtual mode (CONFIGURATOR.virtualMode) read() returns a canned
 * Vantac RF007 factory dump (fixtures/vantac_rf007.js) and apply() only
 * updates the in-memory maps, so the UI can be developed without
 * hardware.
 */

import i18next from "i18next";

import { CONFIGURATOR } from "@/js/configurator.svelte.js";
import { FC } from "@/js/fc.svelte.js";
import * as filesystem from "@/js/filesystem.js";
import HeadlessCliEngine from "@/js/headless_cli_engine.js";
import { generateFilename } from "@/js/main.js";
import {
  HEADLESS_CLI_TAB,
  setHeadlessCliReader,
} from "@/js/serial_backend.js";

import mcuAllData from "./MCU-all.json";
import { findBoardProfile, padForPin } from "./board_profiles.js";
import { classifyCriticality } from "./feature_classifier.js";
import {
  VANTAC_RF007_CONFIG,
  VANTAC_RF007_DIFF_HARDWARE_DEFAULTS,
  VANTAC_RF007_DMA_SHOW,
  VANTAC_RF007_DUMP_HARDWARE,
  VANTAC_RF007_STATUS,
  VANTAC_RF007_TIMER_SHOW,
} from "./fixtures/vantac_rf007.js";
import {
  buildResourceCommand,
  parseDefaultPinMetadata,
  parseHardwareDefaults,
  parseHardwareDump,
  parseMcuType,
  parsePinMetadata,
} from "./hardware_parser.js";
import { findPinConflictSuggestions } from "./pin_conflict_suggestions.js";
import {
  canonicalResourceName,
  expandOptionName,
  formatPadLabel,
} from "./reference_design_labels.js";
import {
  TABLE_OPTION_KEYS,
  buildChangeCommands,
  getLegalOptionsForPin,
  occupantOfPin,
  sortOptionKeys,
} from "./remap_table.js";
import {
  getPinTimerOptions,
  isMcuSupported,
  mcuTypeFromId,
  parseReservedDmaStreams,
  parseReservedTimers,
  resolveMcuKey,
} from "./timer_dma_lookup.js";
import {
  buildFeatureRows,
  collectClashes,
  reconcileTimersAndDma,
} from "./timer_dma_reconciler.js";

// How long the CLI has to be silent before a command counts as finished.
const IDLE_THRESHOLD_MS = 500;
// Ceiling for the CLI banner to arrive after the "#" is sent.
const CLI_ENTER_TIMEOUT_MS = 6000;
// Ceiling for an ordinary command (dump hardware, diff, dma/timer show).
const COMMAND_TIMEOUT_MS = 30000;
// Ceiling for the `dump all` backup -- a heavily customised config can
// legitimately take a while to stream.
const BULK_TRANSFER_TIMEOUT_MS = 180000;
// How long after "save" the base CliEngine's "Rebooting" detection has
// to fire before the save is treated as failed.
const REBOOT_TIMEOUT_MS = 8000;

const t = (key, params) => i18next.t(key, params);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Polls `predicate` every 100 ms; rejects with `message` after `ms`.
function waitFor(predicate, ms, message) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (performance.now() - start > ms) {
        clearInterval(timer);
        reject(new Error(message));
      }
    }, 100);
  });
}

// Which pad group an option key belongs to when the board profile has
// no pad for its pin.
function groupForKey(key) {
  if (/^(M|S|Freq)\d+$/.test(key)) return "outputs";
  if (/^(RX|TX|PWM)\d+$|^PPM$/.test(key)) return "uart";
  if (/^(SDA|SCL)\d+$/.test(key)) return "i2c";
  if (/^(Vbat|Curr|RSSI|Vext)$/.test(key)) return "adc";
  if (key === "LED") return "led";
  return "other";
}

// Lines the firmware prints when a command failed.
function cliErrorLine(output) {
  return (output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("###ERROR"));
}

// Describes a pin's timer as "TIM3 CH1 (AF2)" from its AF, or null.
function describeTimer(mcuType, pin, af) {
  if (!af) return null;
  const option = getPinTimerOptions(mcuAllData, mcuType, pin).find(
    (o) => o.af === af,
  );
  return option ? `${option.timer} (${option.af})` : af;
}

// Describes a pin's DMA choice as "DMA1 Stream 4 Channel 5" from its
// AF and option index, or null.
function describeDma(mcuType, pin, af, dmaIndex) {
  if (dmaIndex === undefined || dmaIndex === null) return null;
  const option = getPinTimerOptions(mcuAllData, mcuType, pin).find(
    (o) => o.af === af,
  );
  const choice = option?.dma?.[Number(dmaIndex)];
  return choice ? `${choice.stream} Channel ${choice.channel}` : `#${dmaIndex}`;
}

class WiringSession {
  /** @type {'idle'|'reading'|'ready'|'error'|'writing'} */
  status = $state("idle");
  /** @type {?string} */
  error = $state(null);

  /** @type {?import("./hardware_parser.js").HardwareMap} current assignments */
  hardwareMap = $state(null);
  /** @type {?import("./hardware_parser.js").HardwareMap} firmware defaults */
  defaultsMap = $state(null);
  /** pin -> {timer, dma} as currently configured (every pin, not just assigned ones) */
  pinMetadata = $state({});
  /** pin -> {timer, dma} as the firmware defaults them */
  defaultPinMetadata = $state({});

  /** @type {?string} MCU-all.json family key, e.g. "STM32F40X" */
  mcuType = $state(null);
  /** @type {Set<string>} */
  reservedDmaStreams = $state(new Set());
  /** @type {Set<string>} */
  reservedTimers = $state(new Set());

  /** @type {?import("./board_profiles.js").BoardProfile} */
  profile = $state(null);
  /** Option key -> airframe role, see feature_classifier.js */
  surfaceRoles = $state({});

  /** @type {?Object} see #buildPlan for the shape */
  pendingPlan = $state(null);
  backupTaken = $state(false);
  /** @type {?{filename: string, text: string}} */
  lastBackup = $state(null);

  /** Whether a headless CLI session is currently open on the FC. */
  cliOpen = $state(false);
  /** True after a successful apply(): the FC rebooted and must be re-read. */
  needsReread = $state(false);
  /** The command currently being sent, for progress display. */
  progress = $state(null);

  recognised = $derived(this.profile !== null);
  mcuSupported = $derived(isMcuSupported(mcuAllData, this.mcuType));
  virtual = $derived(CONFIGURATOR.virtualMode);

  /**
   * Every assigned resource this tool manages, joined to its pad.
   * @type {{pin: string, silkscreen: ?string, resource: string, key: string, group: string, critical: boolean, criticality: string, label: string}[]}
   */
  padsInUse = $derived.by(() => {
    const map = this.hardwareMap ?? {};
    return sortOptionKeys(Object.keys(map)).map((key) => {
      const pin = map[key].pin;
      const pad = padForPin(this.profile, pin);
      const criticality = classifyCriticality(key, this.surfaceRoles);
      return {
        pin,
        silkscreen: pad?.silkscreen ?? null,
        resource: canonicalResourceName(key),
        key,
        group: pad?.group ?? groupForKey(key),
        critical: criticality === "critical",
        criticality,
        label: formatPadLabel({
          silkscreen: pad?.silkscreen,
          pin,
          optionKey: key,
        }),
      };
    });
  });

  /**
   * Timer/DMA clashes in the configuration as read, one entry per pin
   * involved.
   * @type {{pin: string, resources: string[], kind: 'timer'|'dma', detail: string}[]}
   */
  conflicts = $derived.by(() => {
    if (!this.hardwareMap || !this.mcuSupported) return [];
    const rows = buildFeatureRows(this.hardwareMap, this.mcuType, mcuAllData);
    const clashes = collectClashes(
      rows,
      this.reservedDmaStreams,
      this.reservedTimers,
    );
    const seen = {};
    const out = [];
    for (const clash of clashes) {
      for (const pin of clash.pins) {
        const id = `${pin}|${clash.detail}`;
        if (seen[id]) continue;
        seen[id] = true;
        out.push({
          pin,
          resources: clash.features.map(canonicalResourceName),
          kind: clash.kind === "dma" ? "dma" : "timer",
          detail: clash.detail,
        });
      }
    }
    return out;
  });

  /**
   * The raw remap table: every managed resource the board reports
   * (currently or by default), with pin, silkscreen, default pin,
   * timer and DMA.
   */
  tableRows = $derived.by(() => {
    const current = this.hardwareMap ?? {};
    const defaults = this.defaultsMap ?? {};
    const keys = sortOptionKeys([
      ...new Set([...Object.keys(current), ...Object.keys(defaults)]),
    ]);
    return keys.map((key) => {
      const pin = current[key]?.pin ?? null;
      const defaultPin = defaults[key]?.pin ?? null;
      const meta = pin ? (this.pinMetadata[pin] ?? {}) : {};
      return {
        key,
        resource: canonicalResourceName(key),
        name: expandOptionName(key),
        pin,
        silkscreen: pin ? padForPin(this.profile, pin)?.silkscreen ?? null : null,
        defaultPin,
        isDefault: pin === defaultPin,
        timer: pin ? describeTimer(this.mcuType, pin, meta.timer) : null,
        dma: pin ? describeDma(this.mcuType, pin, meta.timer, meta.dma) : null,
      };
    });
  });

  /** @type {?HeadlessCliEngine} */
  #engine = null;
  #saveSent = false;

  // ---------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------

  /**
   * Opens (or reuses) a headless CLI session, reads the current and
   * default hardware tables plus the timer/DMA claims of fixed
   * peripherals, and leaves the session open. Safe in virtual mode.
   */
  async read() {
    if (this.status === "reading" || this.status === "writing") return;
    this.status = "reading";
    this.error = null;
    this.pendingPlan = null;
    this.needsReread = false;

    try {
      let dump;
      let diff;
      let dmaShow;
      let timerShow;
      let statusOut;
      let config;

      if (CONFIGURATOR.virtualMode) {
        config = VANTAC_RF007_CONFIG;
        dump = VANTAC_RF007_DUMP_HARDWARE;
        diff = VANTAC_RF007_DIFF_HARDWARE_DEFAULTS;
        dmaShow = VANTAC_RF007_DMA_SHOW;
        timerShow = VANTAC_RF007_TIMER_SHOW;
        statusOut = VANTAC_RF007_STATUS;
      } else {
        config = FC.CONFIG;
        await this.#openCli();
        this.progress = "dump hardware";
        dump = await this.#run("dump hardware");
        this.progress = "diff hardware defaults";
        diff = await this.#run("diff hardware defaults");
        this.progress = "dma show";
        dmaShow = await this.#run("dma show");
        this.progress = "timer show";
        timerShow = await this.#run("timer show");
        this.progress = "status";
        statusOut = await this.#run("status");
      }

      const profile = findBoardProfile(config);
      const mcuType =
        mcuTypeFromId(config.mcuTypeId) ??
        parseMcuType(`${statusOut}\n${dump}`) ??
        resolveMcuKey(mcuAllData, profile?.mcu);

      this.profile = profile;
      this.mcuType = mcuType;
      this.hardwareMap = parseHardwareDump(dump);
      this.defaultsMap = parseHardwareDefaults(dump, diff);
      this.pinMetadata = parsePinMetadata(dump);
      this.defaultPinMetadata = parseDefaultPinMetadata(dump, diff);
      this.reservedDmaStreams = parseReservedDmaStreams(dmaShow);
      this.reservedTimers = parseReservedTimers(timerShow);

      if (!this.mcuSupported) {
        this.error = t("wiringErrorMcuUnsupported", {
          mcu: mcuType ?? "?",
        });
      }
      this.status = "ready";
    } catch (err) {
      console.error("wiring_session: read failed", err);
      this.error = err?.message ?? String(err);
      this.status = "error";
    } finally {
      this.progress = null;
    }
  }

  /**
   * Exits the CLI session if one is open. The firmware reboots on
   * `exit`; the app's normal reconnect path handles that. Safe to call
   * at any time (no-op when nothing is open).
   */
  async close() {
    if (CONFIGURATOR.virtualMode) {
      this.cliOpen = false;
      return;
    }
    if (
      this.#engine &&
      !this.#saveSent &&
      CONFIGURATOR.connectionValid &&
      CONFIGURATOR.cliEngineActive &&
      CONFIGURATOR.cliEngineValid &&
      CONFIGURATOR.cliTab === HEADLESS_CLI_TAB
    ) {
      await new Promise((resolve) => this.#engine.close(resolve));
    }
    setHeadlessCliReader(null);
    this.cliOpen = false;
  }

  /** Forgets everything read; call after a disconnect. */
  reset() {
    setHeadlessCliReader(null);
    this.#engine = null;
    this.#saveSent = false;
    this.cliOpen = false;
    this.status = "idle";
    this.error = null;
    this.hardwareMap = null;
    this.defaultsMap = null;
    this.pinMetadata = {};
    this.defaultPinMetadata = {};
    this.mcuType = null;
    this.reservedDmaStreams = new Set();
    this.reservedTimers = new Set();
    this.profile = null;
    this.pendingPlan = null;
    this.backupTaken = false;
    this.progress = null;
  }

  /**
   * @param {Object.<string, string>} roles option key -> airframe role
   */
  setSurfaceRoles(roles) {
    this.surfaceRoles = { ...(roles ?? {}) };
  }

  // ---------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------

  /**
   * Option keys the pin may legally carry (see remap_table.js's
   * getLegalOptionsForPin).
   * @param {string} pin
   */
  legalOptionsFor(pin) {
    if (!this.hardwareMap) return [];
    return getLegalOptionsForPin({
      pin,
      current: this.hardwareMap,
      defaults: this.defaultsMap ?? {},
      mcuType: this.mcuType,
      mcuAllData,
    });
  }

  /** The option key currently on a pin, or null. */
  currentKeyFor(pin) {
    return this.hardwareMap ? occupantOfPin(this.hardwareMap, pin) : null;
  }

  /** The option key(s) the firmware puts on a pin by default. */
  defaultKeysFor(pin) {
    const defaults = this.defaultsMap ?? {};
    return sortOptionKeys(
      Object.keys(defaults).filter((key) => defaults[key].pin === pin),
    );
  }

  /** "S1 · B07 · SERVO 1" for a pin, using whatever is on it now. */
  labelFor(pin) {
    return formatPadLabel({
      silkscreen: padForPin(this.profile, pin)?.silkscreen,
      pin,
      optionKey: this.currentKeyFor(pin),
      unassignedText: t("wiringPadUnassigned"),
    });
  }

  // ---------------------------------------------------------------
  // Planning (never writes)
  // ---------------------------------------------------------------

  /**
   * Plans putting `optionKey` on `pin` (or freeing the pin when
   * optionKey is null). Whatever the pin carried is unassigned, and
   * optionKey is moved off its previous pin. Sets pendingPlan; returns
   * it, or null (with `error` set) when the option is not legal there.
   * @param {string} pin
   * @param {?string} optionKey
   */
  plan(pin, optionKey) {
    if (!this.#canPlan()) return null;
    const current = this.hardwareMap;

    if (optionKey && !this.legalOptionsFor(pin).some((o) => o.key === optionKey)) {
      this.error = t("wiringErrorIllegalOption", { option: optionKey, pin });
      return null;
    }

    const displaced = occupantOfPin(current, pin);
    const working = Object.fromEntries(
      Object.entries(current).filter(
        ([key, entry]) => entry.pin !== pin && key !== optionKey,
      ),
    );
    if (optionKey) {
      // A move onto a pin that keeps its current timer/DMA: only a
      // pin that already carried this very key keeps the metadata,
      // anything else starts without a timer so the reconciler picks
      // one that fits the rest of the board.
      working[optionKey] =
        displaced === optionKey ? { ...current[optionKey] } : { pin };
    }

    return this.#buildPlan({
      kind: optionKey ? "assign" : "free",
      pin,
      optionKey,
      displaced: displaced === optionKey ? null : displaced,
      working,
      explicitPins: [],
    });
  }

  /**
   * Plans putting a pad back to the firmware's default function(s),
   * timer and DMA; whatever those functions currently sit on is freed
   * and also returned to its default timer/DMA.
   * @param {string} pin
   */
  planRevertPad(pin) {
    if (!this.#canPlan()) return null;
    const current = this.hardwareMap;
    const defaults = this.defaultsMap ?? {};
    const defaultKeys = this.defaultKeysFor(pin);
    const displaced = occupantOfPin(current, pin);

    const working = Object.fromEntries(
      Object.entries(current).filter(
        ([key, entry]) => entry.pin !== pin && !defaultKeys.includes(key),
      ),
    );
    const explicitPins = [pin];
    for (const key of defaultKeys) {
      const previousPin = current[key]?.pin;
      if (previousPin && !explicitPins.includes(previousPin)) {
        explicitPins.push(previousPin);
      }
      working[key] = { ...defaults[key] };
    }

    return this.#buildPlan({
      kind: "revertPad",
      pin,
      optionKey: defaultKeys[0] ?? null,
      displaced: defaultKeys.includes(displaced) ? null : displaced,
      working,
      explicitPins,
    });
  }

  /** Plans returning every managed resource, timer and DMA to default. */
  planRevertAll() {
    if (!this.#canPlan()) return null;
    const defaults = this.defaultsMap ?? {};
    const working = Object.fromEntries(
      Object.entries(defaults).map(([key, entry]) => [key, { ...entry }]),
    );
    const explicitPins = [
      ...Object.keys(this.pinMetadata),
      ...Object.keys(this.defaultPinMetadata),
      ...Object.values(this.hardwareMap).map((e) => e.pin),
      ...Object.values(defaults).map((e) => e.pin),
    ].filter((pin, index, all) => all.indexOf(pin) === index);
    return this.#buildPlan({
      kind: "revertAll",
      pin: null,
      optionKey: null,
      displaced: null,
      working,
      explicitPins,
    });
  }

  /**
   * Adopts one of the pending plan's pin-conflict suggestions (a swap
   * or move computed by pin_conflict_suggestions.js) as a new plan.
   * @param {number} index
   */
  acceptSuggestion(index) {
    const suggestion = this.pendingPlan?.suggestions?.[index];
    if (!suggestion || !this.#canPlan()) return null;
    return this.#buildPlan({
      kind: "assign",
      pin: suggestion.targetPin,
      optionKey: suggestion.feature,
      displaced: null,
      working: suggestion.apply,
      explicitPins: [],
    });
  }

  clearPlan() {
    this.pendingPlan = null;
    if (this.status === "ready") this.error = null;
  }

  #canPlan() {
    if (this.status !== "ready" || !this.hardwareMap) {
      this.error = t("wiringErrorNotReady");
      return false;
    }
    return true;
  }

  // Turns a working hardware map into the ordered CLI commands that
  // reach it from the current one, plus a before/after view for the
  // diff table and the reconciler's verdict.
  #buildPlan({ kind, pin, optionKey, displaced, working, explicitPins }) {
    const current = this.hardwareMap;
    const resourceCommands = buildChangeCommands(current, working);

    const reconciled = reconcileTimersAndDma(
      working,
      this.mcuType,
      mcuAllData,
      this.reservedDmaStreams,
      this.reservedTimers,
    );

    // Explicit timer/DMA commands for pins being reverted to their
    // firmware default: the reconciler leaves a pin whose working entry
    // already names a valid timer alone, so those are diffed directly
    // against the pin's current metadata here. Setting a timer resets
    // the pin's DMA option in the firmware (cli.c), hence the DMA is
    // re-sent whenever the timer changes.
    const explicit = explicitPins;
    const explicitTimer = [];
    const explicitDma = [];
    for (const p of explicit) {
      const cur = this.pinMetadata[p] ?? {};
      const def = this.defaultPinMetadata[p] ?? {};
      const timerChanged = (cur.timer ?? null) !== (def.timer ?? null);
      const dmaChanged = (cur.dma ?? null) !== (def.dma ?? null);
      if (timerChanged) {
        explicitTimer.push(`timer ${p} ${def.timer ?? "NONE"}`);
        if (def.dma !== undefined) explicitDma.push(`dma pin ${p} ${def.dma}`);
      } else if (dmaChanged) {
        explicitDma.push(`dma pin ${p} ${def.dma ?? "NONE"}`);
      }
    }
    const pinOfCommand = (cmd) => cmd.match(/^(?:timer|dma pin)\s+([A-Z]\d{2})/)?.[1];
    const reconcilerCommands = reconciled.commands.filter(
      (cmd) => !explicit.includes(pinOfCommand(cmd)),
    );
    const timerDmaCommands = [
      ...reconcilerCommands,
      ...explicitTimer,
      ...explicitDma,
    ];

    const commands = [...resourceCommands, ...timerDmaCommands];

    // Before/after rows: one per resource key whose pin changes, then
    // one per pin whose timer or DMA changes.
    const changes = [];
    const keys = sortOptionKeys([
      ...new Set([...Object.keys(current), ...Object.keys(working)]),
    ]);
    for (const key of keys) {
      const before = current[key]?.pin ?? null;
      const after = working[key]?.pin ?? null;
      if (before === after) continue;
      changes.push({
        kind: "resource",
        key,
        command: buildResourceCommand(key, after),
        before: buildResourceCommand(key, before),
        after: buildResourceCommand(key, after),
        label: expandOptionName(key),
      });
    }
    const finalTimer = {};
    const finalDma = {};
    for (const cmd of timerDmaCommands) {
      const m = cmd.match(/^timer\s+([A-Z]\d{2})\s+(\S+)$/);
      if (m) finalTimer[m[1]] = m[2];
      const d = cmd.match(/^dma pin\s+([A-Z]\d{2})\s+(\S+)$/);
      if (d) finalDma[d[1]] = d[2];
    }
    for (const [p, value] of Object.entries(finalTimer)) {
      const cur = this.pinMetadata[p]?.timer ?? "NONE";
      if (cur === value) continue;
      changes.push({
        kind: "timer",
        key: p,
        command: `timer ${p} ${value}`,
        before: `timer ${p} ${cur}`,
        after: `timer ${p} ${value}`,
        label: describeTimer(this.mcuType, p, value === "NONE" ? null : value),
      });
    }
    for (const [p, value] of Object.entries(finalDma)) {
      const cur = this.pinMetadata[p]?.dma ?? "NONE";
      if (cur === value && !(p in finalTimer)) continue;
      changes.push({
        kind: "dma",
        key: p,
        command: `dma pin ${p} ${value}`,
        before: `dma pin ${p} ${cur}`,
        after: `dma pin ${p} ${value}`,
        label: describeDma(
          this.mcuType,
          p,
          finalTimer[p] ?? this.pinMetadata[p]?.timer,
          value === "NONE" ? null : value,
        ),
      });
    }

    // When the reconciler could not seat every feature, look for a
    // single swap/move that would (pin_conflict_suggestions.js). The
    // candidate pins are every output pad the profile knows plus every
    // default pin of a managed resource.
    let suggestions = [];
    if (reconciled.unresolved.length > 0 && this.mcuSupported) {
      const candidatePins = [
        ...(this.profile?.pads ?? [])
          .filter((pad) => pad.group === "outputs")
          .map((pad) => pad.pin),
        ...Object.values(this.defaultsMap ?? {}).map((e) => e.pin),
      ].filter((p, index, all) => all.indexOf(p) === index);
      const rows = candidatePins.map((p) => ({
        option: null,
        defaultPin: p,
        currentOption: occupantOfPin(working, p),
      }));
      const result = findPinConflictSuggestions(
        working,
        this.mcuType,
        mcuAllData,
        this.reservedDmaStreams,
        this.reservedTimers,
        rows,
      );
      suggestions = result.suggestions.map((s) => ({
        ...s,
        featureLabel: expandOptionName(s.feature),
        otherFeatureLabel: s.otherFeature ? expandOptionName(s.otherFeature) : null,
        targetLabel: this.labelFor(s.targetPin),
      }));
    }

    const pad = pin ? padForPin(this.profile, pin) : null;
    const plan = {
      kind,
      pin,
      silkscreen: pad?.silkscreen ?? null,
      optionKey,
      optionLabel: optionKey ? expandOptionName(optionKey) : null,
      displaced,
      displacedLabel: displaced ? expandOptionName(displaced) : null,
      working,
      commands,
      changes,
      clash: reconciled.clash,
      unresolved: reconciled.unresolved,
      unresolvedLabels: reconciled.unresolved.map(expandOptionName),
      suggestions,
      calculatedTable: reconciled.calculatedTable,
      allocation: reconciled.allocation,
      empty: commands.length === 0,
    };

    this.error = null;
    this.pendingPlan = plan;
    return plan;
  }

  // ---------------------------------------------------------------
  // Applying -- the ONLY place anything is written to the board.
  // ---------------------------------------------------------------

  /**
   * Writes the pending plan: refuses when the board is not recognised,
   * saves a full `dump all` backup to a file first (the user picks
   * where; cancelling the picker aborts), sends the plan's commands,
   * then `save` and waits for the reboot. Throws on failure and sets
   * `error`.
   */
  async apply() {
    if (!this.pendingPlan || this.pendingPlan.empty) {
      this.error = t("wiringErrorNoPlan");
      throw new Error(this.error);
    }
    if (!this.recognised) {
      this.error = t("wiringErrorNotRecognised");
      throw new Error(this.error);
    }
    if (this.pendingPlan.unresolved.length > 0) {
      this.error = t("wiringErrorUnresolved", {
        features: this.pendingPlan.unresolvedLabels.join(", "),
      });
      throw new Error(this.error);
    }
    if (this.status !== "ready") {
      this.error = t("wiringErrorNotReady");
      throw new Error(this.error);
    }

    const plan = this.pendingPlan;
    this.status = "writing";
    this.error = null;
    this.backupTaken = false;
    this.#saveSent = false;

    try {
      if (CONFIGURATOR.virtualMode) {
        // No board: adopt the plan in memory so the UI flow can be
        // exercised. No file dialog either.
        await sleep(300);
        this.#adoptPlanLocally(plan);
        this.backupTaken = true;
        this.pendingPlan = null;
        this.status = "ready";
        return;
      }

      await this.#openCli();

      this.progress = "dump all";
      const dumpAll = await this.#run("dump all", BULK_TRANSFER_TIMEOUT_MS);
      const filename = generateFilename("wiring_backup", "txt");
      const saved = await this.#saveBackup(dumpAll, filename);
      if (!saved) {
        throw new Error(t("wiringErrorBackupCancelled"));
      }
      this.lastBackup = { filename, text: dumpAll };
      this.backupTaken = true;

      for (const command of plan.commands) {
        this.progress = command;
        const output = await this.#run(command);
        const errorLine = cliErrorLine(output);
        if (errorLine) {
          throw new Error(
            t("wiringErrorCliError", { command, message: errorLine }),
          );
        }
      }

      this.progress = "save";
      await this.#sendSaveAndConfirmReboot();

      this.pendingPlan = null;
      this.needsReread = true;
      this.hardwareMap = null;
      this.defaultsMap = null;
      this.status = "idle";
    } catch (err) {
      console.error("wiring_session: apply failed", err);
      if (this.#saveSent) {
        // The reboot never showed up -- nothing was persisted. Reset the
        // bookkeeping so close() can still send a normal "exit".
        this.#saveSent = false;
        GUI.reboot_in_progress = false;
      }
      this.error = err?.message ?? String(err);
      this.status = this.hardwareMap ? "ready" : "error";
      throw err;
    } finally {
      this.progress = null;
    }
  }

  // Applies a plan's working map to the in-memory state (virtual mode).
  #adoptPlanLocally(plan) {
    const next = {};
    for (const [key, entry] of Object.entries(plan.working)) {
      next[key] = { ...entry };
    }
    const meta = { ...this.pinMetadata };
    for (const result of plan.allocation) {
      if (plan.unresolved.includes(result.feature) || !next[result.feature]) continue;
      const timer = result.chosen?.af;
      const dma =
        result.dma?.selectedDMAIndex >= 0
          ? String(result.dma.selectedDMAIndex)
          : undefined;
      next[result.feature] = {
        ...next[result.feature],
        ...(timer ? { timer } : {}),
        ...(dma !== undefined ? { dma } : {}),
      };
      meta[result.pin] = {
        ...(timer ? { timer } : {}),
        ...(dma !== undefined ? { dma } : {}),
      };
    }
    for (const cmd of plan.commands) {
      const tm = cmd.match(/^timer\s+([A-Z]\d{2})\s+(\S+)$/);
      if (tm) {
        meta[tm[1]] = tm[2] === "NONE" ? {} : { ...meta[tm[1]], timer: tm[2] };
        if (tm[2] === "NONE") delete meta[tm[1]];
      }
      const dm = cmd.match(/^dma pin\s+([A-Z]\d{2})\s+(\S+)$/);
      if (dm) {
        if (dm[2] === "NONE") {
          if (meta[dm[1]]) {
            const { dma: _dma, ...rest } = meta[dm[1]];
            meta[dm[1]] = rest;
          }
        } else {
          meta[dm[1]] = { ...meta[dm[1]], dma: dm[2] };
        }
      }
    }
    for (const [key, entry] of Object.entries(next)) {
      const m = meta[entry.pin] ?? {};
      next[key] = {
        pin: entry.pin,
        ...(m.timer ? { timer: m.timer } : {}),
        ...(m.dma !== undefined ? { dma: m.dma } : {}),
      };
    }
    this.hardwareMap = next;
    this.pinMetadata = meta;
  }

  // ---------------------------------------------------------------
  // CLI plumbing
  // ---------------------------------------------------------------

  async #openCli() {
    if (!CONFIGURATOR.connectionValid) {
      throw new Error(t("wiringErrorNotConnected"));
    }
    if (CONFIGURATOR.cliEngineActive && CONFIGURATOR.cliEngineValid) {
      if (CONFIGURATOR.cliTab === HEADLESS_CLI_TAB && this.#engine) {
        // Already inside our own valid session (e.g. apply() right after
        // read()). enterCliMode() must NOT be sent again: its bare "#"
        // would sit in the FC's input buffer and turn the next command
        // into a "#..." comment the CLI silently discards.
        this.cliOpen = true;
        return;
      }
      throw new Error(t("wiringErrorCliBusy"));
    }

    this.#engine = new HeadlessCliEngine();
    this.#saveSent = false;
    setHeadlessCliReader((info) => this.#engine?.readSerial(info));
    CONFIGURATOR.cliEngineActive = true;
    CONFIGURATOR.cliTab = HEADLESS_CLI_TAB;
    this.#engine.enterCliMode();

    try {
      await waitFor(
        () => CONFIGURATOR.cliEngineValid,
        CLI_ENTER_TIMEOUT_MS,
        t("wiringErrorCliEnter"),
      );
    } catch (err) {
      CONFIGURATOR.cliEngineActive = false;
      CONFIGURATOR.cliEngineValid = false;
      CONFIGURATOR.cliTab = "";
      setHeadlessCliReader(null);
      throw err;
    }
    // Let the rest of the banner drain before the first command.
    await sleep(IDLE_THRESHOLD_MS);
    this.cliOpen = true;
  }

  // Resolves once no CLI output has been received for IDLE_THRESHOLD_MS;
  // rejects after `timeoutMs`. Plain timers rather than GUI.interval_add
  // so a tab switch's interval_kill_all() cannot strand the wait.
  #waitForIdle(timeoutMs, label) {
    return new Promise((resolve, reject) => {
      let lastReceived = performance.now();
      const start = lastReceived;
      this.#engine.subscribeResponseCallback(() => {
        lastReceived = performance.now();
      });
      const timer = setInterval(() => {
        const now = performance.now();
        if (now - lastReceived > IDLE_THRESHOLD_MS) {
          clearInterval(timer);
          this.#engine.unsubscribeResponseCallback();
          resolve();
        } else if (now - start > timeoutMs) {
          clearInterval(timer);
          this.#engine.unsubscribeResponseCallback();
          reject(new Error(t("wiringErrorCommandTimeout", { command: label })));
        }
      }, 100);
    });
  }

  // Sends one command and returns everything the FC printed before
  // going idle again.
  async #run(command, timeoutMs = COMMAND_TIMEOUT_MS) {
    const startLength = this.#engine.outputHistory.length;
    this.#engine.sendLine(command);
    await this.#waitForIdle(timeoutMs, command);
    return this.#engine.outputHistory.slice(startLength);
  }

  // Sends "save" and waits for CliEngine's own "Rebooting" detection
  // (which flips CONFIGURATOR.cliEngineValid false and calls
  // reinitialiseConnection()) so a silently dropped save never reads
  // as success.
  async #sendSaveAndConfirmReboot() {
    this.#saveSent = true;
    GUI.reboot_in_progress = true;
    this.#engine.sendLine("save");
    await waitFor(
      () => !CONFIGURATOR.cliEngineValid,
      REBOOT_TIMEOUT_MS,
      t("wiringErrorSaveNoReboot"),
    );
    setHeadlessCliReader(null);
    this.cliOpen = false;
  }

  // Writes the backup through the app's file helper. Returns false when
  // the user cancelled the save dialog.
  async #saveBackup(text, filename) {
    const writer = await filesystem.getWriteStream({
      suggestedName: filename,
      description: "TXT files",
      mimeType: "text/plain",
    });
    if (!writer) return false;
    await writer.write(new Blob([text], { type: "text/plain" }));
    await writer.close();
    return true;
  }
}

let session = null;

/**
 * The app-wide wiring session (one flight controller, one CLI).
 * @returns {WiringSession}
 */
export function getWiringSession() {
  session ??= new WiringSession();
  return session;
}

export { TABLE_OPTION_KEYS };
