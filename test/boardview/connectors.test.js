import { describe, expect, it } from "vitest";

import {
  CONNECTOR_KINDS,
  DEFAULT_PITCH,
  connectorBounds,
  connectorPads,
  connectorPinPositions,
  emptyConnector,
  netGroup,
  normaliseConnector,
  pinRole,
  serialiseConnector,
} from "@/js/boardview/connectors.js";
import { buildPortMap } from "@/js/boardview/port_map.js";
import { normaliseProfile, validateProfile } from "@/js/boardview/schema.js";

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
  it("covers every position with half a pitch of margin at each end", () => {
    const box = connectorBounds(portA);
    expect(box.x).toBeCloseTo(3, 5);
    expect(box.width).toBeCloseTo(4 * portA.pitch + portA.pitch, 5);
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
