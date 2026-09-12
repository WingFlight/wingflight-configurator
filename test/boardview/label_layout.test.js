import { describe, expect, it } from "vitest";

import {
  LABEL_FONT,
  layoutLabels,
  measureMargins,
  titleLines,
  nearestEdge,
  spreadAlong,
  textWidth,
  wrapText,
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

// Reported against the RF007 as "the labels are way off". Both of its
// lettered ports lie flat near the top edge, so every one of their
// labels wanted to be above them: eight labels carrying "Port A ·
// UART4 · not in use" need about 150 mm along a 44 mm edge, and they
// ran off both ends of the drawing and squeezed the board into a third
// of the picture.
describe("an edge that cannot hold its labels", () => {
  const view = { width: 44, height: 34 };
  const flatPort = (id, x, y) =>
    ["TX", "RX", "5V", "GND"].map((text, index) => ({
      id: `${id}:${index}`,
      owner: id,
      x: x + index * 2.6,
      y,
      text,
      sub: index < 2 ? `Port ${id} · UART4 · S.Port telemetry` : null,
      side: "above",
    }));

  const items = [...flatPort("A", 31.75, 5.08), ...flatPort("C", 31.5, 12.19)];

  it("sends the crowd out of the nearer side instead", () => {
    const labels = layoutLabels({ view, items });
    // Both connectors, whole: splitting one across two edges is the
    // fault the connector-side rule exists to prevent.
    expect(labels.map((label) => label.side)).toEqual(items.map(() => "right"));
  });

  it("keeps the drawing near the size of the board", () => {
    const margins = measureMargins({ view, items });
    expect(view.width + margins.left + margins.right).toBeLessThan(
      view.width * 2,
    );
  });

  it("leaves an edge that fits where it is", () => {
    const twoShort = [
      { id: "a", owner: "j", x: 16.5, y: 6.35, text: "AIN", side: "above" },
      { id: "b", owner: "j", x: 19, y: 6.35, text: "GND", side: "above" },
    ];
    const labels = layoutLabels({ view, items: twoShort });
    expect(labels.map((label) => label.side)).toEqual(["above", "above"]);
  });

  it("keeps a stated side while that edge can hold it", () => {
    const pinned = [
      { id: "a", owner: "j", x: 16.5, y: 6.35, text: "AIN", side: "above", movable: false },
      { id: "b", owner: "j", x: 19, y: 6.35, text: "GND", side: "above", movable: false },
    ];
    const labels = layoutLabels({ view, items: pinned });
    expect(labels.every((label) => label.side === "above")).toBe(true);
  });

  it("sheds what the author left free before what they stated", () => {
    const mixed = [
      // Two narrow labels the author pinned above, and a wide port
      // left to the drawing: shedding the port is enough.
      { id: "j:1", owner: "j", x: 16.5, y: 6.35, text: "AIN", side: "above", movable: false },
      { id: "j:2", owner: "j", x: 19, y: 6.35, text: "GND", side: "above", movable: false },
      ...items.filter((item) => item.owner === "C"),
    ];
    const labels = layoutLabels({ view, items: mixed });
    const sideOf = (id) => labels.find((label) => label.id === id).side;
    expect(sideOf("C:0")).toBe("right");
    expect(sideOf("j:1")).toBe("above");
    expect(sideOf("j:2")).toBe("above");
  });

  it("moves even a stated side when nothing else on the edge can give", () => {
    // Both connectors stated, and either one alone is wider than the
    // edge: honouring that would print them on top of each other.
    const pinned = items.map((item) => ({ ...item, movable: false }));
    const labels = layoutLabels({ view, items: pinned });
    expect(labels.some((label) => label.side === "above")).toBe(false);
  });
});

// "Keep them in the same groups as in the connector": a plug's labels
// read as one run, not interleaved with the next plug's. A
// two-position header used to land in the middle of a nine-position
// header's column, which read as one long list of pads.
describe("labels grouped by connector", () => {
  const view = { width: 44, height: 34 };
  const column = (owner, x, fromY, count) =>
    Array.from({ length: count }, (unused, index) => ({
      id: `${owner}:${index + 1}`,
      owner,
      x,
      y: fromY + index * 2.54,
      text: `${owner}${index + 1}`,
      sub: "B00",
      side: "left",
    }));

  // A long header and a short one, both labelling left, and the short
  // one sits halfway down the long one's run.
  const items = [...column("main", 4, 2.8, 9), ...column("aux", 6, 12, 2)];

  it("keeps each connector's labels contiguous", () => {
    const labels = layoutLabels({ view, items });
    const order = labels
      .map((label, index) => ({ owner: items[index].owner, y: label.y }))
      .sort((a, b) => a.y - b.y)
      .map((entry) => entry.owner);
    // Every run of one owner appears once: no owner is re-entered.
    const runs = order.filter((owner, index) => owner !== order[index - 1]);
    expect(runs.length).toBe(new Set(runs).size);
  });

  it("keeps a connector's own labels in the order they run", () => {
    const labels = layoutLabels({ view, items });
    const mainY = items
      .map((item, index) => ({ item, label: labels[index] }))
      .filter((pair) => pair.item.owner === "main")
      .map((pair) => pair.label.y);
    const sorted = [...mainY].sort((a, b) => a - b);
    expect(mainY).toEqual(sorted);
  });

  it("still leaves nothing overlapping", () => {
    const labels = layoutLabels({ view, items });
    const boxes = labels
      .map((label) => ({ top: label.y - 1.7, bottom: label.y + 2.9 }))
      .sort((a, b) => a.top - b.top);
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 0.001);
    }
  });
});

describe("titleLines", () => {
  it("keeps a line break the author typed", () => {
    expect(titleLines("VANTAC\nRF007", 40, LABEL_FONT)).toEqual([
      "VANTAC",
      "RF007",
    ]);
  });

  it("still wraps a piece wider than the board", () => {
    const lines = titleLines("VANTAC\nRF007 airframe edition", 20, LABEL_FONT);
    expect(lines[0]).toBe("VANTAC");
    expect(lines.length).toBeGreaterThan(2);
  });

  it("treats a name with no breaks exactly as wrapping does", () => {
    const text = "Example Wing FC (not a real board)";
    expect(titleLines(text, 20, LABEL_FONT)).toEqual(
      wrapText(text, 20, LABEL_FONT),
    );
  });

  it("drops an empty line rather than drawing a gap", () => {
    expect(titleLines("A\n\nB", 40, LABEL_FONT)).toEqual(["A", "B"]);
    expect(titleLines("", 40)).toEqual([]);
  });
});

describe("wrapText", () => {
  it("leaves text that fits on one line", () => {
    expect(wrapText("Matek H743", 40, LABEL_FONT)).toEqual(["Matek H743"]);
  });

  it("breaks on spaces to fit the width", () => {
    const lines = wrapText(
      "Example Wing FC (not a real board)",
      20,
      LABEL_FONT,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(textWidth(line, LABEL_FONT)).toBeLessThanOrEqual(20);
    }
    expect(lines.join(" ")).toBe("Example Wing FC (not a real board)");
  });

  it("leaves a single long word whole rather than chopping it", () => {
    // A chopped board name is harder to read than a wide one.
    expect(wrapText("VANTAC_RF007_VERY_LONG", 5, LABEL_FONT)).toEqual([
      "VANTAC_RF007_VERY_LONG",
    ]);
  });

  it("has nothing to say about nothing", () => {
    expect(wrapText("", 40)).toEqual([]);
    expect(wrapText(null, 40)).toEqual([]);
    expect(wrapText("   ", 40)).toEqual([]);
  });
});
