import { describe, expect, it } from "vitest";

import {
  CONNECTOR_KINDS,
  DEFAULT_PITCH,
  connectorBounds,
  connectorLabelAnchor,
  connectorLabelSide,
  connectorPads,
  connectorPinPositions,
  emptyConnector,
  netGroup,
  normaliseConnector,
  pinRole,
  serialiseConnector,
} from "@/js/boardview/connectors.js";
import { buildPortMap } from "@/js/boardview/port_map.js";
import {
  normaliseProfile,
  receiverPlacement,
  validateProfile,
} from "@/js/boardview/schema.js";

// A four-way peripheral port, the shape these boards actually use:
// ground, power, and one UART.
const portA = normaliseConnector({
  id: "port-a",
  label: "Port A",
  kind: "port",
  view: "top",
  x: 4,
  y: 10,
  pitch: 2,
  pins: [
    { net: "gnd" },
    { net: "5V" },
    { pin: "b6", silkscreen: "TX" },
    { pin: "B07", silkscreen: "RX" },
    {},
  ],
});

describe("pinRole", () => {
  it("tells a signal, a rail and an empty position apart", () => {
    expect(pinRole({ pin: "B06" })).toBe("signal");
    expect(pinRole({ net: "GND" })).toBe("net");
    expect(pinRole({})).toBe("empty");
    expect(pinRole(null)).toBe("empty");
  });
});

describe("netGroup", () => {
  it("separates ground from every other rail", () => {
    expect(netGroup("GND")).toBe("ground");
    expect(netGroup("gnd")).toBe("ground");
    expect(netGroup("5V")).toBe("power");
    expect(netGroup("VBAT")).toBe("power");
  });
});

describe("normaliseConnector", () => {
  it("numbers positions from one, in the order given", () => {
    expect(portA.pins.map((pin) => pin.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it("canonicalises pins and upper-cases nets", () => {
    expect(portA.pins[0].net).toBe("GND");
    expect(portA.pins[2].pin).toBe("B06");
  });

  // R2: a position carries one thing.
  it("never lets a position be both a pin and a rail", () => {
    const both = normaliseConnector({
      id: "x",
      pins: [{ pin: "B06", net: "GND" }],
    });
    expect(both.pins[0].pin).toBe("B06");
    expect(both.pins[0].net).toBeNull();
  });

  it("takes the pitch its kind conventionally uses", () => {
    for (const kind of CONNECTOR_KINDS) {
      expect(normaliseConnector({ id: "x", kind }).pitch).toBe(
        DEFAULT_PITCH[kind],
      );
    }
  });

  it("round-trips through serialise unchanged", () => {
    const twice = normaliseConnector(serialiseConnector(portA));
    expect(serialiseConnector(twice)).toEqual(serialiseConnector(portA));
  });
});

// R1: the connector places its pins, not the other way round.
describe("connectorPinPositions", () => {
  it("spaces positions at the pitch, along the rotation", () => {
    const places = connectorPinPositions(portA);
    expect(places[0]).toEqual({ x: 4, y: 10 });
    expect(places[1].x).toBeCloseTo(6, 5);
    expect(places[1].y).toBeCloseTo(10, 5);
    expect(places[4].x).toBeCloseTo(12, 5);
  });

  it("runs down the board at 90 degrees", () => {
    const down = normaliseConnector({ ...serialiseConnector(portA), rotation: 90 });
    const places = connectorPinPositions(down);
    expect(places[1].x).toBeCloseTo(places[0].x, 5);
    expect(places[1].y).toBeCloseTo(places[0].y + down.pitch, 5);
  });

  it("gives one position per pin, however many there are", () => {
    const long = emptyConnector({ id: "j1", kind: "header", count: 24 });
    expect(connectorPinPositions(long)).toHaveLength(24);
    expect(long.pitch).toBeCloseTo(2.54, 5);
  });
});

describe("connectorBounds", () => {
  const DEPTH = 3.4;

  it("encloses every position, ends included", () => {
    const box = connectorBounds(portA, DEPTH);
    const places = connectorPinPositions(portA);
    // Ends are as generous as the sides, so a pad on a fine pitch is
    // not left half outside its own shell.
    const radius = 1.4;
    for (const place of places) {
      expect(place.x - radius).toBeGreaterThanOrEqual(box.x - 0.001);
      expect(place.x + radius).toBeLessThanOrEqual(box.x + box.width + 0.001);
      expect(place.y - radius).toBeGreaterThanOrEqual(box.y - 0.001);
      expect(place.y + radius).toBeLessThanOrEqual(box.y + box.height + 0.001);
    }
  });

  // Turning a connector turns it about where it is anchored, which is
  // position 1. Rotating the shell about its own centre instead put it
  // beside its pins rather than around them.
  it("rotates about position 1, not the rectangle's centre", () => {
    for (const rotation of [0, 90, 180, 270]) {
      const turned = normaliseConnector({
        ...serialiseConnector(portA),
        rotation,
      });
      const box = connectorBounds(turned, DEPTH);
      expect(box.originX).toBe(turned.x);
      expect(box.originY).toBe(turned.y);

      // Apply the transform the drawing applies, and check the pins
      // land inside the result.
      const radians = (rotation * Math.PI) / 180;
      const spin = (px, py) => {
        const dx = px - box.originX;
        const dy = py - box.originY;
        return {
          x: box.originX + dx * Math.cos(radians) - dy * Math.sin(radians),
          y: box.originY + dx * Math.sin(radians) + dy * Math.cos(radians),
        };
      };
      const corners = [
        spin(box.x, box.y),
        spin(box.x + box.width, box.y + box.height),
      ];
      const left = Math.min(corners[0].x, corners[1].x);
      const right = Math.max(corners[0].x, corners[1].x);
      const top = Math.min(corners[0].y, corners[1].y);
      const bottom = Math.max(corners[0].y, corners[1].y);

      for (const place of connectorPinPositions(turned)) {
        expect(place.x, `x at ${rotation}`).toBeGreaterThanOrEqual(left - 0.001);
        expect(place.x, `x at ${rotation}`).toBeLessThanOrEqual(right + 0.001);
        expect(place.y, `y at ${rotation}`).toBeGreaterThanOrEqual(top - 0.001);
        expect(place.y, `y at ${rotation}`).toBeLessThanOrEqual(bottom + 0.001);
      }
    }
  });
});

describe("connectorLabelAnchor", () => {
  it("sits clear of the run, on the side the run exposes", () => {
    const across = connectorLabelAnchor(portA, 3);
    // Running right, the label goes above.
    expect(across.y).toBeCloseTo(portA.y - 3, 5);

    const down = connectorLabelAnchor(
      normaliseConnector({ ...serialiseConnector(portA), rotation: 90 }),
      3,
    );
    // Running down, with no view to face away from, it takes the run's
    // own left-hand side.
    expect(down.x).toBeCloseTo(portA.x + 3, 5);
  });

  it("faces away from the middle of the board when it knows the view", () => {
    const view = { width: 60, height: 38 };
    // A column down the left edge labels outwards, to its left.
    const left = connectorLabelAnchor(
      normaliseConnector({ ...serialiseConnector(portA), x: 4, rotation: 90 }),
      3,
      view,
    );
    expect(left.x).toBeLessThan(4);
    expect(left.anchor).toBe("end");

    // The same column on the right edge labels to its right.
    const right = connectorLabelAnchor(
      normaliseConnector({ ...serialiseConnector(portA), x: 56, rotation: 90 }),
      3,
      view,
    );
    expect(right.x).toBeGreaterThan(56);
    expect(right.anchor).toBe("start");
  });

  it("follows the middle of the run, however long it is", () => {
    const long = normaliseConnector({
      ...serialiseConnector(portA),
      pins: Array.from({ length: 11 }, (_, i) => ({ position: i + 1 })),
    });
    expect(connectorLabelAnchor(long).x).toBeCloseTo(
      long.x + (10 * long.pitch) / 2,
      5,
    );
  });
});

describe("connectorPads", () => {
  const pads = connectorPads([portA]);

  it("drops positions that carry nothing, because there is no pad", () => {
    expect(pads).toHaveLength(4);
  });

  it("carries the connector and position on every pad", () => {
    for (const pad of pads) {
      expect(pad.connector).toBe("port-a");
      expect(pad.connectorLabel).toBe("Port A");
      expect(pad.position).toBeGreaterThan(0);
    }
  });

  it("colours rails apart and labels them by what they are", () => {
    expect(pads[0]).toMatchObject({ net: "GND", group: "ground", role: "net" });
    expect(pads[1]).toMatchObject({ net: "5V", group: "power", role: "net" });
    expect(pads[0].silkscreen).toBe("GND");
  });

  it("leaves a rail out of the pins entirely", () => {
    for (const pad of pads.filter((entry) => entry.role === "net")) {
      expect(pad.pin).toBeNull();
    }
  });
});

// R2 again, at the level that matters: many grounds are not a clash.
describe("a board of connectors", () => {
  const profile = normaliseProfile({
    id: "T-B",
    match: { manufacturerId: ["T"], boardName: ["B"] },
    display: "B",
    views: { top: { width: 40, height: 30 } },
    connectors: [
      serialiseConnector(portA),
      serialiseConnector(
        normaliseConnector({
          id: "port-b",
          label: "Port B",
          kind: "port",
          view: "top",
          x: 4,
          y: 20,
          pitch: 2,
          pins: [
            { net: "GND" },
            { net: "5V" },
            { pin: "A02", silkscreen: "TX" },
            { pin: "A03", silkscreen: "RX" },
          ],
        }),
      ),
    ],
    ports: [
      { id: "A", identifier: 0, label: "Port A", tx: "B06", rx: "B07" },
      { id: "B", identifier: 1, label: "Port B", tx: "A02", rx: "A03" },
    ],
  });

  it("validates with a ground on every connector", () => {
    expect(validateProfile(profile)).toEqual([]);
  });

  it("still refuses the same MCU pin twice", () => {
    const clash = normaliseProfile({
      ...profile,
      connectors: [
        serialiseConnector(portA),
        serialiseConnector(
          normaliseConnector({
            id: "port-c",
            view: "top",
            pins: [{ pin: "B06" }],
          }),
        ),
      ],
    });
    expect(
      validateProfile(clash).some(
        (problem) => problem.level === "error" && problem.pin === "B06",
      ),
    ).toBe(true);
  });

  it("joins each port line to its connector and position", () => {
    const map = buildPortMap({ profile, serialPorts: [] });
    const tx = map[0].lines.find((line) => line.role === "tx");
    expect(tx.connector).toBe("port-a");
    expect(tx.position).toBe(3);
  });

  it("calls two lines on one connector together, and two on different ones split", () => {
    const map = buildPortMap({ profile, serialPorts: [] });
    expect(map[0].layout).toBe("together");

    const crossed = normaliseProfile({
      ...profile,
      ports: [{ id: "X", identifier: 0, label: "X", tx: "B06", rx: "A03" }],
    });
    expect(buildPortMap({ profile: crossed, serialPorts: [] })[0].split).toBe(
      true,
    );
  });
});

// R6: a receiver occupies a port nobody can wire.
describe("a built-in receiver", () => {
  const profile = normaliseProfile({
    id: "T-RX",
    match: { manufacturerId: ["T"], boardName: ["RX"] },
    display: "RX",
    views: { top: { width: 40, height: 30 } },
    connectors: [serialiseConnector(portA)],
    receivers: [
      {
        id: "rx",
        label: "Built-in ELRS",
        protocol: "CRSF",
        portIdentifier: 5,
        view: "top",
        x: 20,
        y: 20,
      },
    ],
    ports: [
      { id: "A", identifier: 0, label: "Port A", tx: "B06", rx: "B07" },
      { id: "F", identifier: 5, label: "Port F" },
    ],
  });

  it("lets a port exist with no pins at all", () => {
    expect(validateProfile(profile)).toEqual([]);
  });

  it("rejects a pinless port that has no receiver to explain it", () => {
    const orphan = normaliseProfile({ ...profile, receivers: [] });
    expect(
      validateProfile(orphan).some((problem) => problem.level === "error"),
    ).toBe(true);
  });

  it("marks the port as internal and names what is on it", () => {
    const map = buildPortMap({
      profile,
      serialPorts: [{ identifier: 5, functionMask: 64 }],
    });
    const port = map.find((entry) => entry.identifier === 5);
    expect(port.internal).toBe(true);
    expect(port.receiver.protocol).toBe("CRSF");
    expect(map.find((entry) => entry.identifier === 0).internal).toBe(false);
  });
});

// Positions are physical: which hole in the plug a wire goes into. A
// row transcribed in the wrong order has to be fixable without
// retyping every value, so order is editable and stays 1..n.
describe("reordering a connector's positions", () => {
  const swap = (connector, position, delta) => {
    const pins = [...connector.pins];
    const from = pins.findIndex((pin) => pin.position === position);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= pins.length) return connector;
    [pins[from], pins[to]] = [pins[to], pins[from]];
    return normaliseConnector({
      ...serialiseConnector(connector),
      pins: pins.map((pin, index) => ({ ...pin, position: index + 1 })),
    });
  };

  it("keeps the numbering contiguous after a move", () => {
    const moved = swap(portA, 1, 1);
    expect(moved.pins.map((pin) => pin.position)).toEqual([1, 2, 3, 4, 5]);
    expect(moved.pins[0].net).toBe("5V");
    expect(moved.pins[1].net).toBe("GND");
  });

  it("moves the positions with their values, not just their numbers", () => {
    const moved = swap(portA, 3, 1);
    expect(moved.pins[2].pin).toBe("B07");
    expect(moved.pins[3].pin).toBe("B06");
    expect(moved.pins[2].silkscreen).toBe("RX");
  });

  it("re-places the pins where the new order puts them", () => {
    const moved = swap(portA, 1, 1);
    const before = connectorPinPositions(portA);
    const after = connectorPinPositions(moved);
    // Geometry follows the order: position 1 is still at the anchor.
    expect(after[0]).toEqual(before[0]);
    // And the rail that moved is now where position 2 sits.
    const padsAfter = connectorPads([moved]);
    expect(padsAfter[0].net).toBe("5V");
    expect(padsAfter[0].x).toBeCloseTo(before[0].x, 5);
  });

  it("reverses cleanly, because plugs are numbered from either end", () => {
    const reversed = normaliseConnector({
      ...serialiseConnector(portA),
      pins: [...portA.pins]
        .reverse()
        .map((pin, index) => ({ ...pin, position: index + 1 })),
    });
    expect(reversed.pins.map((pin) => pin.position)).toEqual([1, 2, 3, 4, 5]);
    expect(reversed.pins[4].net).toBe("GND");
    expect(reversed.pins[2].pin).toBe("B06");
  });
});

// Every pad on a connector labels the same way, and that way follows
// the connector: which direction its positions run, and which side of
// the board it sits on. Deciding per pad split one connector's labels
// across two sides and sent a pin in the middle of a board to whichever
// edge happened to be a millimetre nearer.
describe("which way a connector's labels read", () => {
  const view = { width: 60, height: 38 };
  const at = (over) =>
    normaliseConnector({
      id: "c",
      kind: "port",
      view: "top",
      pitch: 2,
      pins: [{ pin: "B06" }, { pin: "B07" }, { pin: "B08" }, { pin: "B09" }],
      ...over,
    });

  it("sends a row of positions above or below, never sideways", () => {
    expect(connectorLabelSide(at({ x: 20, y: 4, rotation: 0 }), view)).toBe(
      "above",
    );
    expect(connectorLabelSide(at({ x: 20, y: 34, rotation: 0 }), view)).toBe(
      "below",
    );
  });

  it("sends a column of positions left or right, never up or down", () => {
    expect(connectorLabelSide(at({ x: 4, y: 14, rotation: 90 }), view)).toBe(
      "left",
    );
    expect(connectorLabelSide(at({ x: 56, y: 14, rotation: 90 }), view)).toBe(
      "right",
    );
  });

  it("does not care which end the run starts from", () => {
    // The same column, described upwards instead of downwards.
    expect(connectorLabelSide(at({ x: 4, y: 20, rotation: 270 }), view)).toBe(
      "left",
    );
    expect(connectorLabelSide(at({ x: 20, y: 4, rotation: 180 }), view)).toBe(
      "above",
    );
  });

  it("gives every pad on one connector the same side", () => {
    const connector = at({ x: 4, y: 14, rotation: 90 });
    const pads = connectorPads([connector], { top: view });
    expect(new Set(pads.map((pad) => pad.labelSide))).toEqual(
      new Set(["left"]),
    );
  });

  it("still honours a side the author fixed by hand", () => {
    const connector = at({ x: 4, y: 14, rotation: 90, labelSide: "below" });
    const pads = connectorPads([connector], { top: view });
    for (const pad of pads) expect(pad.labelSide).toBe("below");
  });

  it("leaves it to the drawing when it has no view to judge by", () => {
    const pads = connectorPads([at({ x: 4, y: 14, rotation: 90 })]);
    // Still one side for the whole connector, taken from the run alone.
    expect(new Set(pads.map((pad) => pad.labelSide)).size).toBe(1);
  });
});

// R6: a receiver is mounted against an edge, and its aerials leave the
// board from there. Free coordinates read as a chip on the board
// rather than as a receiver module at its rim.
describe("where a built-in receiver sits", () => {
  const view = { width: 40, height: 30 };
  const at = (over) =>
    normaliseProfile({
      id: "T-B",
      match: { manufacturerId: ["T"], boardName: ["B"] },
      display: "B",
      views: { top: view },
      connectors: [serialiseConnector(portA)],
      receivers: [
        {
          id: "rx",
          protocol: "CRSF",
          portIdentifier: 5,
          view: "top",
          width: 12,
          height: 6,
          ...over,
        },
      ],
      ports: [
        { id: "A", identifier: 0, label: "A", tx: "B06", rx: "B07" },
        { id: "F", identifier: 5, label: "F" },
      ],
    }).receivers[0];

  it("hugs the edge it is mounted on", () => {
    expect(receiverPlacement(at({ side: "top" }), view).y).toBe(0);
    expect(
      receiverPlacement(at({ side: "bottom" }), view).y + 6,
    ).toBeCloseTo(30, 5);
    expect(receiverPlacement(at({ side: "left" }), view).x).toBe(0);
    expect(receiverPlacement(at({ side: "right" }), view).x + 12).toBeCloseTo(
      40,
      5,
    );
  });

  it("points its aerials out of the board, whichever edge it is on", () => {
    expect(receiverPlacement(at({ side: "top" }), view)).toMatchObject({
      aerialX: 0,
      aerialY: -1,
    });
    expect(receiverPlacement(at({ side: "bottom" }), view)).toMatchObject({
      aerialX: 0,
      aerialY: 1,
    });
    expect(receiverPlacement(at({ side: "left" }), view)).toMatchObject({
      aerialX: -1,
      aerialY: 0,
    });
    expect(receiverPlacement(at({ side: "right" }), view)).toMatchObject({
      aerialX: 1,
      aerialY: 0,
    });
  });

  it("slides along that edge, and stays on the board at the ends", () => {
    const left = receiverPlacement(at({ side: "top", offset: 0 }), view);
    const right = receiverPlacement(at({ side: "top", offset: 1 }), view);
    expect(left.x).toBe(0);
    expect(right.x + right.width).toBeCloseTo(40, 5);
  });

  it("converts an older profile's coordinates to the nearest edge", () => {
    // Drawn before receivers had a side: near the bottom of the board.
    const legacy = at({ x: 14, y: 24, side: undefined, offset: undefined });
    expect(legacy.side).toBe("bottom");
    expect(legacy.offset).toBeCloseTo(0.5, 1);
  });
});
