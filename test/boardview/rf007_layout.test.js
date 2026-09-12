import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  connectorPads,
  connectorPinPositions,
  normaliseConnector,
} from "@/js/boardview/connectors.js";
import { describePortFunction } from "@/js/boardview/port_function.js";
import { buildPortMap } from "@/js/boardview/port_map.js";
import {
  normaliseProfile,
  receiverPlacement,
  validateProfile,
} from "@/js/boardview/schema.js";
import { readTargetConfig } from "@/js/boardview/unified_config.js";

// The FrSky Vantac RF007's real layout, as described by someone with
// the board in hand. This is the shape the schema exists to express, so
// it is checked here end to end: the requirement is R9 in
// tools/board-editor/REQUIREMENTS.md.
//
//   Main servo header, down the left edge, nine positions:
//     S1, S2, S3, S4/Tail, ESC, RPM, TLM (A03, UART2 RX),
//     AUX (B06, UART1 TX), SBUS (B07, UART1 RX)
//   A two-position header: GND, AIN
//   Port A (UART4): TX, RX, 5V, GND
//   Port C (UART3): TX/SCL, RX/SDA, 5V, GND
//   A built-in FBUS receiver on UART5
//
// Three UART lines come out on the main header rather than on a
// lettered port, and they are silkscreened by what they are for rather
// than by which line they are, so UART1 and UART2 keep their plain
// names and the drawing has to say TX or RX itself.
//
// Pins come from the board's own catalogue config wherever it assigns
// one. `AIN` is the exception: `ADC_EXT 1` is `NONE` there, so that pad
// exists and is named and has no pin.
const config = fs.readFileSync(
  path.join(import.meta.dirname, "fixtures/FRSK-VANTAC_RF007.config"),
  "utf8",
);
const { hardwareMap } = readTargetConfig(config);
const pin = (key) => hardwareMap[key]?.pin ?? null;

const WIDTH = 32;
const HEIGHT = 44;

const signal = (key, silkscreen, group) => ({
  pin: pin(key),
  silkscreen,
  group,
});
const named = (silkscreen) => ({ silkscreen });
const net = (name) => ({ net: name });

const profile = normaliseProfile({
  schema: 3,
  id: "FRSK-VANTAC_RF007",
  match: { manufacturerId: ["FRSK"], boardName: ["VANTAC_RF007"] },
  display: "Vantac RF007",
  mcu: "STM32F7X2",
  coordinatesSchematic: true,
  views: { top: { width: WIDTH, height: HEIGHT } },
  connectors: [
    {
      id: "j-main",
      label: "Main header",
      kind: "header",
      view: "top",
      x: 3,
      y: 6,
      rotation: 90,
      pitch: 2.54,
      pins: [
        signal("S1", "S1", "outputs"),
        signal("S2", "S2", "outputs"),
        signal("S3", "S3", "outputs"),
        signal("S4", "S4 / Tail", "outputs"),
        signal("M1", "ESC", "outputs"),
        signal("Freq1", "RPM", "other"),
        signal("RX2", "TLM", "uart"),
        signal("TX1", "AUX", "uart"),
        signal("RX1", "SBUS", "uart"),
      ],
    },
    {
      id: "j-ain",
      label: "AIN header",
      kind: "header",
      view: "top",
      x: 29,
      y: 38,
      rotation: 90,
      pitch: 2.54,
      // ADC_EXT is NONE in the config, so AIN has no pin either.
      pins: [net("GND"), named("AIN")],
    },
    {
      id: "port-a",
      label: "Port A",
      kind: "port",
      view: "top",
      x: 29,
      y: 8,
      rotation: 90,
      pitch: 2,
      pins: [
        signal("TX4", "TX", "uart"),
        signal("RX4", "RX", "uart"),
        net("5V"),
        net("GND"),
      ],
    },
    {
      id: "port-c",
      label: "Port C",
      kind: "port",
      view: "top",
      x: 29,
      y: 20,
      rotation: 90,
      pitch: 2,
      pins: [
        signal("TX3", "TX / SCL", "uart"),
        signal("RX3", "RX / SDA", "uart"),
        net("5V"),
        net("GND"),
      ],
    },
  ],
  receivers: [
    {
      id: "rx",
      label: "Built-in receiver",
      protocol: "FBUS",
      portIdentifier: 4,
      view: "top",
      side: "bottom",
      offset: 0.5,
      width: 14,
      height: 6,
    },
  ],
  ports: [
    // UART1 and UART2 come out on the main header, not on a lettered
    // port, so they keep the names the firmware uses.
    { id: "UART1", identifier: 0, tx: pin("TX1"), rx: pin("RX1") },
    { id: "UART2", identifier: 1, rx: pin("RX2") },
    { id: "UART3", identifier: 2, label: "Port C", tx: pin("TX3"), rx: pin("RX3") },
    { id: "UART4", identifier: 3, label: "Port A", tx: pin("TX4"), rx: pin("RX4") },
    { id: "UART5", identifier: 4 },
  ],
});

const serialPorts = [
  { identifier: 0, functionMask: 262144 },
  { identifier: 1, functionMask: 32 },
  { identifier: 2, functionMask: 2 },
  { identifier: 3, functionMask: 0 },
  { identifier: 4, functionMask: 64 },
];
const portMap = buildPortMap({
  profile,
  serialPorts,
  describeFunction: (port) => describePortFunction(port, (key) => key),
});

describe("the Vantac RF007's real layout", () => {
  it("validates cleanly", () => {
    expect(validateProfile(profile)).toEqual([]);
  });

  it("takes every pin it can from the board's own config", () => {
    const byName = Object.fromEntries(
      profile.allPads.map((pad) => [pad.silkscreen, pad.pin]),
    );
    expect(byName.S1).toBe("B04");
    expect(byName["S4 / Tail"]).toBe("A15");
    expect(byName.ESC).toBe("A09");
    expect(byName.RPM).toBe("A02");
    expect(byName.TLM).toBe("A03");
    // Both halves of UART1 are on the main header.
    expect(byName.AUX).toBe("B06");
    expect(byName.SBUS).toBe("B07");
  });

  // The capability this layout needed and the model did not have.
  it("carries the pad the config leaves without a pin", () => {
    const named = profile.allPads.filter((pad) => pad.role === "label");
    expect(named.map((pad) => pad.silkscreen)).toEqual(["AIN"]);
    expect(named[0].pin).toBeNull();
    expect(named[0].net).toBeNull();
  });

  it("does not mistake a named pad for a power rail", () => {
    const ain = profile.allPads.find((pad) => pad.silkscreen === "AIN");
    expect(ain.group).not.toBe("power");
    expect(ain.group).not.toBe("ground");
  });

  it("does not let a named pad claim a pin, or trip the duplicate rule", () => {
    expect(validateProfile(profile)).toEqual([]);
    const pins = profile.allPads.map((pad) => pad.pin).filter(Boolean);
    expect(new Set(pins).size).toBe(pins.length);
  });

  // The reported issue: the main header is on the left, so its labels
  // have to read left.
  it("labels the main header to the left, all nine positions", () => {
    const main = profile.allPads.filter((pad) => pad.connector === "j-main");
    expect(main).toHaveLength(9);
    expect(new Set(main.map((pad) => pad.labelSide))).toEqual(new Set(["left"]));
  });

  it("labels the right-hand connectors to the right", () => {
    for (const id of ["port-a", "port-c", "j-ain"]) {
      const pads = profile.allPads.filter((pad) => pad.connector === id);
      expect(new Set(pads.map((pad) => pad.labelSide)), id).toEqual(
        new Set(["right"]),
      );
    }
  });

  it("runs the main header down the board at its header pitch", () => {
    const main = profile.connectors.find((c) => c.id === "j-main");
    expect(main.pitch).toBeCloseTo(2.54, 5);
    const places = connectorPinPositions(main);
    expect(places[8].y - places[0].y).toBeCloseTo(8 * 2.54, 5);
    expect(places[8].x).toBeCloseTo(places[0].x, 5);
  });

  it("mixes servo outputs, a motor, a frequency input and three UART lines on one header", () => {
    const main = connectorPads(
      [normaliseConnector(profile.connectors.find((c) => c.id === "j-main"))],
      { top: profile.views.top },
    );
    expect(main).toHaveLength(9);
    expect(main.every((pad) => pad.role === "signal")).toBe(true);
    // Four servos, one motor, one frequency input, three UART lines.
    const groups = main.map((pad) => pad.group);
    expect(groups.filter((group) => group === "outputs")).toHaveLength(5);
    expect(groups.filter((group) => group === "uart")).toHaveLength(3);
    expect(groups.filter((group) => group === "other")).toHaveLength(1);
  });

  it("gives each port connector a ground and a 5V position", () => {
    for (const id of ["port-a", "port-c"]) {
      const nets = profile.allPads
        .filter((pad) => pad.connector === id && pad.role === "net")
        .map((pad) => pad.net);
      expect(nets, id).toContain("GND");
      expect(nets, id).toContain("5V");
    }
  });

  it("shows the built-in FBUS receiver on UART5, with nothing to wire", () => {
    const port = portMap.find((entry) => entry.identifier === 4);
    expect(port.internal).toBe(true);
    expect(port.receiver.protocol).toBe("FBUS");
    expect(port.lines.every((line) => line.pin === null)).toBe(true);
    // And it is the only internal one.
    expect(portMap.filter((entry) => entry.internal)).toHaveLength(1);
  });

  it("names a lettered port the way the board does, and keeps the UART too", () => {
    const byIdentifier = Object.fromEntries(
      portMap.map((port) => [port.identifier, port]),
    );
    expect(byIdentifier[3].label).toBe("Port A");
    expect(byIdentifier[3].name).toBe("UART4");
    expect(byIdentifier[2].label).toBe("Port C");
    expect(byIdentifier[2].name).toBe("UART3");
  });

  // The reported issue: a UART broken out on the main servo header has
  // no letter, so it keeps the name the firmware uses.
  it("leaves a header-only UART under its own name", () => {
    const byIdentifier = Object.fromEntries(
      portMap.map((port) => [port.identifier, port]),
    );
    expect(byIdentifier[0].label).toBe("UART1");
    expect(byIdentifier[1].label).toBe("UART2");
  });

  it("has UART1 fully broken out across two header positions", () => {
    const uart1 = portMap.find((entry) => entry.identifier === 0);
    expect(uart1.layout).toBe("together");
    const byRole = Object.fromEntries(
      uart1.lines.map((line) => [line.role, line]),
    );
    expect(byRole.tx.pin).toBe("B06");
    expect(byRole.tx.silkscreen).toBe("AUX");
    expect(byRole.tx.position).toBe(8);
    expect(byRole.rx.pin).toBe("B07");
    expect(byRole.rx.silkscreen).toBe("SBUS");
    expect(byRole.rx.position).toBe(9);
  });

  it("reports UART2 as the RX-only port it is", () => {
    const uart2 = portMap.find((entry) => entry.identifier === 1);
    expect(uart2.layout).toBe("single");
    expect(uart2.lines.find((line) => line.role === "tx").pin).toBeNull();
    expect(uart2.lines.find((line) => line.role === "rx").silkscreen).toBe(
      "TLM",
    );
  });

  it("names where each port line comes out, connector and position", () => {
    const portA = portMap.find((entry) => entry.identifier === 3);
    const tx = portA.lines.find((line) => line.role === "tx");
    expect(tx.connector).toBe("port-a");
    expect(tx.position).toBe(1);

    const tlm = portMap.find((entry) => entry.identifier === 1);
    expect(tlm.lines.find((line) => line.role === "rx").position).toBe(7);
  });

  // R6, as reported: the receiver sits against a chosen edge with two
  // aerials leaving the board from there.
  it("mounts the receiver on a chosen edge, with its aerials outward", () => {
    const receiver = profile.receivers[0];
    expect(receiver.side).toBe("bottom");
    const box = receiverPlacement(receiver, profile.views.top);
    expect(box.y + box.height).toBeCloseTo(profile.views.top.height, 5);
    // Aerials point out of the board, away from the pads.
    expect(box.aerialY).toBe(1);
    expect(box.aerialX).toBe(0);
  });
});
