/**
 * File: src/js/remap_fc/reference_design_labels.js
 * Friendly labelling for pins and option keys.
 *
 * In Rotorflight PR #433 this read reference_designs.json (the F7A/
 * F7B/F7C helicopter reference designs). Wingflight replaces that with
 * board profiles (src/tabs/journey/board_profiles.json, see
 * board_profiles.js): one file per board carrying the silkscreen
 * labels *and* the pad coordinates. This module turns a profile into
 * the pin -> label lookups the UI needs, and keeps expandOptionName,
 * the board-independent fallback that spells out an option key's CLI
 * shorthand ("S1" -> "Servo 1").
 *
 * Per the review of the original PR, the silkscreen label never
 * *replaces* the canonical resource name -- see formatPadLabel, which
 * always returns both.
 */

/**
 * Pin -> silkscreen label (e.g. "B07" -> "S1") for a board profile.
 * Empty for an unrecognised board.
 * @param {?import("./board_profiles.js").BoardProfile} profile
 * @returns {Object.<string, string>}
 */
export function buildSilkscreenLabels(profile) {
  const labels = {};
  for (const pad of profile?.pads ?? []) {
    labels[pad.pin.toUpperCase()] = pad.silkscreen;
  }
  return labels;
}

// Pad groups that are fixed onboard wiring rather than reassignable
// connectors. Nothing in the current profiles uses these, but a
// profile author may mark e.g. an onboard barometer's I2C bus as
// "internal" so it's drawn but never offered for reassignment.
const RESERVED_GROUPS = new Set(["internal"]);

/**
 * Pins a profile marks as reserved (group "internal", or `reserved:
 * true` on the pad) -- never offered for reassignment.
 * @param {?import("./board_profiles.js").BoardProfile} profile
 * @returns {Set<string>}
 */
export function buildReservedPins(profile) {
  const pins = new Set();
  for (const pad of profile?.pads ?? []) {
    if (pad.reserved || RESERVED_GROUPS.has(pad.group)) {
      pins.add(pad.pin.toUpperCase());
    }
  }
  return pins;
}

// The full word for an option key's own CLI shorthand prefix.
const PREFIX_NAMES = {
  M: "Motor",
  S: "Servo",
  Freq: "Frequency",
  RX: "Serial RX",
  TX: "Serial TX",
  SDA: "I2C SDA",
  SCL: "I2C SCL",
  PWM: "PWM input",
  PINIO: "PINIO",
};

const SINGLE_NAMES = {
  LED: "LED strip",
  PPM: "PPM input",
  Vbat: "Battery voltage",
  Curr: "Current sensor",
  RSSI: "RSSI input",
  Vext: "External ADC",
  Beeper: "Beeper",
  Cam: "Camera control",
};

const OPTION_KEY_RE = /^([A-Za-z]+)(\d+)$/;

/**
 * Expands a remap_table.js option key's own CLI shorthand into a
 * full, readable name, e.g. "S1" -> "Servo 1", "RX2" -> "Serial RX 2"
 * -- board-independent, so it works the same on any board. Falls back
 * to the key itself for anything unrecognised.
 * @param {string} option
 * @returns {string}
 */
export function expandOptionName(option) {
  if (SINGLE_NAMES[option]) return SINGLE_NAMES[option];

  const match = option.match(OPTION_KEY_RE);
  if (!match) return option;

  const [, prefix, index] = match;
  const name = PREFIX_NAMES[prefix];
  return name ? `${name} ${index}` : option;
}

/**
 * The canonical CLI resource name for an option key, e.g. "S1" ->
 * "SERVO 1", "LED" -> "LED_STRIP 1" -- the spelling the firmware's
 * own `resource` output uses.
 * @param {string} option
 * @returns {string}
 */
export function canonicalResourceName(option) {
  const singles = {
    LED: "LED_STRIP 1",
    PPM: "PPM 1",
    Vbat: "ADC_BATT 1",
    Curr: "ADC_CURR 1",
    RSSI: "ADC_RSSI 1",
    Vext: "ADC_EXT 1",
    Beeper: "BEEPER 1",
    Cam: "CAMERA_CONTROL 1",
  };
  if (singles[option]) return singles[option];

  const match = option.match(OPTION_KEY_RE);
  if (!match) return option;
  const [, prefix, index] = match;
  const tags = {
    M: "MOTOR",
    S: "SERVO",
    Freq: "FREQ",
    RX: "SERIAL_RX",
    TX: "SERIAL_TX",
    SDA: "I2C_SDA",
    SCL: "I2C_SCL",
    PWM: "PWM",
    PINIO: "PINIO",
  };
  return tags[prefix] ? `${tags[prefix]} ${index}` : option;
}

/**
 * The one label format used everywhere a pad is named: silkscreen,
 * pin and canonical resource together, separated by a middle dot,
 * e.g. "S1 · B07 · SERVO 1", or "B07 · SERVO 1" for a pad the profile
 * doesn't name, or "S1 · B07 · unassigned" for an empty pad. Never
 * one substituted for another.
 * @param {Object} args
 * @param {?string} args.silkscreen
 * @param {string} args.pin
 * @param {?string} args.optionKey
 * @param {string} [args.unassignedText]
 * @returns {string}
 */
export function formatPadLabel({
  silkscreen,
  pin,
  optionKey,
  unassignedText = "unassigned",
}) {
  const parts = [];
  if (silkscreen) parts.push(silkscreen);
  parts.push(pin);
  parts.push(optionKey ? canonicalResourceName(optionKey) : unassignedText);
  return parts.join(" · ");
}
