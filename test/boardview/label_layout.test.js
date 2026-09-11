import { describe, expect, it } from "vitest";

import {
  LABEL_FONT,
  layoutLabels,
  measureMargins,
  nearestEdge,
  spreadAlong,
  textWidth,
} from "@/js/boardview/label_layout.js";

const view = { width: 56, height: 36 };

describe("nearestEdge", () => {
  it("sends a pad to the edge it is closest to", () => {
    expect(nearestEdge({ x: 2, y: 18 }, view)).toBe("left");
    expect(nearestEdge({ x: 54, y: 18 }, view)).toBe("right");
    expect(nearestEdge({ x: 28, y: 1 }, view)).toBe("above");
    expect(nearestEdge({ x: 28, y: 35 }, view)).toBe("below");
  });

  it("reads a corner pad along the edge it sits on", () => {
    // 1 mm from the top, 3 mm from the left: it belongs to the top.
    expect(nearestEdge({ x: 3, y: 1 }, view)).toBe("above");
  });
});

describe("spreadAlong", () => {
  it("keeps items in order and apart", () => {
    const desired = [10, 10.2, 10.4, 10.6];
    const sizes = [2, 2, 2, 2];
    const placed = spreadAlong(desired, sizes, -10, 50);
    for (let i = 1; i < placed.length; i += 1) {
      expect(placed[i]).toBeGreaterThan(placed[i - 1]);
      expect(placed[i] - placed[i - 1]).toBeGreaterThanOrEqual(2);
    }
  });

  it("pulls a run that overflowed back inside the space", () => {
    const desired = [45, 46, 47, 48];
    const placed = spreadAlong(desired, [4, 4, 4, 4], 0, 50);
    expect(Math.max(...placed) + 2).toBeLessThanOrEqual(50.001);
  });

  it("leaves items that already fit where they asked to be", () => {
    expect(spreadAlong([5, 20, 35], [2, 2, 2], 0, 40)).toEqual([5, 20, 35]);
  });
});

describe("textWidth", () => {
  it("grows with the text", () => {
    expect(textWidth("UART1", LABEL_FONT)).toBeGreaterThan(
      textWidth("T1", LABEL_FONT),
    );
  });
});

describe("layoutLabels", () => {
  // Eight pads at the real 2.54 mm header pitch down the left edge:
  // the case that stacked labels on top of one another before.
  const items = Array.from({ length: 8 }, (_, index) => ({
    id: `pad${index}`,
    x: 3,
    y: 6 + index * 2.54,
    text: `T${index + 1}`,
    sub: "UART1 · MSP",
  }));

  it("returns one label per item, in the order given", () => {
    const labels = layoutLabels({ view, items });
    expect(labels.map((label) => label.id)).toEqual(items.map((i) => i.id));
  });

  it("never lets two labels on one edge overlap", () => {
    const labels = layoutLabels({ view, items });
    const ys = labels.map((label) => label.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i += 1) {
      // Each label is two stacked lines, so it needs more than one
      // font's worth of room.
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(LABEL_FONT);
    }
  });

  it("draws a leader back to any pad whose label had to move", () => {
    const labels = layoutLabels({ view, items });
    const moved = labels.filter((label) => label.moved);
    expect(moved.length).toBeGreaterThan(0);
    for (const label of moved) {
      expect(label.leader).toHaveLength(2);
    }
  });

  it("anchors each side's text away from the board", () => {
    const labels = layoutLabels({
      view,
      items: [
        { id: "l", x: 2, y: 18, text: "A" },
        { id: "r", x: 54, y: 18, text: "B" },
        { id: "t", x: 28, y: 1, text: "C" },
      ],
    });
    const byId = Object.fromEntries(labels.map((label) => [label.id, label]));
    expect(byId.l.anchor).toBe("end");
    expect(byId.l.x).toBeLessThan(0);
    expect(byId.r.anchor).toBe("start");
    expect(byId.r.x).toBeGreaterThan(view.width);
    expect(byId.t.anchor).toBe("middle");
    expect(byId.t.y).toBeLessThan(0);
  });

  it("honours a side the profile fixed by hand", () => {
    const [label] = layoutLabels({
      view,
      items: [{ id: "p", x: 2, y: 18, text: "A", side: "below" }],
    });
    expect(label.side).toBe("below");
  });
});

describe("measureMargins", () => {
  it("makes room for the widest label on each side", () => {
    const narrow = measureMargins({
      view,
      items: [{ id: "a", x: 2, y: 18, text: "T1" }],
    });
    const wide = measureMargins({
      view,
      items: [
        { id: "a", x: 2, y: 18, text: "T1", sub: "UART1 · S.Port telemetry" },
      ],
    });
    expect(wide.left).toBeGreaterThan(narrow.left);
  });

  it("holds off an edge that something already sticks out of", () => {
    const items = [{ id: "a", x: 28, y: 1, text: "Vbat", sub: "ADC_BATT 1" }];
    const plain = measureMargins({ view, items });
    const withUsb = measureMargins({ view, items, clearance: { above: 3.6 } });
    expect(withUsb.top - plain.top).toBeGreaterThanOrEqual(3);
  });

  it("leaves room sideways for a top label that overhangs the corner", () => {
    const margins = measureMargins({
      view,
      items: [{ id: "a", x: 1, y: 1, text: "A very long pad name", side: "above" }],
    });
    expect(margins.left).toBeGreaterThan(4);
  });

  it("keeps every label inside the box it reports", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      id: `pad${index}`,
      x: 3,
      y: 6 + index * 2.54,
      text: `T${index + 1}`,
      sub: "UART1 · S.Port telemetry",
    }));
    const margins = measureMargins({ view, items });
    const labels = layoutLabels({ view, items });
    for (const label of labels) {
      expect(label.x).toBeGreaterThanOrEqual(-margins.left);
      expect(label.y).toBeGreaterThanOrEqual(-margins.top);
      expect(label.y).toBeLessThanOrEqual(view.height + margins.bottom);
    }
  });
});
