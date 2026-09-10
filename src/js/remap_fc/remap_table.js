/**
 * File: src/js/remap_fc/remap_table.js
 * The option-key model behind pin remapping: which resource keys
 * exist ("M1", "S3", "Freq2", "LED", "RX2", ...), which of them may be
 * offered for a pad, the firmware's filling-order rules, and the diff
 * of an edited working copy back against what was read, as the
 * ordered `resource` CLI commands needed to apply it.
 *
 * Ported from Rotorflight Configurator PR #433. Wingflight changes:
 * capacity constants come from Wingflight firmware
 * (MAX_SUPPORTED_MOTORS 4, MAX_SUPPORTED_PWM_SERVOS 8 in
 * src/main/target/common_defaults_post.h), the option catalogue
 * includes the wing-relevant single resources (PPM, ADC, ...), and the
 * per-pin legality check (getLegalOptionsForPin) is new.
 */

import { buildResourceCommand } from "./hardware_parser.js";
import { featureNeedsDma } from "./feature_classifier.js";
import { getPinTimerOptions } from "./timer_dma_lookup.js";

// Wingflight's own hard limits on how many motor/servo outputs it can
// actually drive. The firmware derives motorCount/servoCount by
// walking ioTags[] until the first NONE (flight/motors.c motorInit,
// flight/servos.c servoDevInit), which is also why isEligibleToAdd's
// filling-order rule exists.
export const MAX_VALID_MOTORS = 4;
export const MAX_VALID_SERVOS = 8;

const MOTOR_OR_SERVO_INDEX_RE = /^(M|S)(\d+)$/;

/**
 * Whether optionKey names a motor/servo index beyond what the firmware
 * can actually use.
 * @param {string} optionKey
 * @returns {boolean}
 */
export function isOverCapacity(optionKey) {
  const match = optionKey.match(MOTOR_OR_SERVO_INDEX_RE);
  if (!match) return false;
  const [, prefix, indexStr] = match;
  const index = Number(indexStr);
  return prefix === "M" ? index > MAX_VALID_MOTORS : index > MAX_VALID_SERVOS;
}

/**
 * @typedef {Object} RemapRow
 * @property {string} option - The resource key, e.g. "M1".
 * @property {?string} defaultPin - The pin that resource is assigned by default, if any.
 * @property {?string} currentOption - The resource key currently occupying defaultPin, if any.
 */

// The set of options that are timer outputs/inputs this tool can
// freely move between pads: motors, servos, frequency inputs and the
// LED strip. UART/I2C/ADC resources are pin-bound by the MCU's own
// alternate-function matrix and are only ever offered on their own
// default pin (see getLegalOptionsForPin).
export const TABLE_OPTION_KEYS = [
  "M1",
  "M2",
  "M3",
  "M4",
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "Freq1",
  "Freq2",
  "Freq3",
  "Freq4",
  "LED",
];

// The full set of option keys in canonical display order. RX/TX go up
// to 10 (SERIAL_PORT_MAX_INDEX is RESOURCE_SOFT_OFFSET = 10 hardware
// UARTs before the soft-serial slots) and SDA/SCL up to 4 to match the
// CLI's own resource catalogue; every one of these stays invisible for
// a board that doesn't actually report it.
export const OPTION_KEYS = [
  ...TABLE_OPTION_KEYS.filter((k) => /^M\d+$/.test(k)),
  ...TABLE_OPTION_KEYS.filter((k) => /^S\d+$/.test(k)),
  ...TABLE_OPTION_KEYS.filter((k) => /^Freq\d+$/.test(k)),
  "PPM",
  ...Array.from({ length: 8 }, (_, i) => `PWM${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `RX${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `TX${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `SDA${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `SCL${i + 1}`),
  "Vbat",
  "Curr",
  "RSSI",
  "Vext",
  "LED",
  "Beeper",
  "Cam",
  ...Array.from({ length: 4 }, (_, i) => `PINIO${i + 1}`),
];

/**
 * Sorts an arbitrary set of option keys into OPTION_KEYS order
 * (unknown keys last, alphabetically).
 * @param {string[]} keys
 * @returns {string[]}
 */
export function sortOptionKeys(keys) {
  const order = new Map(OPTION_KEYS.map((key, i) => [key, i]));
  return [...keys].sort((a, b) => {
    const ia = order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ib = order.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ia === ib ? a.localeCompare(b) : ia - ib;
  });
}

/**
 * Builds a row for each of the given options (in the order given),
 * joining each to its default pin and whichever option (if any)
 * currently occupies that same pin.
 * @param {string[]} options
 * @param {import("./hardware_parser.js").HardwareMap} currentHardware
 * @param {import("./hardware_parser.js").HardwareMap} defaultHardware
 * @returns {RemapRow[]}
 */
export function buildRowsForOptions(options, currentHardware, defaultHardware) {
  return options.map((option) => {
    const defaultPin = defaultHardware[option]?.pin ?? null;
    const currentOption =
      defaultPin === null
        ? null
        : (Object.keys(currentHardware).find(
            (key) => currentHardware[key].pin === defaultPin,
          ) ?? null);

    return { option, defaultPin, currentOption };
  });
}

/**
 * Returns the option key currently occupying a pin, if any.
 * @param {import("./hardware_parser.js").HardwareMap} hardware
 * @param {string} pin
 * @returns {?string}
 */
export function occupantOfPin(hardware, pin) {
  return Object.keys(hardware).find((key) => hardware[key].pin === pin) ?? null;
}

// isEligibleToAdd applies the firmware's own filling-order rules on
// top of plain availability: motors and servos must be filled in
// sequence (S4 can't be offered until S1-S3 are *all* already
// configured -- the firmware stops counting at the first unassigned
// index), and a frequency input can only be offered once its matching
// motor is (Freq2 needs M2). Anything else has no such constraint.
function isEligibleToAdd(option, configuredOptions) {
  const match = option.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return true;
  const [, prefix, indexStr] = match;
  const index = Number(indexStr);

  if (prefix === "M" || prefix === "S") {
    for (let i = 1; i < index; i++) {
      if (!configuredOptions.includes(`${prefix}${i}`)) return false;
    }
    return true;
  }

  if (prefix === "Freq") {
    return configuredOptions.includes(`M${index}`);
  }

  return true;
}

/**
 * Returns the options that could be offered for adding to a board:
 * every option this board's default structure reports a pin for,
 * except ones already spoken for.
 * @param {import("./hardware_parser.js").HardwareMap} defaultHardware
 * @param {string[]} visibleOptions - option keys already shown.
 * @returns {{option: string, defaultPin: string}[]}
 */
export function getAddableOptions(defaultHardware, visibleOptions) {
  return OPTION_KEYS.filter(
    (option) => option in defaultHardware && !visibleOptions.includes(option),
  ).map((option) => ({ option, defaultPin: defaultHardware[option].pin }));
}

/**
 * Returns the timer-output options (TABLE_OPTION_KEYS plus any extra
 * keys the caller names) that aren't already claimed and pass the
 * firmware's filling-order rules.
 * @param {string[]} claimedOptions - option keys currently claimed elsewhere.
 * @param {string[]} [extraKeys] - additional keys to consider (deduped).
 * @returns {string[]}
 */
export function getRowSelectableOptions(claimedOptions, extraKeys = []) {
  return [...new Set([...TABLE_OPTION_KEYS, ...extraKeys])].filter(
    (option) =>
      !isOverCapacity(option) &&
      !claimedOptions.includes(option) &&
      isEligibleToAdd(option, claimedOptions),
  );
}

/**
 * @typedef {Object} LegalOption
 * @property {string} key - The option key, e.g. "S3".
 * @property {"timer"|"fixed"|"current"} reason - Why it's legal here:
 *   "timer" -- the pin's own timers can drive it; "fixed" -- the pin is
 *   this pin-bound resource's default pin (UART/I2C/ADC/PPM); "current"
 *   -- it is what the pin currently carries.
 * @property {boolean} dmaCapable - Whether some timer option on this
 *   pin offers DMA (matters for motors/LED).
 */

/**
 * The option keys a given pin may legally carry: only what its own
 * timers allow, plus pin-bound resources whose default pin this is,
 * plus whatever it carries right now. A motor/LED option is offered
 * only when the pin has a DMA-capable timer option (a motor without
 * DMA can't run DSHOT; the LED strip needs DMA outright). Filling
 * order is applied against everything claimed elsewhere.
 * @param {Object} args
 * @param {string} args.pin
 * @param {import("./hardware_parser.js").HardwareMap} args.current
 * @param {import("./hardware_parser.js").HardwareMap} args.defaults
 * @param {?string} args.mcuType
 * @param {Object} args.mcuAllData
 * @returns {LegalOption[]}
 */
export function getLegalOptionsForPin({
  pin,
  current,
  defaults,
  mcuType,
  mcuAllData,
}) {
  const currentKey = occupantOfPin(current, pin);
  const timerOptions = getPinTimerOptions(mcuAllData, mcuType, pin);
  const hasTimer = timerOptions.length > 0;
  const dmaCapable = timerOptions.some((o) => (o.dma?.length ?? 0) > 0);

  const claimedElsewhere = Object.keys(current).filter(
    (key) => current[key].pin !== pin,
  );

  const legal = new Map();

  if (currentKey) {
    legal.set(currentKey, { key: currentKey, reason: "current", dmaCapable });
  }

  if (hasTimer) {
    for (const key of getRowSelectableOptions(claimedElsewhere)) {
      if (legal.has(key)) continue;
      if (featureNeedsDma(key) && !dmaCapable) continue;
      legal.set(key, { key, reason: "timer", dmaCapable });
    }
  }

  // Pin-bound resources: only on their own default pin.
  for (const [key, entry] of Object.entries(defaults)) {
    if (entry.pin !== pin || legal.has(key)) continue;
    if (TABLE_OPTION_KEYS.includes(key)) continue;
    legal.set(key, { key, reason: "fixed", dmaCapable });
  }

  return sortOptionKeys([...legal.keys()]).map((key) => legal.get(key));
}

/**
 * Diffs the as-read hardware map against the edited working copy and
 * returns the ordered CLI commands needed to apply the changes to the
 * flight controller.
 *
 * Every affected resource is freed first (`resource <OWNER> <index>
 * NONE`), and only once every removal has been sent does any new/moved
 * assignment go out (`resource <OWNER> <index> <PIN>`). Freeing
 * everything before claiming anything means a straight swap between
 * two resources can never try to claim a pin the other side hasn't
 * freed yet.
 * @param {import("./hardware_parser.js").HardwareMap} original - The hardware map as last read from the FC.
 * @param {import("./hardware_parser.js").HardwareMap} working - The edited, in-progress working copy.
 * @returns {string[]}
 */
export function buildChangeCommands(original, working) {
  const removals = [];
  const additions = [];

  const allKeys = sortOptionKeys([
    ...new Set([...Object.keys(original), ...Object.keys(working)]),
  ]);

  for (const key of allKeys) {
    const beforePin = original[key]?.pin ?? null;
    const afterPin = working[key]?.pin ?? null;
    if (beforePin === afterPin) continue;

    if (beforePin !== null) removals.push(buildResourceCommand(key, null));
    if (afterPin !== null) additions.push(buildResourceCommand(key, afterPin));
  }

  return [...removals, ...additions];
}
