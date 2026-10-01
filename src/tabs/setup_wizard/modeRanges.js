// Mode range for a switch the pilot just flicked from `from` to `to` (us):
// centred on where it landed, reaching half-way back towards where it
// started, and out to the end stop when the switch is at an end. Gives
// 1500-2100 for a 2-position switch and the right band on a 3-position one.
export const CHANNEL_MIN = 900;
export const CHANNEL_MAX = 2100;

export function rangeForSwitch(from, to) {
  const half = Math.abs(to - from) / 2;
  let start = Math.round((to - half) / 25) * 25;
  let end = Math.round((to + half) / 25) * 25;
  if (to > 1900) end = CHANNEL_MAX;
  if (to < 1100) start = CHANNEL_MIN;
  return {
    start: Math.max(CHANNEL_MIN, start),
    end: Math.min(CHANNEL_MAX, end),
  };
}
