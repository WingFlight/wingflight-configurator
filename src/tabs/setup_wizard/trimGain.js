// Pure helpers for the Setup Wizard's Trim and gain step: the adjustment
// ranges it writes (firmware fc/rc_adjustments.c) and reading them back.

// Enable channel meaning "always on" (ALWAYS_ON_CH in
// tabs/adjustments/util.js; not imported so the tests can load this file).
const ALWAYS_ON_CH = 255;

// Adjustment functions, roll/pitch/yaw (fc/rc_adjustments.h).
export const SERVO_TRIM = { roll: 89, pitch: 90, yaw: 91 };
export const MASTER_GAIN = { roll: 85, pitch: 84, yaw: 86 };

// Values the full channel travel maps to. A trim channel at center adds
// nothing; a gain knob at center is 100%.
export const TRIM_US = 100;
export const GAIN_MIN = 50;
export const GAIN_MAX = 150;

const CHANNEL_LOW = 1000;
const CHANNEL_HIGH = 2000;

// An always-on, mapped ("absolute") range: the position of AUX channel
// `aux` (0 = AUX1) is the value, from `min` at 1000 us to `max` at 2000 us.
// A mapped servo trim is runtime-only in the firmware: it follows the
// channel and is never saved, so the radio keeps the trim, as with stick
// trims.
export function mappedRange(adjFunction, aux, min, max) {
  return {
    adjFunction,
    enaChannel: ALWAYS_ON_CH,
    enaRange: { start: 1500, end: 1500 },
    adjChannel: aux,
    adjRange1: { start: CHANNEL_LOW, end: CHANNEL_HIGH },
    adjRange2: { start: 1500, end: 1500 },
    adjMin: min,
    adjMax: max,
    adjStep: 0,
  };
}

export function trimRange(axis, aux) {
  return mappedRange(SERVO_TRIM[axis], aux, -TRIM_US, TRIM_US);
}

export function gainRange(axis, aux) {
  return mappedRange(MASTER_GAIN[axis], aux, GAIN_MIN, GAIN_MAX);
}

// The slot already holding `adjFunction`, else the first free one, else -1.
export function slotFor(ranges, adjFunction) {
  const own = ranges.findIndex((r) => r?.adjFunction === adjFunction);
  if (own >= 0) return own;
  return ranges.findIndex((r) => !r || r.adjFunction === 0);
}

// The AUX channel driving `adjFunction`, or null.
export function channelOf(ranges, adjFunction) {
  const range = ranges.find((r) => r?.adjFunction === adjFunction);
  return range ? range.adjChannel : null;
}

// How the gain is set up now: "single" (all three axes on one channel),
// "separate", or "none".
export function gainMode(ranges) {
  const channels = Object.values(MASTER_GAIN).map((f) =>
    channelOf(ranges, f),
  );
  if (channels.every((c) => c === null)) return "none";
  return channels.every((c) => c === channels[0]) ? "single" : "separate";
}

// The value a mapped range gives for a channel position (us), as the
// firmware computes it.
export function mappedValue(range, position) {
  const width = range.adjRange1.end - range.adjRange1.start;
  const span = range.adjMax - range.adjMin;
  if (!(width > 0) || !(span > 0)) return range.adjMin;
  const value =
    range.adjMin +
    Math.floor(
      ((position - range.adjRange1.start) * span + width / 2) / width,
    );
  return Math.max(range.adjMin, Math.min(range.adjMax, value));
}
