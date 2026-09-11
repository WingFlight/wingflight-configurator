import { describe, expect, it } from "vitest";

import {
  buildPortMap,
  hardwareKeysFor,
  layoutOfLines,
  portName,
  portsByPin,
  portsInView,
} from "@/js/boardview/port_map.js";
import { normaliseProfile } from "@/js/boardview/schema.js";

// A board whose UART1 is a proper connector, whose UART2 is broken out
// as TX on the top and RX on the right-hand side, and whose UART3 only
// has an RX pad.
const profile = normaliseProfile({
  id: "SPLITBOARD",
  display: "Split board",
  views: {
    top: { width: 40, height: 30 },
    right: { width: 30, height: 10 },
  },
  headers: [
    { id: "j1", label: "UART1", view: "top" },
    { id: "j2", label: "Telemetry", view: "top" },
    { id: "j3", label: "Side header", view: "right" },
  ],
  pads: [
    { pin: "A09", silkscreen: "T1", x: 5, y: 5, view: "top", group: "uart", header: "j1" },
    { pin: "A10", silkscreen: "R1", x: 5, y: 7.5, view: "top", group: "uart", header: "j1" },
    { pin: "A02", silkscreen: "T2", x: 30, y: 5, view: "top", group: "uart", header: "j2" },
    { pin: "A03", silkscreen: "R2", x: 6, y: 5, view: "right", group: "uart", header: "j3" },
    { pin: "B11", silkscreen: "R3", x: 30, y: 25, view: "top", group: "uart" },
  ],
  ports: [
    { id: "UART1", identifier: 0, label: "UART1", tx: "A09", rx: "A10" },
    { id: "UART2", identifier: 1, label: "UART2", tx: "A02", rx: "A03" },
    { id: "UART3", identifier: 2, label: "UART3", rx: "B11" },
  ],
});

const serialPorts = [
  { identifier: 0, functionMask: 1 },
  { identifier: 1, functionMask: 2 },
  { identifier: 2, functionMask: 0 },
  { identifier: 20, functionMask: 1 },
];

const describeFunction = (port) =>
  ({ 1: "MSP", 2: "GPS" })[port?.functionMask] ?? "";

describe("portName", () => {
  it("uses the firmware's own names", () => {
    expect(portName(0)).toBe("UART1");
    expect(portName(30)).toBe("SOFTSERIAL1");
  });
});

describe("hardwareKeysFor", () => {
  it("numbers hardware UARTs from one", () => {
    expect(hardwareKeysFor(0)).toEqual({ tx: "TX1", rx: "RX1" });
  });

  it("has no resource keys for a soft serial port", () => {
    // Soft serial borrows a timer pin; the resource table files it
    // under that pin's owner, so there is nothing to look up by port.
    expect(hardwareKeysFor(30)).toEqual({ tx: null, rx: null });
  });

  it("still lists a soft serial port, just without pins", () => {
    const map = buildPortMap({
      profile: null,
      serialPorts: [{ identifier: 30, functionMask: 0 }],
      hardwareMap: { TX1: { pin: "A09" } },
    });
    expect(map).toHaveLength(1);
    expect(map[0].name).toBe("SOFTSERIAL1");
    expect(map[0].lines.every((line) => line.pin === null)).toBe(true);
  });
});

describe("layoutOfLines", () => {
  const pad = (over) => ({ x: 0, y: 0, view: "top", header: null, ...over });

  it("calls one line a single-ended port", () => {
    expect(layoutOfLines([{ pad: pad() }, { pad: null }])).toBe("single");
  });

  it("calls two pads on one header together", () => {
    expect(
      layoutOfLines([
        { pad: pad({ header: "j1" }) },
        { pad: pad({ header: "j1", y: 2.5 }) },
      ]),
    ).toBe("together");
  });

  it("calls two pads on different headers split", () => {
    expect(
      layoutOfLines([
        { pad: pad({ header: "j1" }) },
        { pad: pad({ header: "j2", y: 2.5 }) },
      ]),
    ).toBe("split");
  });

  it("calls two pads on different views split", () => {
    expect(
      layoutOfLines([{ pad: pad() }, { pad: pad({ view: "right" }) }]),
    ).toBe("split");
  });

  it("falls back to distance when no headers are given", () => {
    expect(layoutOfLines([{ pad: pad() }, { pad: pad({ y: 2.5 }) }])).toBe(
      "together",
    );
    expect(layoutOfLines([{ pad: pad() }, { pad: pad({ y: 25 }) }])).toBe(
      "split",
    );
  });

  it("lets a profile override what the geometry says", () => {
    const lines = [{ pad: pad({ header: "j1" }) }, { pad: pad({ header: "j2" }) }];
    expect(layoutOfLines(lines, false)).toBe("together");
  });
});

describe("buildPortMap", () => {
  const map = buildPortMap({ profile, serialPorts, describeFunction });

  it("skips the USB virtual port", () => {
    expect(map.map((port) => port.identifier)).toEqual([0, 1, 2]);
  });

  it("names what each port is set to", () => {
    expect(map[0].functionLabel).toBe("MSP");
    expect(map[1].functionLabel).toBe("GPS");
    expect(map[2].assigned).toBe(false);
  });

  it("marks the port whose halves come out in two places", () => {
    expect(map[0].split).toBe(false);
    expect(map[1].split).toBe(true);
    expect(map[1].views.sort()).toEqual(["right", "top"]);
  });

  it("reports a port with only one line as single", () => {
    expect(map[2].layout).toBe("single");
    expect(map[2].lines.find((line) => line.role === "tx").pin).toBeNull();
  });

  it("joins each line to its pad", () => {
    const tx = map[0].lines.find((line) => line.role === "tx");
    expect(tx.pin).toBe("A09");
    expect(tx.silkscreen).toBe("T1");
    expect(tx.header).toBe("j1");
  });

  it("falls back to the board's own resource table when the profile is silent", () => {
    const bare = normaliseProfile({
      id: "BARE",
      display: "Bare",
      views: { top: { width: 40, height: 30 } },
      pads: [
        { pin: "A09", silkscreen: "T1", x: 5, y: 5, view: "top", group: "uart" },
      ],
    });
    const fallback = buildPortMap({
      profile: bare,
      serialPorts: [{ identifier: 0, functionMask: 1 }],
      hardwareMap: { TX1: { pin: "A09" }, RX1: { pin: "A10" } },
      describeFunction,
    });
    expect(fallback[0].lines.map((line) => line.pin)).toEqual(["A09", "A10"]);
    // RX has a pin but no pad, so it is known but cannot be pointed at.
    expect(fallback[0].lines[1].undrawn).toBe(true);
    expect(fallback[0].drawn).toBe(true);
  });

  it("prefers the profile's pins over the board's when both are known", () => {
    const map2 = buildPortMap({
      profile,
      serialPorts,
      hardwareMap: { TX1: { pin: "C12" } },
      describeFunction,
    });
    expect(map2[0].lines[0].pin).toBe("A09");
  });
});

describe("portsByPin and portsInView", () => {
  const map = buildPortMap({ profile, serialPorts, describeFunction });

  it("indexes both halves of every port", () => {
    const byPin = portsByPin(map);
    expect(byPin.A09.line.role).toBe("tx");
    expect(byPin.A10.port.label).toBe("UART1");
  });

  it("lists only the ports visible in a view", () => {
    expect(portsInView(map, "right").map((port) => port.label)).toEqual([
      "UART2",
    ]);
  });
});
