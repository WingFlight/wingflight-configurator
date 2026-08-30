/**
 * File: src/js/remap_fc/remap_table.js
 * Builds the "Remap FC" comparison table: for a given list of hardware
 * options, shows the pin each one is assigned by default, and which
 * option (if any) currently occupies that same pin. Also works out
 * which default-only options are still free to be added to the table,
 * and diffs an edited working copy back against what was actually read
 * to build the CLI commands needed to apply the changes.
 */

import { buildResourceCommand } from "./hardware_parser.js";

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
//
// RX/TX go up to 12 and SDA/SCL up to 4 to match the CLI's own
// resource catalog (`resource SERIAL_RX 12 ...`, `resource I2C_SDA 4
// ...`), even though only a handful of MCUs — none currently supported
// by Rotorflight/Wingflight — actually wire that many UART/I2C
// instances. getAddableOptions already gates every option on
// `option in defaultHardware`, so this stays invisible for every board
// that doesn't have a given instance; it's just here so a board that
// does isn't silently missing pins this tool can't see or manage.
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
  "RX7",
  "RX8",
  "RX9",
  "RX10",
  "RX11",
  "RX12",
  "TX1",
  "TX2",
  "TX3",
  "TX4",
  "TX5",
  "TX6",
  "TX7",
  "TX8",
  "TX9",
  "TX10",
  "TX11",
  "TX12",
  "SDA1",
  "SDA2",
  "SDA3",
  "SDA4",
  "SCL1",
  "SCL2",
  "SCL3",
  "SCL4",
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
 * this board's default structure actually reports a pin for — every
 * physical connector this board actually has — except ones already
 * spoken for by a row of their own.
 *
 * Deliberately ignores the FC's filling-order rules (see
 * isEligibleToAdd): "+ Add" only brings a hidden row into view, it
 * doesn't assign anything to it (see handleAddChange — a freshly-added
 * row starts "unset", with no value at all), so it can never create
 * the kind of gap that rule exists to prevent. That constraint is
 * enforced where it actually matters instead: when a value is picked
 * for some row's Current Option (see getRowSelectableOptions). Without
 * this distinction, removing every servo would make it impossible to
 * see S1-S4 (or Freq1) as addable again all at once, even though
 * bringing all four back into view is completely safe — only actually
 * giving one of them a value would need to respect the sequence.
 *
 * Motors, servos, output-frequency groups, and the LED pin (see
 * TABLE_OPTION_KEYS) always have their own row the moment they're
 * eligible (they're only ever removed from the table by being set to
 * "None" — see handleCurrentOptionChange), so a "homeless" one — no
 * longer claimed by anything, e.g. M1's own row got reassigned to
 * something else — never needs offering here: its own row's dropdown
 * already includes it as a choice (see optionsForRow's row.option
 * bypass), so it can always be reclaimed there directly. Offering it
 * here too would just be a second, redundant path to the exact same
 * place — worse, a misleading one, since picking it here is a silent
 * no-op (handleAddChange skips anything already in visibleOptions).
 * So these are only offered once their row has actually been removed
 * entirely (visibleOptions no longer includes them).
 *
 * UART/I2C resources, on the other hand, are never offered as a row's
 * Current Option (see getRowSelectableOptions), so there's no separate
 * reclaim path for them at all — once one has a row, regardless of
 * what that row currently holds, it's fully spoken for and excluded
 * via visibleOptions too, the same as TABLE_OPTION_KEYS options are
 * here.
 * @param {import("./hardware_parser.js").HardwareMap} defaultHardware
 * @param {string[]} visibleOptions - option keys that currently have a row.
 * @returns {AddableOption[]}
 */
export function getAddableOptions(defaultHardware, visibleOptions) {
  return OPTION_KEYS.filter(
    (option) => option in defaultHardware && !visibleOptions.includes(option),
  ).map((option) => ({ option, defaultPin: defaultHardware[option].pin }));
}

/**
 * Returns the options that could be assigned as a row's Current
 * Option: every one of the FC's own fixed options — motors, servos,
 * output-frequency groups, and the LED pin (see TABLE_OPTION_KEYS),
 * plus whichever UART/I2C options namedConnectorKeys names (see
 * reference_design_labels.js's buildNamedConnectorPins -- a caller
 * passes the option keys whose *own* default pin one of those names,
 * e.g. "RX2" when this board's reference design calls RX2's own pin
 * "TLM") — that isn't already claimed by some row, and that passes
 * the FC's filling-order rules (see isEligibleToAdd) so gaps can't be
 * created (e.g. S3 can't be picked unless S1 and S2 are already
 * claimed; a namedConnectorKeys option always passes this trivially,
 * since isEligibleToAdd's rules only ever apply to M/S/Freq prefixes).
 * Every other UART/I2C option stays unreachable here, only ever
 * addable via "+ Add" — offering every possible RX/TX/SDA/SCL slot in
 * every row's own dropdown regardless of whether this board's own
 * reference design ever names it anything would just be clutter, the
 * same reasoning TABLE_OPTION_KEYS's own doc comment gives for leaving
 * UART/I2C out of the table's default row set to begin with.
 *
 * Deliberately uses claimedOptions rather than the broader
 * "configured" notion getAddableOptions uses: a row's own dropdown
 * always includes itself as a choice, so if merely *having a row*
 * counted as satisfying the previous index, a freshly-added, still-
 * unresolved M1 would immediately unlock M2 in its own dropdown — the
 * next one shouldn't become pickable until the previous one has an
 * actual value, not just a row.
 *
 * Unlike getAddableOptions, this deliberately ignores defaultHardware
 * for TABLE_OPTION_KEYS: a row's Current Option is picked from the
 * FC's fixed set of possible options, not from whatever this specific
 * board's default dump happens to report. namedConnectorKeys is the
 * one exception, since by construction every option key in it already
 * has a default pin (that's what makes it a named connector at all).
 * @param {string[]} claimedOptions - option keys currently claimed as some row's Current Option.
 * @param {string[]} [namedConnectorKeys] - option keys whose own
 *   default pin this board's reference design documents as a named
 *   connector (e.g. "RX2" for a board that calls it "TLM"). A
 *   TABLE_OPTION_KEYS member listed here too (a servo/motor's own
 *   default pin can itself be a named connector -- "TAIL" is S4's own
 *   pin on some boards) is harmless: deduped below rather than
 *   requiring the caller to filter it out first, since offering the
 *   same option twice in one dropdown is a Svelte each_key_duplicate
 *   crash, not just a cosmetic glitch, and not every future caller can
 *   be trusted to remember that.
 * @returns {string[]}
 */
export function getRowSelectableOptions(claimedOptions, namedConnectorKeys = []) {
  return [...new Set([...TABLE_OPTION_KEYS, ...namedConnectorKeys])].filter(
    (option) => !claimedOptions.includes(option) && isEligibleToAdd(option, claimedOptions),
  );
}

/**
 * Diffs the as-read hardware map against the edited working copy and
 * returns the ordered CLI commands needed to apply the changes to the
 * flight controller.
 *
 * Every affected resource is freed first (`resource <TAG> <index>
 * none`), and only once every removal has been sent does any new/moved
 * assignment go out (`resource <TAG> <index> <PIN>`). Freeing
 * everything before claiming anything means a straight swap between
 * two resources (M1 and S2 trading pins, say) can never try to claim a
 * pin the other side hasn't freed yet, regardless of which one the
 * user happened to edit first.
 * @param {import("./hardware_parser.js").HardwareMap} original - The hardware map as last read from the FC.
 * @param {import("./hardware_parser.js").HardwareMap} working - The edited, in-progress working copy.
 * @returns {string[]}
 */
export function buildChangeCommands(original, working) {
  const removals = [];
  const additions = [];

  const allKeys = new Set([
    ...Object.keys(original),
    ...Object.keys(working),
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
