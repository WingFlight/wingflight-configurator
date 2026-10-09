// Pure helpers for the Setup Wizard's Trim and gain step: the adjustment
// ranges it writes (firmware fc/rc_adjustments.c) and reading them back.

// Enable channel meaning "always on" (ALWAYS_ON_CH in
// tabs/adjustments/util.js; not imported so the tests can load this file).
const ALWAYS_ON_CH = 255;

// Adjustment functions, roll/pitch/yaw (fc/rc_adjustments.h).
export const SERVO_TRIM = { roll: 89, pitch: 90, yaw: 91 };
export const MASTER_GAIN = { roll: 85, pitch: 84, yaw: 86 };

// Values the full channel travel maps to. A trim channel at center adds
// nothing. A gain knob covers 0-150% master gain: fully down turns the
// stabilizer off and center is 75%. Pilots found the default gains too hot
// much above 100%, so the knob's top end stops at 150% (the firmware
// allows 200%), leaving finer control over the useful part.
export const TRIM_US = 100;
export const GAIN_MIN = 0;
export const GAIN_MAX = 150;

// The channel span mapped onto min-max: 25 us past 1000-2000 at each end
// (ranges are stored in 25 us steps), so a radio's full travel (about
// 988-2012 us) stays inside the range and reaches both ends. Centered on
// 1500, so a centered knob or trim gives the middle value.
const CHANNEL_LOW = 975;
const CHANNEL_HIGH = 2025;

// An always-on, mapped ("absolute") range: the position of AUX channel
// `aux` (0 = AUX1) is the value, from `min` at CHANNEL_LOW to `max` at
// CHANNEL_HIGH.
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

//// Stepped trim from the trim buttons, all on one channel (Ethos).
//
// One free mix on a spare channel: source Maximum, operation Add, and an
// action per trim button that sets the mix weight while the button is
// pressed. Each button then puts its own value on the channel, and three
// stepped ranges tell them apart. A press steps the flight controller's
// saved trim; the radio itself keeps no trim. The weights are the ones in
// the guide's screenshots, so what the guide shows is what is detected.

// Trim per press, us. Holding a button repeats.
export const STEPPED_TRIM_STEP = 2;
// The furthest a stepped trim may go (the adjustment's own limit; the FC
// also limits each servo's trim to 20% of its scale).
export const STEPPED_TRIM_US = 200;

// dir -1 steps the trim down (the range's first sub-range), +1 up.
export const TRIM_BUTTONS = [
  { button: "T4 Left", axis: "yaw", dir: -1, weight: 30 },
  { button: "T4 Right", axis: "yaw", dir: 1, weight: 40 },
  { button: "T2 Down", axis: "pitch", dir: 1, weight: 50 },
  { button: "T2 Up", axis: "pitch", dir: -1, weight: 60 },
  { button: "T1 Left", axis: "roll", dir: -1, weight: 70 },
  { button: "T1 Right", axis: "roll", dir: 1, weight: 80 },
];

// Channel value for a mix weight of the Maximum source: 100% is 1500 +
// 512 us on Ethos.
export function buttonValue(weight) {
  return 1500 + weight * 5.12;
}

// Ranges are stored in 5 us steps (STEP_TO_CHANNEL_VALUE, fc/rc_modes.h).
function roundToStep(us) {
  return Math.round(us / 5) * 5;
}

// The channel window each button's value falls in: from half-way to the
// button below to half-way to the one above (the same half-gap past the
// first and last), so neighbouring windows meet without overlapping.
export function buttonWindow(index) {
  const values = TRIM_BUTTONS.map((b) => buttonValue(b.weight));
  const value = values[index];
  const below = index > 0 ? values[index - 1] : 2 * value - values[index + 1];
  const above =
    index < values.length - 1 ? values[index + 1] : 2 * value - values[index - 1];
  return {
    start: roundToStep((below + value) / 2),
    end: roundToStep((value + above) / 2),
  };
}

// The button the channel is showing at `position` (us), or null.
export function buttonAt(position) {
  if (!(position > 0)) return null;
  const index = TRIM_BUTTONS.findIndex((_, i) => {
    const window = buttonWindow(i);
    return position >= window.start && position < window.end;
  });
  return index >= 0 ? TRIM_BUTTONS[index] : null;
}

// An always-on stepped range for `axis` on AUX channel `aux`: its trim-down
// button's window steps down, its trim-up button's window steps up.
export function steppedTrimRange(axis, aux) {
  const window = (dir) =>
    buttonWindow(
      TRIM_BUTTONS.findIndex((b) => b.axis === axis && b.dir === dir),
    );
  return {
    adjFunction: SERVO_TRIM[axis],
    enaChannel: ALWAYS_ON_CH,
    enaRange: { start: 1500, end: 1500 },
    adjChannel: aux,
    adjRange1: window(-1),
    adjRange2: window(1),
    adjMin: -STEPPED_TRIM_US,
    adjMax: STEPPED_TRIM_US,
    adjStep: STEPPED_TRIM_STEP,
  };
}

// How the trims are set up now: "buttons" (stepped), "programmable"
// (mapped, a channel each) or null.
export function trimMode(ranges) {
  const trims = Object.values(SERVO_TRIM)
    .map((f) => ranges.find((r) => r?.adjFunction === f))
    .filter(Boolean);
  if (trims.length === 0) return null;
  return trims.some((r) => r.adjStep > 0) ? "buttons" : "programmable";
}
