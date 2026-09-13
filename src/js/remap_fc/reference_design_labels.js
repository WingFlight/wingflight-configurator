/**
 * File: src/js/remap_fc/reference_design_labels.js
 * Builds a pin -> friendly label lookup from reference_designs.json,
 * for the design family matching the connected board (e.g. "F7A1" ->
 * "F7A"), so the remap table and "+ Add" can show the board's own
 * silkscreen naming (e.g. "ESC", "TAIL", "Port A Rx") alongside the
 * CLI's own MOTOR/SERVO/SERIAL_RX numbering. Also exports
 * expandOptionName, a reference-design-independent fallback that
 * spells out an option key's own CLI shorthand (e.g. "S1" ->
 * "Servo 1") for boards with no matching reference design at all.
 */

// A design family is its board design's first three characters, e.g.
// "F7A1" -> "F7A", "F7C5" -> "F7C".
function designFamily(boardDesign) {
  return boardDesign ? boardDesign.slice(0, 3) : null;
}

// Converts a reference design's own pin spelling ("PA9", "PC12") to
// the zero-padded form used throughout this tool's own HardwareMap
// pins ("A09", "C12").
function normalizePin(pin) {
  const match = pin.match(/^P([A-Z])(\d+)$/);
  if (!match) return pin;
  const [, letter, number] = match;
  return `${letter}${number.padStart(2, "0")}`;
}

// A multi-pin usage (e.g. "Port A": [TX4, RX4]) needs each of its own
// pins told apart from each other -- inferred from whichever of TX/RX
// leads that pin's own "function" column (e.g. "TX4 / T5CH1" -> "Tx",
// "RX3 / SDA2 / T2CH4" -> "Rx"). A usage with only one pin needs no
// such suffix, since there's nothing to disambiguate.
function directionSuffix(usageEntry) {
  if (/^TX/i.test(usageEntry.function)) return "Tx";
  if (/^RX/i.test(usageEntry.function)) return "Rx";
  return null;
}

/**
 * @param {Object} referenceDesigns - The parsed contents of reference_designs.json.
 * @param {?string} boardDesign - e.g. "F7C5", from FC.CONFIG.boardDesign.
 * @returns {Object.<string, string>} pin (e.g. "A09") -> friendly label (e.g. "ESC", "Port A Rx").
 */
export function buildReferenceLabels(referenceDesigns, boardDesign) {
  const family = designFamily(boardDesign);
  const usages = referenceDesigns?.[family];
  if (!usages) return {};

  const labels = {};
  for (const [usageName, entries] of Object.entries(usages)) {
    const multiPin = entries.length > 1;
    for (const entry of entries) {
      const suffix = multiPin ? directionSuffix(entry) : null;
      labels[normalizePin(entry.pin)] = suffix ? `${usageName} ${suffix}` : usageName;
    }
  }
  return labels;
}

// Reference design usages that wire a pin to fixed onboard sensor/
// support hardware rather than a general-purpose, reassignable
// connector -- e.g. the barometer's own I2C bus, or the primary
// gyro's SPI lines. Reassigning one of these through this tool
// wouldn't free up a spare pin, it would silently break whatever
// that sensor is (across F7A/F7B/F7C's own reference designs, this is
// every usage name that isn't a Port/AUX/SBUS/TLM/RPM connector or a
// motor/servo output).
const RESERVED_USAGE_NAMES = new Set([
  "Gyro CS",
  "Gyro SCK",
  "Gyro SDO",
  "Gyro SDI",
  "Gyro INT",
  "Gyro CLK",
  "Acc CS",
  "ACC CS",
  "Acc INT",
  "Compass CS",
  "Compass EXTI",
  "Baro",
  "Flash",
  "Vbat",
  "Vbec (VX)",
  "Vbus (5V)",
  "Ibus",
  "Vext",
  "Buzzer",
  "Beeper",
  "LED Green",
  "LED Red",
  "SDCard CS",
  "SDCard Detect",
  "USB Detect",
]);

/**
 * @param {Object} referenceDesigns - The parsed contents of reference_designs.json.
 * @param {?string} boardDesign - e.g. "F7C5", from FC.CONFIG.boardDesign.
 * @returns {Set<string>} pins (e.g. "C09") reserved for fixed onboard
 *   sensor/support wiring per the board's reference design -- these
 *   should never be offered for reassignment.
 */
export function buildReservedPins(referenceDesigns, boardDesign) {
  const family = designFamily(boardDesign);
  const usages = referenceDesigns?.[family];
  if (!usages) return new Set();

  const pins = new Set();
  for (const [usageName, entries] of Object.entries(usages)) {
    if (!RESERVED_USAGE_NAMES.has(usageName)) continue;
    for (const entry of entries) {
      pins.add(normalizePin(entry.pin));
    }
  }
  return pins;
}

// A usage name that starts with "Port " (e.g. "Port A", "Port C") is a
// generic, unlabelled UART/I2C connector meant for whatever the user
// wants to attach to it -- there's nothing to automatically show until
// something's actually wired there (see remap_fc.svelte's
// setHardware). Every other non-reserved usage a reference design
// documents (AUX, SBUS, TLM, RPM, ...) names a specific, purpose-built
// connector that's worth showing on its own, the same as a
// motor/servo header always is.
function isGenericPortUsage(usageName) {
  return usageName.startsWith("Port ");
}

/**
 * @param {Object} referenceDesigns - The parsed contents of reference_designs.json.
 * @param {?string} boardDesign - e.g. "F7C5", from FC.CONFIG.boardDesign.
 * @returns {Set<string>} pins (e.g. "A03") for named, purpose-built
 *   connectors this reference design documents (AUX, SBUS, TLM, RPM,
 *   ...) -- these should always get their own row once the board's
 *   design is known, whether or not anything is currently wired to
 *   them, unlike a generic "Port X" connector or reserved sensor/
 *   support wiring (see buildReservedPins).
 */
export function buildNamedConnectorPins(referenceDesigns, boardDesign) {
  const family = designFamily(boardDesign);
  const usages = referenceDesigns?.[family];
  if (!usages) return new Set();

  const pins = new Set();
  for (const [usageName, entries] of Object.entries(usages)) {
    if (isGenericPortUsage(usageName) || RESERVED_USAGE_NAMES.has(usageName)) continue;
    for (const entry of entries) {
      pins.add(normalizePin(entry.pin));
    }
  }
  return pins;
}

// The full word for an option key's own CLI shorthand prefix -- used
// as a fallback name (see expandOptionName) for a board with no
// matching reference design at all, or for an option a documented
// reference design just doesn't happen to cover.
const PREFIX_NAMES = {
  M: "Motor",
  S: "Servo",
  Freq: "Frequency",
  RX: "Serial RX",
  TX: "Serial TX",
  SDA: "I2C SDA",
  SCL: "I2C SCL",
};

const OPTION_KEY_RE = /^([A-Za-z]+)(\d+)$/;

/**
 * Expands a remap_table.js option key's own CLI shorthand into a
 * full, readable name, e.g. "S1" -> "Servo 1", "RX2" -> "Serial RX 2"
 * -- reference-design-independent, so it works the same on any board.
 * Falls back to the key itself for anything unrecognised.
 * @param {string} option
 * @returns {string}
 */
export function expandOptionName(option) {
  if (option === "LED") return "LED Strip";

  const match = option.match(OPTION_KEY_RE);
  if (!match) return option;

  const [, prefix, index] = match;
  const name = PREFIX_NAMES[prefix];
  return name ? `${name} ${index}` : option;
}
