/**
 * File: src/js/boardview/label_layout.js
 * Places the text next to the pads without letting it collide.
 *
 * Pads on a flight controller are 2.54 mm apart and their labels are
 * wider than that, so drawing each label at its pad's own coordinate
 * stacks them on top of each other -- the exact fault reported against
 * the first wiring drawing. Instead every label is pushed out to the
 * margin beside the view and then spread along that margin: the order
 * is preserved, the minimum gap is enforced, and a label that had to
 * move gets a leader line back to its pad so it still reads as
 * belonging to it.
 *
 * Pure geometry, no DOM: the drawing renders what this returns, and
 * the tests check that nothing overlaps.
 */

/** Text metrics, in millimetre units, matching the drawing's font sizes. */
export const LABEL_FONT = 2.1;
export const SUB_FONT = 1.7;
/** Baseline-to-baseline distance from a label to its second line. */
export const SUB_OFFSET = 2.5;
/** Rough advance width per character, as a fraction of the font size. */
const CHAR_WIDTH = 0.56;
/** Smallest gap between two labels' boxes. */
const MIN_GAP = 0.6;
/** How far outside the board the label column sits. */
const LABEL_OFFSET = 3.2;

/**
 * Estimated width of a line of text in millimetre units.
 * @param {string} text
 * @param {number} font
 * @returns {number}
 */
export function textWidth(text, font = LABEL_FONT) {
  return (text ?? "").length * font * CHAR_WIDTH;
}

/**
 * Spreads positions along one axis so that consecutive items keep at
 * least `sizes[i]` of room, preserving the given order and staying
 * inside [min, max] when it can.
 * @param {number[]} desired preferred centres, any order
 * @param {number[]} sizes extent of each item along the axis
 * @param {number} min
 * @param {number} max
 * @returns {number[]} resolved centres, matching `desired` by index
 */
export function spreadAlong(desired, sizes, min, max) {
  const order = desired.map((value, index) => index).sort((a, b) => desired[a] - desired[b]);
  const placed = new Array(desired.length);

  // Forward: never let an item start before the previous one ended.
  let cursor = min;
  for (const index of order) {
    const half = sizes[index] / 2;
    const centre = Math.max(desired[index], cursor + half);
    placed[index] = centre;
    cursor = centre + half + MIN_GAP;
  }

  // Backward: if the run overflowed the far end, pull it back in. The
  // block may end up wider than the space, in which case it simply
  // overhangs symmetrically rather than piling up at one end.
  let limit = max;
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const index = order[i];
    const half = sizes[index] / 2;
    placed[index] = Math.min(placed[index], limit - half);
    limit = placed[index] - half - MIN_GAP;
  }

  return placed;
}

/**
 * Which edge a pad labels towards when the profile does not say.
 * Nearest edge wins, so a corner pad reads along the edge it is on.
 * @param {{x: number, y: number}} pad
 * @param {{width: number, height: number}} view
 * @returns {'left'|'right'|'above'|'below'}
 */
export function nearestEdge(pad, view) {
  const candidates = [
    ["left", pad.x],
    ["right", view.width - pad.x],
    ["above", pad.y],
    ["below", view.height - pad.y],
  ];
  candidates.sort((a, b) => a[1] - b[1]);
  return candidates[0][0];
}

/**
 * How much room, in millimetres, the labels need outside each edge of
 * the view. A fixed margin either clips a long label ("UART1 · Serial
 * receiver" is 19 characters) or wastes space on a board that has
 * none, so the drawing measures instead and sizes its own viewBox.
 *
 * @param {Object} args same `view`, `items`, `margin` and `clearance`
 *        as layoutLabels, so the two agree about where text goes
 * @returns {{left: number, right: number, top: number, bottom: number}}
 */
export function measureMargins({
  view,
  items,
  margin = { x: 15, y: 9 },
  clearance = {},
}) {
  const out = { left: 0, right: 0, top: 0, bottom: 0 };
  const widest = { above: 0, below: 0 };
  let hasVertical = false;

  for (const item of items) {
    const side =
      !item.side || item.side === "auto" ? nearestEdge(item, view) : item.side;
    const width = Math.max(
      textWidth(item.text, LABEL_FONT),
      textWidth(item.sub ?? "", SUB_FONT),
    );
    const offset = LABEL_OFFSET + (clearance[side] ?? 0);

    if (side === "left" || side === "right") {
      hasVertical = true;
      out[side] = Math.max(out[side], width + offset);
    } else {
      const depth = offset + LABEL_FONT + (item.sub ? SUB_OFFSET : 0);
      out[side === "above" ? "top" : "bottom"] = Math.max(
        out[side === "above" ? "top" : "bottom"],
        depth,
      );
      widest[side] = Math.max(widest[side], width);
    }
  }

  // A top or bottom label can slide sideways past the board's corner,
  // and a side label can slide above or below it.
  const overhangX = Math.max(widest.above, widest.below) / 2;
  if (overhangX) {
    out.left = Math.max(out.left, overhangX);
    out.right = Math.max(out.right, overhangX);
  }
  if (hasVertical) {
    out.top = Math.max(out.top, margin.y);
    out.bottom = Math.max(out.bottom, margin.y);
  }

  // A little air so nothing touches the edge of the box.
  for (const key of Object.keys(out)) out[key] = Math.ceil(out[key] + 1);
  return out;
}

/**
 * Lays out one label per item.
 *
 * @param {Object} args
 * @param {{width: number, height: number}} args.view
 * @param {{id: string, x: number, y: number, text: string, sub?: ?string,
 *          side?: 'left'|'right'|'above'|'below'|'auto'}[]} args.items
 * @param {{x: number, y: number}} [args.margin] room outside the view
 *        the labels may use
 * @param {{left?: number, right?: number, above?: number, below?: number}}
 *        [args.clearance] extra distance to hold off an edge, for
 *        whatever already sticks out of it -- the USB connector, in
 *        practice, which otherwise sits under the top row's labels
 * @returns {{id: string, x: number, y: number, anchor: 'start'|'middle'|'end',
 *           side: string, moved: boolean, leader: ?number[][]}[]}
 */
export function layoutLabels({
  view,
  items,
  margin = { x: 15, y: 9 },
  clearance = {},
}) {
  const resolved = items.map((item) => ({
    ...item,
    side:
      !item.side || item.side === "auto" ? nearestEdge(item, view) : item.side,
  }));

  const out = [];

  for (const side of ["left", "right", "above", "below"]) {
    const group = resolved.filter((item) => item.side === side);
    if (!group.length) continue;

    const vertical = side === "left" || side === "right";
    // Down a side, labels are spread by height, and a label with a
    // second line is more than twice as tall as one without. Getting
    // this wrong is what let a two-line label land on its neighbour.
    const sizes = group.map((item) =>
      vertical
        ? item.sub
          ? LABEL_FONT * 0.8 + SUB_OFFSET + SUB_FONT * 0.3
          : LABEL_FONT + 0.5
        : Math.max(
            textWidth(item.text, LABEL_FONT),
            textWidth(item.sub ?? "", SUB_FONT),
          ),
    );

    const desired = group.map((item) => (vertical ? item.y : item.x));
    const min = vertical ? -margin.y : -margin.x;
    const max = vertical ? view.height + margin.y : view.width + margin.x;
    const placed = spreadAlong(desired, sizes, min, max);

    group.forEach((item, index) => {
      const along = placed[index];
      let x;
      let y;
      let anchor;

      const offset = LABEL_OFFSET + (clearance[side] ?? 0);
      if (side === "left") {
        x = -offset;
        y = along;
        anchor = "end";
      } else if (side === "right") {
        x = view.width + offset;
        y = along;
        anchor = "start";
      } else if (side === "above") {
        x = along;
        y = -offset;
        anchor = "middle";
      } else {
        x = along;
        y = view.height + offset;
        anchor = "middle";
      }

      // A leader is only worth drawing when the label is not already
      // sitting on the pad's own line.
      const drift = Math.abs(along - (vertical ? item.y : item.x));
      const moved = drift > 0.35;

      out.push({
        id: item.id,
        x,
        y: vertical ? y + LABEL_FONT * 0.35 : y,
        anchor,
        side,
        moved,
        leader: moved
          ? [
              [item.x, item.y],
              vertical ? [x + (side === "left" ? 1 : -1), y] : [x, y],
            ]
          : null,
      });
    });
  }

  // Back into the caller's order, so the drawing can zip items and
  // labels together.
  const byId = new Map(out.map((label) => [label.id, label]));
  return items.map((item) => byId.get(item.id));
}
