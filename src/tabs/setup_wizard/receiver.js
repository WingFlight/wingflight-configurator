// Pure helpers for the Setup Wizard's Receiver step: channel order labels
// and detecting the order from which channel moves for each stick.
//
// RC_MAP[function] = receiver channel, functions in the order roll, pitch,
// yaw, throttle, aux 1-4 (firmware rxConfig()->rcmap).

// Letters for roll, pitch, yaw, throttle, as in "AETR".
const LETTERS = ["A", "E", "R", "T"];

// The order as the receiver sends it, e.g. [0, 1, 3, 2, ...] -> "AETR1234".
export function orderLabel(map) {
  let label = "";
  for (let channel = 0; channel < map.length; channel++) {
    const fn = map.indexOf(channel);
    label += fn < 0 ? "-" : fn < 4 ? LETTERS[fn] : String(fn - 3);
  }
  return label;
}

// A full map from the channels found for roll, pitch, yaw and throttle (in
// that order); the aux functions take the remaining channels in order.
export function mapFromDetected(found, length) {
  const rest = [];
  for (let channel = 0; channel < length; channel++) {
    if (!found.includes(channel)) rest.push(channel);
  }
  return [...found, ...rest].slice(0, length);
}

// Minimum movement (us) that counts as "this stick moved", and how much
// further it must have moved than any other channel.
export const DETECT_MIN_US = 300;
const DETECT_RATIO = 2;

// Given each channel's largest movement from its starting value so far,
// the one channel that clearly moved, or -1 while it isn't clear yet.
// Channels in `exclude` (already found) are ignored. `minUs` is lower for
// a radio trim, which moves its channel only a little.
export function movedChannel(peaks, exclude = [], minUs = DETECT_MIN_US) {
  let best = -1;
  let second = 0;
  for (let channel = 0; channel < peaks.length; channel++) {
    if (exclude.includes(channel)) continue;
    const peak = peaks[channel];
    if (best < 0 || peak > peaks[best]) {
      if (best >= 0) second = Math.max(second, peaks[best]);
      best = channel;
    } else {
      second = Math.max(second, peak);
    }
  }
  if (best < 0 || peaks[best] < minUs) return -1;
  return peaks[best] >= second * DETECT_RATIO ? best : -1;
}
