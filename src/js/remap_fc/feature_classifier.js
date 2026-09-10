/**
 * File: src/js/remap_fc/feature_classifier.js
 * Classifies a remap_table.js option key (e.g. "M1", "S3", "Freq2",
 * "LED") into the broad feature type the timer/DMA allocators reason
 * about, defines the groups of options that prefer to share a timer
 * base with each other, and -- Wingflight addition -- rates how
 * critical a pad's function is to keeping the aircraft flying, using
 * the surface roles the mixer already knows.
 *
 * Ported from Rotorflight Configurator PR #433; classifyCriticality and
 * the surfaceRoles handling are new.
 */

// Wingflight firmware caps: MAX_SUPPORTED_MOTORS is 4 and
// MAX_SUPPORTED_PWM_SERVOS is 8 (src/main/target/common_defaults_post.h).
// Anything beyond that is never a real output, so it's classified as
// "other" and never allocated a timer.
const MOTOR_RE = /^M[1-4]$/;
const SERVO_RE = /^S[1-8]$/;
const FREQ_RE = /^Freq\d+$/;

/**
 * Classifies an option key into "motor", "servo", "freq", "led", or
 * "other" -- the categories the timer allocator's base-exclusivity and
 * critical-base rules are keyed on.
 * @param {string} optionKey
 * @returns {"motor"|"servo"|"freq"|"led"|"other"}
 */
export function classifyFeature(optionKey) {
  if (MOTOR_RE.test(optionKey)) return "motor";
  if (SERVO_RE.test(optionKey)) return "servo";
  if (FREQ_RE.test(optionKey)) return "freq";
  if (optionKey === "LED") return "led";
  return "other";
}

// Groups that prefer to share a common timer base with unique
// channels on it, tried together before falling back to allocating
// their members individually. See timer_allocator.js's tryGroup.
export const SERVO_GROUP = ["S1", "S2", "S3"];
export const MOTOR_GROUP = ["M1", "M2", "M3", "M4"];

// Feature types whose DMA claim takes priority over every other type
// when two features want the same DMA stream/channel -- motors and
// the LED strip are the outputs most sensitive to DMA contention.
export const HIGH_DMA_PRIORITY_TYPES = new Set(["motor", "led"]);

// Feature types this tool actually tracks or claims DMA for at all.
// Every motor is conservatively assumed to need DMA (DSHOT), the same
// as the LED strip always does. A servo is always plain PWM and a
// frequency input is plain input capture, so neither ever uses DMA.
export const DMA_MANAGED_TYPES = new Set(["motor", "led"]);

/**
 * Whether this tool should track/claim DMA for this feature at all --
 * see DMA_MANAGED_TYPES.
 * @param {string} optionKey
 * @returns {boolean}
 */
export function featureNeedsDma(optionKey) {
  return DMA_MANAGED_TYPES.has(classifyFeature(optionKey));
}

/**
 * @typedef {"critical"|"important"|"minor"} Criticality
 */

// Mixer/airframe roles that are primary flight controls: losing one
// in flight means losing control of an axis (or all thrust).
const CRITICAL_ROLES = new Set([
  "aileron",
  "elevon",
  "elevator",
  "rudder",
  "ruddervator",
  "throttle",
  "motor",
]);

// Roles that matter but whose loss is survivable: flaps, thrust
// vectoring, airbrakes, and receiver/telemetry links.
const IMPORTANT_ROLES = new Set([
  "flap",
  "flaps",
  "flaperon",
  "airbrake",
  "thrust_vector",
  "thrustvector",
  "tv",
  "rx",
  "receiver",
  "gps",
  "telemetry",
]);

// Option-key prefixes that are peripherals rather than surfaces.
const RX_LINK_KEY_RE = /^(RX|TX|PPM|PWM)\d*$/;
const SENSOR_KEY_RE = /^(Vbat|Curr|RSSI|Vext|SDA\d+|SCL\d+|Freq\d+)$/;

function normaliseRole(role) {
  return String(role ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Rates how critical the function on a pad is.
 *
 * With a `surfaceRoles` map (option key -> airframe role, e.g.
 * `{ S1: "aileron", M1: "throttle" }`, as the mixer's rules already
 * imply) the role decides: primary flight controls are "critical",
 * flaps/thrust vector/RX links are "important", everything else
 * "minor". Without a role for the key, the key's own type is used
 * instead: a motor is a throttle by nature (critical), a servo moves
 * something the mixer will drive (important), a receiver/PWM/PPM link
 * is important, sensors/I2C/frequency inputs are minor, and the LED
 * strip is minor.
 * @param {string} optionKey
 * @param {Object.<string, string>} [surfaceRoles]
 * @returns {Criticality}
 */
export function classifyCriticality(optionKey, surfaceRoles = {}) {
  const role = normaliseRole(surfaceRoles?.[optionKey]);
  if (role) {
    if (CRITICAL_ROLES.has(role)) return "critical";
    if (IMPORTANT_ROLES.has(role)) return "important";
    return "minor";
  }

  const type = classifyFeature(optionKey);
  if (type === "motor") return "critical";
  if (type === "servo") return "important";
  if (RX_LINK_KEY_RE.test(optionKey)) return "important";
  if (SENSOR_KEY_RE.test(optionKey)) return "minor";
  return "minor";
}

/**
 * Convenience wrapper: true when classifyCriticality says "critical".
 * @param {string} optionKey
 * @param {Object.<string, string>} [surfaceRoles]
 * @returns {boolean}
 */
export function isCriticalFeature(optionKey, surfaceRoles = {}) {
  return classifyCriticality(optionKey, surfaceRoles) === "critical";
}
