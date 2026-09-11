import { describe, expect, it } from "vitest";

import { resolveBoardView } from "@/js/boardview/board_views.js";
import {
  groupForOptionKey,
  synthesiseBoardView,
} from "@/js/boardview/generic_layout.js";
import { buildPortMap } from "@/js/boardview/port_map.js";
import { validateProfile } from "@/js/boardview/schema.js";

const hardwareMap = {
  S1: { pin: "C06" },
  S2: { pin: "C07" },
  S3: { pin: "C08" },
  S4: { pin: "C09" },
  M1: { pin: "A15" },
  TX1: { pin: "A09" },
  RX1: { pin: "A10" },
  TX2: { pin: "A02" },
  RX2: { pin: "A03" },
  TX3: { pin: "B10" },
  RX3: { pin: "B11" },
  SDA1: { pin: "B07" },
  SCL1: { pin: "B06" },
  Vbat: { pin: "C05" },
  Curr: { pin: "C04" },
  LED: { pin: "A08" },
};

const serialPorts = [
  { identifier: 0, functionMask: 1 },
  { identifier: 1, functionMask: 2 },
  { identifier: 2, functionMask: 64 },
  { identifier: 20, functionMask: 1 },
];

describe("groupForOptionKey", () => {
  it("reads the key's own shorthand", () => {
    expect(groupForOptionKey("S1")).toBe("outputs");
    expect(groupForOptionKey("M4")).toBe("outputs");
    expect(groupForOptionKey("RX2")).toBe("uart");
    expect(groupForOptionKey("SDA1")).toBe("i2c");
    expect(groupForOptionKey("Vbat")).toBe("adc");
    expect(groupForOptionKey("LED")).toBe("led");
    expect(groupForOptionKey("Beeper")).toBe("other");
  });
});

describe("synthesiseBoardView", () => {
  const profile = synthesiseBoardView({
    hardwareMap,
    serialPorts,
    targetName: "MYSTERYF405",
    mcu: "STM32F405",
  });

  it("says it is synthesised and schematic", () => {
    expect(profile.synthesised).toBe(true);
    expect(profile.coordinatesSchematic).toBe(true);
    expect(profile.display).toBe("MYSTERYF405");
  });

  it("validates as a sound profile", () => {
    expect(validateProfile(profile).filter((p) => p.level === "error")).toEqual(
      [],
    );
  });

  it("places every pin it was given, once", () => {
    const placed = profile.pads.map((pad) => pad.pin);
    expect(new Set(placed).size).toBe(placed.length);
    for (const entry of Object.values(hardwareMap)) {
      expect(placed).toContain(entry.pin);
    }
  });

  it("keeps every pad inside the board it sized", () => {
    for (const pad of profile.pads) {
      expect(pad.x).toBeGreaterThanOrEqual(0);
      expect(pad.y).toBeGreaterThanOrEqual(0);
      expect(pad.x).toBeLessThanOrEqual(profile.views.top.width);
      expect(pad.y).toBeLessThanOrEqual(profile.views.top.height);
    }
  });

  it("gives each serial port a header of its own", () => {
    const ids = profile.headers.map((header) => header.id);
    expect(ids).toContain("port-0");
    expect(ids).toContain("port-1");
    expect(ids).toContain("port-2");
  });

  it("never claims a port is split, because it drew both halves together", () => {
    const map = buildPortMap({ profile, serialPorts });
    expect(map.map((port) => port.split)).toEqual([false, false, false]);
    expect(map.every((port) => port.drawn)).toBe(true);
  });

  it("alternates ports between the two sides so neither edge runs off", () => {
    const uartPads = profile.pads.filter((pad) => pad.group === "uart");
    const sides = new Set(uartPads.map((pad) => pad.labelSide));
    expect(sides.has("left")).toBe(true);
    expect(sides.has("right")).toBe(true);
  });

  it("draws a port the firmware lists even with no pins to place", () => {
    const sparse = synthesiseBoardView({
      hardwareMap: { S1: { pin: "C06" } },
      serialPorts: [{ identifier: 0, functionMask: 0 }],
    });
    expect(sparse.ports.map((port) => port.identifier)).toEqual([0]);
    expect(sparse.pads.map((pad) => pad.pin)).toEqual(["C06"]);
  });

  it("returns nothing when the board reported nothing", () => {
    expect(synthesiseBoardView({})).toBeNull();
  });
});

describe("resolveBoardView", () => {
  it("prefers a hand-made profile", () => {
    const profile = resolveBoardView({
      config: { targetName: "MATEKF405" },
      hardwareMap,
      serialPorts,
    });
    expect(profile.synthesised).toBe(false);
    expect(profile.id).toBe("MATEKF405");
  });

  it("falls back to a schematic for an unknown board", () => {
    const profile = resolveBoardView({
      config: { targetName: "NOSUCHBOARD" },
      hardwareMap,
      serialPorts,
    });
    expect(profile.synthesised).toBe(true);
  });

  it("returns nothing when told not to synthesise", () => {
    expect(
      resolveBoardView({
        config: { targetName: "NOSUCHBOARD" },
        hardwareMap,
        allowSynthesised: false,
      }),
    ).toBeNull();
  });
});
