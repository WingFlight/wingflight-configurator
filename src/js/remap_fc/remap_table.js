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
// (S4 can't be offered until S1-S3 are *all* already configured, same
// for M — checking only the immediate predecessor isn't enough, since
// removing an earlier one, e.g. S2, while S3/S4 stay configured would
// otherwise leave that gap invisible and still let S5 through), and an
// output-frequency group can only be offered once its matching motor
// is (Freq2 needs M2). "Configured" here means either claimed as some
// row's Current Option (e.g. M1 might be configured by having been
// picked as a different pin's occupant — RX1's Current Option, say —
// without M1 ever getting its own dedicated row), or simply having a
// row of its own at all, even an unresolved "Set Option" one — a row
// that exists but hasn't been given a value yet still counts as "this
// slot has been started", which is enough to unblock the next one in
// sequence, depending on what the caller passes in. Anything else
// (LED, UART/I2C) has no such constraint.
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
 * Returns the options that could be offered by "+ Add": every option
 * this board's default structure actually reports a pin for, except
 * ones already spoken for.
 *
 * Motors, servos, output-frequency groups, and the LED pin (see
 * TABLE_OPTION_KEYS) can be picked as a *different* row's Current
 * Option, so one of them can become "homeless" — no longer claimed by
 * anything, even though it still has its own row (e.g. M1's own row
 * got reassigned to something else). Those are still offered here
 * despite having a row, via unavailableOptions (claimed-or-pending-a-
 * pick only) — and must also satisfy the FC's own filling order (see
 * isEligibleToAdd), since having a default pin isn't enough on its own
 * for those.
 *
 * UART/I2C resources, on the other hand, are never offered as a row's
 * Current Option (see getRowSelectableOptions), so they can't become
 * "homeless" the same way — once one has a row at all, regardless of
 * what that row currently holds, it's fully spoken for and excluded
 * via visibleOptions instead.
 * @param {import("./hardware_parser.js").HardwareMap} defaultHardware
 * @param {string[]} unavailableOptions - option keys that are claimed or pending a pick.
 * @param {string[]} configuredOptions - option keys that are claimed, or that simply have a row of their own.
 * @param {string[]} visibleOptions - option keys that currently have a row.
 * @returns {AddableOption[]}
 */
export function getAddableOptions(
  defaultHardware,
  unavailableOptions,
  configuredOptions,
  visibleOptions,
) {
  return OPTION_KEYS.filter((option) => {
    if (!(option in defaultHardware)) return false;

    if (TABLE_OPTION_KEYS.includes(option)) {
      if (unavailableOptions.includes(option)) return false;
      return isEligibleToAdd(option, configuredOptions);
    }

    return !visibleOptions.includes(option);
  }).map((option) => ({ option, defaultPin: defaultHardware[option].pin }));
}

/**
 * Returns the options that could be assigned as a row's Current
 * Option: every one of the FC's own fixed options — motors, servos,
 * output-frequency groups, and the LED pin (see TABLE_OPTION_KEYS) —
 * that isn't already claimed by some row, and that passes the FC's
 * filling-order rules (see isEligibleToAdd) so gaps can't be created
 * (e.g. S3 can't be picked unless S1 and S2 are already claimed).
 *
 * Deliberately uses claimedOptions rather than the broader
 * "configured" notion getAddableOptions uses: a row's own dropdown
 * always includes itself as a choice, so if merely *having a row*
 * counted as satisfying the previous index, a freshly-added, still-
 * unresolved M1 would immediately unlock M2 in its own dropdown — the
 * next one shouldn't become pickable until the previous one has an
 * actual value, not just a row.
 *
 * Unlike getAddableOptions, this deliberately ignores defaultHardware:
 * a row's Current Option is picked from the FC's fixed set of possible
 * options, not from whatever this specific board's default dump
 * happens to report.
 * @param {string[]} claimedOptions - option keys currently claimed as some row's Current Option.
 * @returns {string[]}
 */
export function getRowSelectableOptions(claimedOptions) {
  return TABLE_OPTION_KEYS.filter(
    (option) => !claimedOptions.includes(option) && isEligibleToAdd(option, claimedOptions),
  );
}
