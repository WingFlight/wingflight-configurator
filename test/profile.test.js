import { describe, expect, it } from "vitest";

import { deriveProfile, deriveOutputs, axisOfInput } from "@/js/profile/derive.js";
import {
  conventionalTrainer,
  flyingWingTwoMotors,
  vtailGliderWithFlaps,
  customEmptyMixer,
  serialRxWithoutPort,
} from "./fixtures/fc_fixtures.js";

describe("axisOfInput", () => {
  it("maps stabilized, rc command and rc channel inputs to the same axis", () => {
    expect(axisOfInput(1)).toBe("roll");
    expect(axisOfInput(5)).toBe("roll");
    expect(axisOfInput(9)).toBe("roll");
    expect(axisOfInput(4)).toBe("throttle");
    expect(axisOfInput(13)).toBe("flap");
    expect(axisOfInput(14)).toBe("aux");
    expect(axisOfInput(28)).toBe("tvPitch");
    expect(axisOfInput(0)).toBeNull();
  });
});

describe("deriveOutputs", () => {
  it("ignores null rules and rules with zero weight", () => {
    const outputs = deriveOutputs([
      { oper: 0, src: 0, dst: 0, weight: 0, weightNeg: 0 },
      { oper: 1, src: 1, dst: 3, weight: 0, weightNeg: 0 },
      { oper: 1, src: 2, dst: 3, weight: 1000, weightNeg: 1000 },
    ]);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({ dst: 3, kind: "servo", index: 3, role: "elevator" });
  });
});

describe("deriveProfile · conventional trainer", () => {
  const p = deriveProfile(conventionalTrainer());

  it("derives layout and model type", () => {
    expect(p.layout).toBe("conventional");
    expect(p.modelTypeKey).toBe("REGULAR_AIRPLANE");
    expect(p.isCustom).toBe(false);
    expect(p.tail).toBe("elevatorRudder");
  });

  it("finds four surfaces with roles and sides", () => {
    const byId = Object.fromEntries(p.surfaces.map((s) => [s.id, s]));
    expect(Object.keys(byId).sort()).toEqual(["aileron.left", "aileron.right", "elevator", "rudder"]);
    expect(byId["aileron.left"].output).toBe(1);
    expect(byId["aileron.right"].output).toBe(2);
    expect(byId["aileron.right"].signs.roll).toBe(-1);
    expect(byId.elevator.output).toBe(3);
    expect(byId.rudder.output).toBe(4);
  });

  it("finds one throttle motor and every axis driven", () => {
    expect(p.motorCount).toBe(1);
    expect(p.motors[0]).toMatchObject({ index: 1, label: "M1", role: "throttle" });
    expect(p.axesDriven).toEqual({ roll: true, pitch: true, yaw: true, throttle: true });
    expect(p.isGlider).toBe(false);
    expect(p.hasFlaps).toBe(false);
    expect(p.hasRudder).toBe(true);
  });

  it("derives board identity and uid", () => {
    expect(p.board.targetName).toBe("MATEKF405");
    expect(p.board.uid).toBe("1a00323438510b20343235");
    expect(p.board.servoPads).toBe(4);
    expect(p.board.recognised).toBe(false);
    expect(p.silkscreen).toBeNull();
  });

  it("derives the serial link, channel map and arm switch", () => {
    expect(p.link).toMatchObject({ type: "serial", providerId: 9, providerName: "CRSF", portIdentifier: 0, portConfigured: true });
    expect(p.channelMapString).toBe("AETR1234");
    expect(p.armSwitch).toMatchObject({ bound: true, auxChannelIndex: 0, channel: 5, start: 1700, end: 2100 });
  });

  it("derives peripherals", () => {
    expect(p.peripherals).toMatchObject({
      gps: false,
      telemetry: true,
      voltageSensor: true,
      currentSensor: false,
      blackbox: false,
      accelerometer: true,
    });
    expect(p.padsInUse).toBeNull();
    expect(p.conflicts).toBeNull();
  });

  it("accepts CLI reader extras", () => {
    const q = deriveProfile(conventionalTrainer(), {
      padsInUse: [{ pin: "B07" }],
      conflicts: [],
      boardProfile: { id: "MATEKF405", pads: [{ pin: "B07", silkscreen: "S1" }] },
    });
    expect(q.padsInUse).toHaveLength(1);
    expect(q.conflicts).toEqual([]);
    expect(q.board.recognised).toBe(true);
    expect(q.silkscreen).toEqual({ B07: "S1" });
  });
});

describe("deriveProfile · flying wing, two motors", () => {
  const p = deriveProfile(flyingWingTwoMotors());

  it("classifies elevons by roll sign and finds the rudder", () => {
    const ids = p.surfaces.map((s) => s.id).sort();
    expect(ids).toEqual(["elevon.left", "elevon.right", "rudder"]);
    expect(p.layout).toBe("flyingWing");
    expect(p.surfaces.find((s) => s.id === "elevon.left").output).toBe(1);
    expect(p.surfaces.find((s) => s.id === "elevon.right").output).toBe(2);
  });

  it("finds two motors with differential thrust", () => {
    expect(p.motorCount).toBe(2);
    expect(p.differentialThrust).toBe(true);
    expect(p.motors.map((m) => m.role)).toEqual(["throttleDifferential", "throttleDifferential"]);
  });

  it("reports unbound arm switch and peripherals", () => {
    expect(p.armSwitch.bound).toBe(false);
    expect(p.peripherals.gps).toBe(true);
    expect(p.peripherals.ledStrip).toBe(true);
    expect(p.peripherals.currentSensor).toBe(true);
    expect(p.peripherals.blackbox).toBe(true);
  });
});

describe("deriveProfile · V-tail glider with flaps", () => {
  const p = deriveProfile(vtailGliderWithFlaps());

  it("classifies ruddervators by yaw sign and flaps by order", () => {
    const byId = Object.fromEntries(p.surfaces.map((s) => [s.id, s]));
    expect(byId["ruddervator.right"].output).toBe(3);
    expect(byId["ruddervator.left"].output).toBe(4);
    expect(byId["flap.left"].output).toBe(5);
    expect(byId["flap.right"].output).toBe(6);
    expect(p.tail).toBe("vtail");
    expect(p.hasFlaps).toBe(true);
    expect(p.hasRudder).toBe(true);
  });

  it("is a glider with a PPM link", () => {
    expect(p.isGlider).toBe(true);
    expect(p.motorCount).toBe(0);
    expect(p.axesDriven.throttle).toBe(false);
    expect(p.link.type).toBe("ppm");
    expect(p.link.portConfigured).toBe(true);
  });
});

describe("deriveProfile · custom empty mixer", () => {
  const p = deriveProfile(customEmptyMixer());

  it("reports custom with no surfaces and an unknown layout", () => {
    expect(p.isCustom).toBe(true);
    expect(p.layout).toBe("unknown");
    expect(p.surfaces).toEqual([]);
    expect(p.axesDriven).toEqual({ roll: false, pitch: false, yaw: false, throttle: false });
    expect(p.link.type).toBe("none");
    expect(p.armSwitch.bound).toBe(false);
  });
});

describe("deriveProfile · serial rx without a port", () => {
  it("flags the missing RX_SERIAL port", () => {
    const p = deriveProfile(serialRxWithoutPort());
    expect(p.link.type).toBe("serial");
    expect(p.link.portConfigured).toBe(false);
    expect(p.link.portIdentifier).toBeNull();
  });
});

describe("deriveProfile · robustness", () => {
  it("survives an empty FC state", () => {
    const p = deriveProfile({});
    expect(p.layout).toBe("unknown");
    expect(p.surfaces).toEqual([]);
    expect(p.board.uid).toBe("");
    expect(p.link.type).toBe("none");
  });
});
