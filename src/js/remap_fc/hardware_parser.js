/**
 * File: src/js/remap_fc/hardware_parser.js
 * Parses the text output of the flight controller's `dump hardware`
 * (and `diff hardware defaults`) CLI commands into a structured map of
 * resource-to-pin assignments.
 *
 * Ported from Rotorflight Configurator PR #433 and adapted to the line
 * formats Wingflight firmware actually emits (verified against
 * src/main/cli/cli.c and src/main/drivers/resource.c):
 *
 *   resource <OWNER> <index> <PIN>       "resource %s %d %c%02d"   e.g. resource SERVO 1 A08
 *   resource <OWNER> <index> NONE        "resource %s %d NONE"
 *   timer <PIN> AF<n>                    "timer %c%02d AF%d"       e.g. timer C06 AF2
 *   timer <PIN> NONE                     "timer %c%02d NONE"
 *   # pin <PIN>: TIM<n> CH<n>[N] (AF<n>) comment following a timer line
 *   dma pin <PIN> <n>                    "dma pin %c%02d %d"       e.g. dma pin C06 0
 *   dma pin <PIN> NONE                   "dma pin %c%02d NONE"
 *   dma <DEVICE> <index> <n|NONE>        "dma %s %d %d"            e.g. dma ADC 1 1 (peripheral, ignored)
 *
 * With the `defaults` option (`dump hardware defaults` or `diff hardware
 * defaults`) cliDefaultPrintLinef() prefixes the *default* value of
 * every changed line with a bare '#', with no space:
 *
 *   #resource SERVO 1 A08
 *   #timer C06 AF2
 *   #dma pin C06 0
 *
 * Section headings ("# resources", "# timer", "# dma") and pin comments
 * ("# pin C06: TIM3 CH1 (AF2)") always carry a space after the '#', so
 * the two are told apart by that alone.
 */

/**
 * @typedef {Object} HardwareResource
 * @property {string} pin - The pin the resource is assigned to (e.g. "A08").
 * @property {string} [timer] - The timer alternate function assigned to the pin (e.g. "AF2"), if any.
 * @property {string} [dma] - The DMA option index assigned to the pin, if any.
 */

/**
 * @typedef {Object.<string, HardwareResource>} HardwareMap
 * Maps a hardware resource key (e.g. "M1", "S3", "RX1", "SDA2",
 * "Freq2", "LED", "Vbat") to its assigned pin and that pin's timer/DMA
 * configuration. Only resources that are actually assigned a pin are
 * present as keys.
 */

// Maps a `resource` command's owner name (ownerNames[] in the
// firmware's drivers/resource.c, as it appears in `dump hardware`
// output, e.g. `resource MOTOR 1 A08`) to the prefix used for the key
// in the parsed HardwareMap (e.g. "M1"). Owners not listed here (SPI
// buses, gyro/flash chip selects, status LEDs, ...) are fixed onboard
// wiring this tool never manages and are skipped by the parser.
export const RESOURCE_KEY_PREFIXES = {
  MOTOR: "M",
  SERVO: "S",
  SERIAL_RX: "RX",
  SERIAL_TX: "TX",
  I2C_SDA: "SDA",
  I2C_SCL: "SCL",
  LED_STRIP: "LED",
  FREQ: "Freq",
  PPM: "PPM",
  PWM: "PWM",
  ADC_BATT: "Vbat",
  ADC_CURR: "Curr",
  ADC_RSSI: "RSSI",
  ADC_EXT: "Vext",
  BEEPER: "Beeper",
  CAMERA_CONTROL: "Cam",
  PINIO: "PINIO",
};

// Owners the firmware's resourceTable defines as a single value
// (DEFS(...) -- printed with a fixed index of 1). Their HardwareMap
// key is the bare prefix with no index suffix, e.g. "LED", "Vbat".
export const SINGLE_RESOURCE_TAGS = new Set([
  "LED_STRIP",
  "PPM",
  "ADC_BATT",
  "ADC_CURR",
  "ADC_RSSI",
  "ADC_EXT",
  "BEEPER",
  "CAMERA_CONTROL",
]);

// Inverse of RESOURCE_KEY_PREFIXES: maps a HardwareMap key's prefix
// back to the CLI owner name used in a `resource <OWNER> <index> <PIN>`
// command, for reconstructing commands from a key (see
// buildResourceCommand below).
const RESOURCE_TAGS_BY_PREFIX = Object.fromEntries(
  Object.entries(RESOURCE_KEY_PREFIXES).map(([tag, prefix]) => [prefix, tag]),
);

// Line formats to match. The optional leading '#' (no space) marks a
// default-value line printed by cliDefaultPrintLinef().
const RESOURCE_LINE_RE = /^(#?)resource\s+(\w+)\s+(\d+)\s+(\S+)$/i;
const TIMER_LINE_RE = /^(#?)timer\s+([A-Z]\d{2})\s+(\S+)$/i;
const DMA_LINE_RE = /^(#?)dma\s+pin\s+([A-Z]\d{2})\s+(\S+)$/i;

function splitLines(text) {
  return (text ?? "").split(/\r?\n/).map((line) => line.trim());
}

/**
 * Turns a `resource` owner+index into a HardwareMap key, or null for
 * an owner this tool doesn't manage.
 * @param {string} tag e.g. "SERVO"
 * @param {string|number} index 1-based CLI index
 * @returns {?string}
 */
export function resourceKey(tag, index) {
  const upper = tag.toUpperCase();
  const prefix = RESOURCE_KEY_PREFIXES[upper];
  if (!prefix) return null;
  return SINGLE_RESOURCE_TAGS.has(upper) ? prefix : `${prefix}${index}`;
}

/**
 * Builds a pin -> {timer, dma} lookup from the `timer <pin> <af>` and
 * `dma pin <pin> <index>` lines, since timer/DMA assignments are
 * reported per pin rather than per resource. `#`-prefixed default
 * lines are ignored here (see parseHardwareDefaults for those).
 * @param {string} dumpText
 * @returns {Object.<string, {timer?: string, dma?: string}>}
 */
export function parsePinMetadata(dumpText) {
  const pinMetadata = {};

  for (const line of splitLines(dumpText)) {
    const timerMatch = line.match(TIMER_LINE_RE);
    if (timerMatch) {
      const [, hash, pin, af] = timerMatch;
      if (hash || af.toUpperCase() === "NONE") continue;
      const key = pin.toUpperCase();
      pinMetadata[key] = { ...pinMetadata[key], timer: af.toUpperCase() };
      continue;
    }

    const dmaMatch = line.match(DMA_LINE_RE);
    if (dmaMatch) {
      const [, hash, pin, dma] = dmaMatch;
      if (hash || dma.toUpperCase() === "NONE") continue;
      const key = pin.toUpperCase();
      pinMetadata[key] = { ...pinMetadata[key], dma };
    }
  }

  return pinMetadata;
}

// Wingflight's `dump hardware` version banner names the *target*
// ("# Wingflight / MATEKF405 (MKF4) 4.x ..."), not the MCU, so unlike
// Rotorflight's unified targets the MCU family usually can't be read
// out of the dump. The `status` command does print it, though:
//   MCU F40X Clock=168MHz
// (mcuTypeNames[] in cli.c), and an STM32 name may still appear in a
// banner, so both forms are recognised here.
const MCU_TYPE_RE = /\bSTM32[A-Z0-9]+\b/i;
const STATUS_MCU_RE = /^MCU\s+([A-Z0-9]+)/i;

/**
 * Parses the flight controller's MCU family (e.g. "STM32F40X", in the
 * naming MCU-all.json keys its data under) out of CLI output -- either
 * an "STM32..." token in a version banner, or the `status` command's
 * "MCU F40X Clock=..." line. Returns null if neither is present; see
 * timer_dma_lookup.js's mcuTypeFromId for the MSP-based fallback.
 * @param {string} cliText
 * @returns {?string}
 */
export function parseMcuType(cliText) {
  for (const line of splitLines(cliText)) {
    const banner = line.match(MCU_TYPE_RE);
    if (banner) return banner[0].toUpperCase();
    const status = line.match(STATUS_MCU_RE);
    if (status) return `STM32${status[1].toUpperCase()}`;
  }
  return null;
}

/**
 * Parses the text output of a `dump hardware` CLI command into a
 * HardwareMap of configured resources, each enriched with its pin's
 * timer and DMA assignment (if any). `#`-prefixed default lines (from
 * a `defaults` dump) are ignored, so this always reflects the current
 * configuration.
 * @param {string} dumpText
 * @returns {HardwareMap}
 */
export function parseHardwareDump(dumpText) {
  const pinMetadata = parsePinMetadata(dumpText);
  const hardware = {};

  for (const line of splitLines(dumpText)) {
    const match = line.match(RESOURCE_LINE_RE);
    if (!match) continue;

    const [, hash, tag, index, rawPin] = match;
    if (hash) continue;
    if (rawPin.toUpperCase() === "NONE") continue;

    const key = resourceKey(tag, index);
    if (!key) continue;

    const pin = rawPin.toUpperCase();
    const meta = pinMetadata[pin] ?? {};

    hardware[key] = {
      pin,
      ...(meta.timer !== undefined ? { timer: meta.timer } : {}),
      ...(meta.dma !== undefined ? { dma: meta.dma } : {}),
    };
  }

  return hardware;
}

/**
 * Reconstructs the firmware's *default* per-pin timer/DMA metadata
 * from a current `dump hardware` plus a `diff hardware defaults`.
 *
 * cli.c's printConfig() backs the live config up and resets to
 * defaults before printing (backupAndResetConfigs), so with the
 * `defaults` option every changed value is preceded by its default as
 * a `#`-prefixed line. In *diff* mode only changed values are printed
 * at all, which is what makes the timer/DMA case unambiguous: a
 * `timer <PIN> AFn` line with no `#timer <PIN>` companion can only mean
 * the default for that pin is NONE (printTimer only prints the default
 * line when defaultTimerIndex > 0).
 * @param {string} dumpText - `dump hardware` output (current state).
 * @param {string} [diffText] - `diff hardware defaults` output.
 * @returns {Object.<string, {timer?: string, dma?: string}>} pin -> defaults
 */
export function parseDefaultPinMetadata(dumpText, diffText = "") {
  const currentPinMeta = parsePinMetadata(dumpText);

  // pin -> default AF / DMA index (null = none by default)
  const timerDefaults = new Map();
  const dmaDefaults = new Map();
  const changedTimerPins = new Set();
  const changedDmaPins = new Set();

  for (const line of splitLines(diffText)) {
    const timerMatch = line.match(TIMER_LINE_RE);
    if (timerMatch) {
      const [, hash, rawPin, af] = timerMatch;
      const pin = rawPin.toUpperCase();
      if (hash) {
        timerDefaults.set(
          pin,
          af.toUpperCase() === "NONE" ? null : af.toUpperCase(),
        );
      } else {
        changedTimerPins.add(pin);
      }
      continue;
    }

    const dmaMatch = line.match(DMA_LINE_RE);
    if (dmaMatch) {
      const [, hash, rawPin, dma] = dmaMatch;
      const pin = rawPin.toUpperCase();
      if (hash) {
        dmaDefaults.set(pin, dma.toUpperCase() === "NONE" ? null : dma);
      } else {
        changedDmaPins.add(pin);
      }
    }
  }

  // A changed line without a default companion means "default is NONE".
  for (const pin of changedTimerPins) {
    if (!timerDefaults.has(pin)) timerDefaults.set(pin, null);
  }
  for (const pin of changedDmaPins) {
    if (!dmaDefaults.has(pin)) dmaDefaults.set(pin, null);
  }

  const pins = new Set([
    ...Object.keys(currentPinMeta),
    ...timerDefaults.keys(),
    ...dmaDefaults.keys(),
  ]);
  const defaults = {};
  for (const pin of pins) {
    const meta = currentPinMeta[pin] ?? {};
    const timer = timerDefaults.has(pin) ? timerDefaults.get(pin) : meta.timer;
    const dma = dmaDefaults.has(pin) ? dmaDefaults.get(pin) : meta.dma;
    const entry = {
      ...(timer !== undefined && timer !== null ? { timer } : {}),
      ...(dma !== undefined && dma !== null ? { dma } : {}),
    };
    if (Object.keys(entry).length > 0) defaults[pin] = entry;
  }
  return defaults;
}

/**
 * Reconstructs the firmware's *default* hardware map from a current
 * `dump hardware` plus a `diff hardware defaults` -- see
 * parseDefaultPinMetadata for how the `#`-prefixed default lines are
 * read. Resources always get a default companion in the diff
 * (`#resource X n NONE` when the default is unassigned). The result is
 * the current map overlaid with every default the diff reports;
 * without a diff text this degrades to the current map.
 * @param {string} dumpText - `dump hardware` output (current state).
 * @param {string} [diffText] - `diff hardware defaults` output.
 * @returns {HardwareMap}
 */
export function parseHardwareDefaults(dumpText, diffText = "") {
  const current = parseHardwareDump(dumpText);
  const defaultPinMeta = parseDefaultPinMetadata(dumpText, diffText);

  // key -> default pin (null = unassigned by default)
  const resourceDefaults = new Map();
  const changedResourceKeys = new Set();

  for (const line of splitLines(diffText)) {
    const resourceMatch = line.match(RESOURCE_LINE_RE);
    if (!resourceMatch) continue;
    const [, hash, tag, index, rawPin] = resourceMatch;
    const key = resourceKey(tag, index);
    if (!key) continue;
    if (hash) {
      resourceDefaults.set(
        key,
        rawPin.toUpperCase() === "NONE" ? null : rawPin.toUpperCase(),
      );
    } else {
      changedResourceKeys.add(key);
    }
  }

  for (const key of changedResourceKeys) {
    if (!resourceDefaults.has(key)) resourceDefaults.set(key, null);
  }

  const defaults = {};
  const keys = new Set([...Object.keys(current), ...resourceDefaults.keys()]);
  for (const key of keys) {
    const pin = resourceDefaults.has(key)
      ? resourceDefaults.get(key)
      : (current[key]?.pin ?? null);
    if (!pin) continue;
    defaults[key] = { pin, ...(defaultPinMeta[pin] ?? {}) };
  }

  return defaults;
}

// Splits a HardwareMap key like "M1" or "Freq2" into its letter prefix
// and numeric index; single resources ("LED", "Vbat", ...) have no
// index of their own and map to the CLI's fixed index of 1.
const OPTION_KEY_RE = /^([A-Za-z]+)(\d+)$/;

/**
 * Splits an option key into its owner prefix, index and CLI owner name.
 * @param {string} optionKey
 * @returns {{prefix: string, index: number, tag: string}}
 */
export function parseOptionKey(optionKey) {
  const singleTag = RESOURCE_TAGS_BY_PREFIX[optionKey];
  if (singleTag && SINGLE_RESOURCE_TAGS.has(singleTag)) {
    return { prefix: optionKey, index: 1, tag: singleTag };
  }
  const match = optionKey.match(OPTION_KEY_RE);
  if (!match) {
    throw new Error(`Unrecognized option key: ${optionKey}`);
  }
  const [, prefix, indexStr] = match;
  const tag = RESOURCE_TAGS_BY_PREFIX[prefix];
  if (!tag) {
    throw new Error(`Unrecognized option key prefix: ${prefix}`);
  }
  return { prefix, index: Number(indexStr), tag };
}

/**
 * Whether the given string is an option key this tool can express as
 * a `resource` command.
 * @param {string} optionKey
 * @returns {boolean}
 */
export function isKnownOptionKey(optionKey) {
  try {
    parseOptionKey(optionKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the `resource <OWNER> <index> <PIN>` CLI command that assigns
 * (or, when pin is null/undefined, frees) the given HardwareMap option
 * key -- the inverse of parseHardwareDump's per-line parsing.
 * @param {string} optionKey e.g. "M1", "Freq2", "LED"
 * @param {?string} pin e.g. "A08", or null/undefined to free the resource
 * @returns {string}
 */
export function buildResourceCommand(optionKey, pin) {
  const { tag, index } = parseOptionKey(optionKey);
  // The firmware's own dumps write this sentinel in uppercase
  // (e.g. "resource MOTOR 3 NONE") -- match that exactly.
  return `resource ${tag} ${index} ${pin ?? "NONE"}`;
}

/**
 * Builds the `timer`/`dma pin` CLI commands that put every pin in the
 * given HardwareMap back exactly as it was recorded -- the inverse of
 * parsePinMetadata's per-pin parsing.
 * @param {HardwareMap} hardwareMap
 * @returns {string[]}
 */
export function buildTimerDmaReplayCommands(hardwareMap) {
  const commands = [];

  for (const entry of Object.values(hardwareMap)) {
    if (entry.timer !== undefined) {
      commands.push(`timer ${entry.pin} ${entry.timer}`);
    }
    if (entry.dma !== undefined) {
      commands.push(`dma pin ${entry.pin} ${entry.dma}`);
    }
  }

  return commands;
}
