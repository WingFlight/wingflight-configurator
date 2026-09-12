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
/**
 * Advance width per character, as a fraction of the font size. There is
 * no way to measure text without a DOM here, so this is an estimate,
 * and it has to be a generous one: underestimating makes labels
 * overlap, which is the fault this module exists to prevent, while
 * overestimating only spreads them a little further apart.
 *
 * Measured against the app's own font on a row of "MOTOR n" labels,
 * where 0.56 came out 15% short.
 */
const CHAR_WIDTH = 0.66;
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
 * Spreads positions along one axis so that consecutive items keep
 * their room, preserving the given order and staying inside
 * [min, max] when it can.
 *
 * Extents are given per side of the anchor, because a label is not
 * centred on it: a two-line label reaches barely above its baseline
 * and a whole second line below. Treating that as symmetric is what
 * let a tall label overlap the short one beneath it.
 *
 * @param {number[]} desired preferred anchors, any order
 * @param {({before: number, after: number}|number)[]} extents how far
 *        each item reaches either side of its anchor; a bare number is
 *        read as symmetric, half each way
 * @param {number} min
 * @param {number} max
 * @returns {number[]} resolved anchors, matching `desired` by index
 */
export function spreadAlong(desired, extents, min, max) {
  const reach = extents.map((extent) =>
    typeof extent === "number"
      ? { before: extent / 2, after: extent / 2 }
      : extent,
  );
  const order = desired
    .map((value, index) => index)
    .sort((a, b) => desired[a] - desired[b]);
  const placed = new Array(desired.length);

  // Forward: never let an item start before the previous one ended.
  let cursor = min;
  for (const index of order) {
    const anchor = Math.max(desired[index], cursor + reach[index].before);
    placed[index] = anchor;
    cursor = anchor + reach[index].after + MIN_GAP;
  }

  // Backward: if the run overflowed the far end, pull it back in. The
  // block may end up longer than the space, in which case it simply
  // overhangs rather than piling up at one end.
  let limit = max;
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const index = order[i];
    placed[index] = Math.min(placed[index], limit - reach[index].after);
    limit = placed[index] - reach[index].before - MIN_GAP;
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
 * The box a laid-out label occupies, in view millimetres.
 * @param {Object} label from layoutLabels
 * @param {{text: string, sub?: ?string}} item the label's own item
 * @returns {{left: number, right: number, top: number, bottom: number}}
 */
function labelBox(label, item) {
  const width = Math.max(
    textWidth(item.text, LABEL_FONT),
    textWidth(item.sub ?? "", SUB_FONT),
  );
  const left =
    label.anchor === "start"
      ? label.x
      : label.anchor === "end"
        ? label.x - width
        : label.x - width / 2;
  return {
    left,
    right: left + width,
    top: label.y - LABEL_FONT * 0.8,
    bottom: label.y + (item.sub ? SUB_OFFSET : 0) + SUB_FONT * 0.3,
  };
}

/**
 * How much room the labels need outside each edge of the view.
 *
 * Measured from the labels as actually laid out, not estimated from
 * the items: a crowded edge pushes labels sideways past the corner by
 * however much it takes, and guessing that distance is what let them
 * run off the drawing.
 *
 * @param {Object} args
 * @param {{width: number, height: number}} args.view
 * @param {Object[]} args.items the same items given to layoutLabels
 * @param {Object[]} args.labels what layoutLabels returned for them
 * @returns {{left: number, right: number, top: number, bottom: number}}
 */
export function marginsForLabels({ view, items, labels }) {
  const out = { left: 0, right: 0, top: 0, bottom: 0 };
  labels.forEach((label, index) => {
    if (!label) return;
    const box = labelBox(label, items[index]);
    out.left = Math.max(out.left, -box.left);
    out.right = Math.max(out.right, box.right - view.width);
    out.top = Math.max(out.top, -box.top);
    out.bottom = Math.max(out.bottom, box.bottom - view.height);
  });
  // A little air so nothing touches the edge of the box.
  for (const key of Object.keys(out)) {
    out[key] = Math.max(0, Math.ceil(out[key] + 1));
  }
  return out;
}

/**
 * The margins a set of items will need, laying them out to find out.
 * Callers that already have the labels should use marginsForLabels.
 * @param {Object} args as layoutLabels
 * @returns {{left: number, right: number, top: number, bottom: number}}
 */
export function measureMargins(args) {
  return marginsForLabels({
    view: args.view,
    items: args.items,
    labels: layoutLabels(args),
  });
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
    // Down a side, labels are spread by height, and a label reaches
    // further below its baseline than above it when it carries a
    // second line. Across the top or bottom they are spread by width,
    // which is symmetric because that text is centred.
    const extents = group.map((item) => {
      if (!vertical) {
        const half =
          Math.max(
            textWidth(item.text, LABEL_FONT),
            textWidth(item.sub ?? "", SUB_FONT),
          ) / 2;
        return { before: half, after: half };
      }
      return {
        before: LABEL_FONT * 0.8,
        after: (item.sub ? SUB_OFFSET : 0) + SUB_FONT * 0.5,
      };
    });

    const desired = group.map((item) => (vertical ? item.y : item.x));
    const min = vertical ? -margin.y : -margin.x;
    const max = vertical ? view.height + margin.y : view.width + margin.x;
    const placed = spreadAlong(desired, extents, min, max);

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
