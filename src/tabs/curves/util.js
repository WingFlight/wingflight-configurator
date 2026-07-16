// Map between curve units and the SVG viewBox, y-flipped since SVG y grows
// downward but a curve's y should grow up. Inset by PADDING so points at the
// extreme corners aren't clipped by the viewBox edge (a point sitting
// exactly on the boundary would only be half/quarter-visible, and barely
// clickable). The plot area itself is PLOT_SIZE square, offset right by
// GUTTER_X and with GUTTER_Y of extra room below - reserved margin for the
// axis tick value labels so the scale is always legible, not just implied
// by unlabeled gridlines.
export const PLOT_SIZE = 400;
export const PADDING = 20;
export const GUTTER_X = 34;
export const GUTTER_Y = 16;
export const PLOT_INNER = PLOT_SIZE - PADDING * 2;

// Evenly spaced tick positions across [min, max], plus the axis's meaningful
// reference value (e.g. 100% for a gain curve, which isn't one of the 5
// evenly spaced points) so it always gets its own labeled gridline rather
// than only showing up when it happens to coincide with one.
export function ticks(min, max, axisValue) {
  const t = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * (max - min));
  if (axisValue !== undefined && !t.includes(axisValue)) {
    t.push(axisValue);
    t.sort((a, b) => a - b);
  }
  return t;
}
