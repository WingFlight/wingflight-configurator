/**
 * File: src/js/remap_fc/remap_table.js
 * Builds the "Remap FC" comparison table: for a given list of hardware
 * options, shows the pin each one is assigned by default, and which
 * option (if any) currently occupies that same pin. Also works out
 * which default-only options are still free to be added to the table.
 */

/**
 * @typedef {Object} RemapRow
 * @property {string} option - The resource key, e.g. "M1".
 * @property {?string} defaultPin - The pin that resource is assigned by default, if any.
 * @property {?string} currentOption - The resource key currently occupying defaultPin, if any.
 */

/**
 * @typedef {Object} AddableOption
 * @property {string} option - The resource key, e.g. "M2".
 * @property {string} defaultPin - The pin that resource is assigned by default.
 */

// The narrower set of options whose rows are shown automatically,
// based on what's actually assigned when the FC is read: motors,
// servos, output-frequency groups, and the LED pin. UART/I2C
// resources are deliberately left out here — they shouldn't clutter
// the table just because they happen to be wired — but are still
// reachable via "+ Add" (see OPTION_KEYS below).
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

// The full set of options a row can ever be shown for — everything in
// TABLE_OPTION_KEYS plus the UART and I2C resources, which only ever
// appear via an explicit "+ Add" pick. In canonical display order.
// Exported so callers can sort/filter an arbitrary set of option keys
// back into this order, and so "+ Add" can offer the complete list.
export const OPTION_KEYS = [
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
  "RX1",
  "RX2",
  "RX3",
  "RX4",
  "RX5",
  "RX6",
  "TX1",
  "TX2",
  "TX3",
  "TX4",
  "TX5",
  "TX6",
  "SDA1",
  "SDA2",
  "SDA3",
  "SCL1",
  "SCL2",
  "SCL3",
  "LED",
];

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
  // For each option, find its default pin, then find whichever
  // current option (if any) now sits on that same pin — that's the
  // "what took this pin's place" join.
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

// isEligibleToAdd applies the FC's own filling-order rules on top of
// plain availability: motors and servos must be filled in sequence
// (S4 can't be offered until S1-S3 already have a row, same for M),
// and an output-frequency group can only be offered once its matching
// motor does (Freq2 needs M2). Anything else (LED, UART/I2C) has no
// such constraint.
function isEligibleToAdd(option, visibleOptions) {
  const match = option.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return true;
  const [, prefix, indexStr] = match;
  const index = Number(indexStr);

  if (prefix === "M" || prefix === "S") {
    return index === 1 || visibleOptions.includes(`${prefix}${index - 1}`);
  }

  if (prefix === "Freq") {
    return visibleOptions.includes(`M${index}`);
  }

  return true;
}

/**
 * Returns the options that could be offered by "+ Add": every option
 * this board's default structure actually reports a pin for, except
 * ones already spoken for — either claimed as some visible row's
 * Current Option (including a row showing itself, unchanged), or
 * sitting in a freshly-added row that hasn't had a "Set Option" pick
 * made yet (it doesn't occupy a pin yet, but it already has a row, so
 * offering it again would let you add a second one).
 *
 * On top of that, motors, servos, and output-frequency groups (see
 * isEligibleToAdd) must also satisfy the FC's own filling order —
 * having a default pin isn't enough on its own for those.
 * @param {import("./hardware_parser.js").HardwareMap} defaultHardware
 * @param {string[]} unavailableOptions - option keys that are claimed or pending a pick.
 * @param {string[]} visibleOptions - option keys that currently have a row.
 * @returns {AddableOption[]}
 */
export function getAddableOptions(defaultHardware, unavailableOptions, visibleOptions) {
  return OPTION_KEYS.filter((option) => {
    if (unavailableOptions.includes(option)) return false;
    if (!(option in defaultHardware)) return false;

    if (TABLE_OPTION_KEYS.includes(option)) {
      return isEligibleToAdd(option, visibleOptions);
    }

    return true;
  }).map((option) => ({ option, defaultPin: defaultHardware[option].pin }));
}
