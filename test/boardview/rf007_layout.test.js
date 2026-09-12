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
import { normaliseProfile, validateProfile } from "@/js/boardview/schema.js";
import { readTargetConfig } from "@/js/boardview/unified_config.js";

// The FrSky Vantac RF007's real layout, as described by someone with
// the board in hand. This is the shape the schema exists to express, so
// it is checked here end to end: the requirement is R9 in
// tools/board-editor/REQUIREMENTS.md.
//
//   Main servo header, down the left edge, nine positions:
//     S1, S2, S3, S4/Tail, ESC, RPM, TLM (RX2), AUX (TX2), SBUS (TX1)
//   A two-position header: GND, AIN
//   Port A (UART4): TX, RX, 5V, GND
//   Port C (UART3): TX/SCL, RX/SDA, 5V, GND
//   A built-in FBUS receiver on UART5
//
// Pins come from the board's own catalogue config wherever it assigns
// one. Two do not exist there and the layout still has to carry them:
// the config gives UART2 no TX, so `AUX` has no pin, and its
// `ADC_EXT 1` is `NONE`, so `AIN` has none either.
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
        // The config gives UART2 no TX, so this pad has no pin.
        named("AUX"),
        signal("TX1", "SBUS", "uart"),
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
      x: 10,
      y: 34,
      width: 12,
      height: 6,
    },
  ],
  ports: [
    { id: "UART1", identifier: 0, label: "SBUS", tx: pin("TX1"), rx: pin("RX1") },
    { id: "UART2", identifier: 1, label: "TLM", rx: pin("RX2") },
    { id: "UART3", identifier: 2, label: "Port C", tx: pin("TX3"), rx: pin("RX3") },
    { id: "UART4", identifier: 3, label: "Port A", tx: pin("TX4"), rx: pin("RX4") },
    { id: "UART5", identifier: 4, label: "UART5" },
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
  it("validates, with one honest warning", () => {
    const problems = validateProfile(profile);
    expect(problems.filter((problem) => problem.level === "error")).toEqual([]);
    // The firmware has UART1's RX on B07; this board only breaks out
    // its TX, as SBUS. Saying so is the point of the warning, not a
    // fault in the profile.
    expect(problems).toEqual([
      expect.objectContaining({ level: "warning", pin: "B07" }),
    ]);
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
    expect(byName.SBUS).toBe("B06");
  });

  // The capability this layout needed and the model did not have.
  it("carries the two pads the config leaves without a pin", () => {
    const named = profile.allPads.filter((pad) => pad.role === "label");
    expect(named.map((pad) => pad.silkscreen).sort()).toEqual(["AIN", "AUX"]);
    for (const pad of named) {
      expect(pad.pin).toBeNull();
      expect(pad.net).toBeNull();
    }
  });

  it("does not mistake a named pad for a power rail", () => {
    const aux = profile.allPads.find((pad) => pad.silkscreen === "AUX");
    expect(aux.group).not.toBe("power");
    expect(aux.group).not.toBe("ground");
  });

  it("does not let a named pad claim a pin, or trip the duplicate rule", () => {
    // Two of them, on two connectors, with no pin between them.
    expect(
      validateProfile(profile).filter((problem) => problem.level === "error"),
    ).toEqual([]);
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

  it("mixes outputs, a frequency input, two UART lines and a bare name on one header", () => {
    const main = connectorPads(
      [normaliseConnector(profile.connectors.find((c) => c.id === "j-main"))],
      { top: profile.views.top },
    );
    expect(main.map((pad) => pad.role)).toEqual([
      "signal",
      "signal",
      "signal",
      "signal",
      "signal",
      "signal",
      "signal",
      "label",
      "signal",
    ]);
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

  it("says a pin the firmware has but the board does not break out", () => {
    const sbus = portMap.find((entry) => entry.identifier === 0);
    const rx = sbus.lines.find((line) => line.role === "rx");
    expect(rx.pin).toBe("B07");
    // Known to the firmware, on no pad: it exists and cannot be reached.
    expect(rx.undrawn).toBe(true);
  });

  it("shows the built-in FBUS receiver on UART5, with nothing to wire", () => {
    const port = portMap.find((entry) => entry.identifier === 4);
    expect(port.internal).toBe(true);
    expect(port.receiver.protocol).toBe("FBUS");
    expect(port.lines.every((line) => line.pin === null)).toBe(true);
    // And it is the only internal one.
    expect(portMap.filter((entry) => entry.internal)).toHaveLength(1);
  });

  it("names each port the way the board does, and keeps the UART too", () => {
    const byIdentifier = Object.fromEntries(
      portMap.map((port) => [port.identifier, port]),
    );
    expect(byIdentifier[3].label).toBe("Port A");
    expect(byIdentifier[3].name).toBe("UART4");
    expect(byIdentifier[2].label).toBe("Port C");
    expect(byIdentifier[2].name).toBe("UART3");
    expect(byIdentifier[1].label).toBe("TLM");
  });

  it("reports the half-broken-out ports honestly", () => {
    const byIdentifier = Object.fromEntries(
      portMap.map((port) => [port.identifier, port]),
    );
    // TLM is UART2's RX only: the config gives it no TX.
    expect(byIdentifier[1].layout).toBe("single");
    expect(byIdentifier[1].lines.find((l) => l.role === "tx").pin).toBeNull();
    // SBUS is UART1's TX on the main header; its RX is not broken out.
    expect(byIdentifier[0].lines.find((l) => l.role === "tx").pin).toBe("B06");
  });

  it("names where each port line comes out, connector and position", () => {
    const portA = portMap.find((entry) => entry.identifier === 3);
    const tx = portA.lines.find((line) => line.role === "tx");
    expect(tx.connector).toBe("port-a");
    expect(tx.position).toBe(1);

    const tlm = portMap.find((entry) => entry.identifier === 1);
    expect(tlm.lines.find((line) => line.role === "rx").position).toBe(7);
  });
});
