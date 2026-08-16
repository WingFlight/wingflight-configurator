/**
 * File: src/js/remap_fc/remap_table.js
 * Builds the "Remap FC" comparison table: for each hardware option
 * present on the flight controller today, shows the pin that option
 * is assigned by default, and which option (if any) currently
 * occupies that same pin.
 */

/**
 * @typedef {Object} RemapRow
 * @property {string} option - The resource key, e.g. "M1".
 * @property {?string} defaultPin - The pin that resource is assigned by default, if any.
 * @property {?string} currentOption - The resource key currently occupying defaultPin, if any.
 */

// The fixed set of options a row can be shown for, in display order.
const OPTION_KEYS = [
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

/**
 * @param {import("./hardware_parser.js").HardwareMap} currentHardware
 * @param {import("./hardware_parser.js").HardwareMap} defaultHardware
 * @returns {RemapRow[]}
 */
export function buildRemapTable(currentHardware, defaultHardware) {
  const rows = [];

  for (const option of OPTION_KEYS) {
    if (!(option in currentHardware)) continue;

    const defaultPin = defaultHardware[option]?.pin ?? null;
    const currentOption =
      defaultPin === null
        ? null
        : (Object.keys(currentHardware).find(
            (key) => currentHardware[key].pin === defaultPin,
          ) ?? null);

    rows.push({ option, defaultPin, currentOption });
  }

  return rows;
}
