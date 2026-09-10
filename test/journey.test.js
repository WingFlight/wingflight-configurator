import { beforeEach, describe, expect, it } from "vitest";

import { deriveProfile } from "@/js/profile/derive.js";
import { configHash, hashString, stableStringify } from "@/tabs/journey/hash.js";
import { CHECKS, STATUS, checksForStage, evaluateStage, surfaceDirectionCheckId } from "@/tabs/journey/checks.js";
import { stageBadge, nextStageId, allStagesVerified } from "@/tabs/journey/status.js";
import { BADGE, STAGES, STAGE_IDS, TAB_OWNER, stageForTab } from "@/tabs/journey/stages.js";
import {
  _resetForTests,
  ackStatus,
  acknowledge,
  markStageVerified,
  revoke,
  wasStageVerified,
} from "@/tabs/journey/acknowledgments.svelte.js";

import { conventionalTrainer, flyingWingTwoMotors, vtailGliderWithFlaps, customEmptyMixer } from "./fixtures/fc_fixtures.js";

const support = { apiMin: "22.0.0", apiMax: "22.2.0", fwMin: "4.3.0-0", fwMax: "4.6.99" };

function ctxFor(fc, { observed = { min: [], max: [], samples: 0 }, acks = {} } = {}) {
  const profile = deriveProfile(fc);
  return {
    fc,
    profile,
    observed,
    support,
    uid: profile.board.uid,
    ack: (id, hash) => (acks[id] === undefined ? "none" : acks[id] === hash ? "valid" : "stale"),
  };
}

function result(results, id) {
  return results.find((r) => r.id === id);
}

describe("hash", () => {
  it("is stable across key order and drops undefined", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 }));
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
    expect(hashString("abc")).toMatch(/^[0-9a-f]{8}$/);
    expect(configHash({ x: 1 })).not.toBe(configHash({ x: 2 }));
  });
});

describe("stages", () => {
  it("has eight stages in build order and every check id defined", () => {
    expect(STAGES.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(STAGE_IDS).toEqual(STAGES.map((s) => s.id));
    for (const stage of STAGES) for (const id of stage.checks) expect(CHECKS[id], id).toBeDefined();
  });

  it("maps tabs to a single owning stage", () => {
    expect(stageForTab("mixer")).toBe("airframe");
    expect(stageForTab("failsafe")).toBe("safety");
    expect(stageForTab("rates")).toBe("tuning");
    expect(stageForTab("cli")).toBeNull();
    for (const owner of Object.values(TAB_OWNER)) expect([...STAGE_IDS, "tuning"]).toContain(owner);
  });
});

describe("stage 1 · board", () => {
  it("passes on a supported, calibrated, level board", () => {
    const fc = conventionalTrainer();
    fc.SENSOR_DATA = { kinematics: [0.5, -1.2, 90] };
    const results = evaluateStage("board", ctxFor(fc));
    expect(result(results, "board.firmwareSupported").status).toBe(STATUS.PASS);
    expect(result(results, "board.accCalibrated").status).toBe(STATUS.PASS);
    expect(result(results, "board.level").status).toBe(STATUS.PASS);
    expect(result(results, "board.orientationConfirmed").status).toBe(STATUS.UNKNOWN);
  });

  it("fails an unsupported firmware and an uncalibrated accelerometer", () => {
    const fc = conventionalTrainer();
    fc.CONFIG.flightControllerVersion = "9.9.9";
    fc.CONFIG.configurationProblems = 1; // ACC_NEEDS_CALIBRATION
    fc.SENSOR_DATA = { kinematics: [12, 0, 0] };
    const results = evaluateStage("board", ctxFor(fc));
    expect(result(results, "board.firmwareSupported").status).toBe(STATUS.FAIL);
    expect(result(results, "board.accCalibrated").status).toBe(STATUS.FAIL);
    expect(result(results, "board.level").status).toBe(STATUS.FAIL);
  });

  it("is n/a for level checks without an accelerometer", () => {
    const fc = conventionalTrainer();
    fc.CONFIG.activeSensors = 0b100000; // gyro only
    const results = evaluateStage("board", ctxFor(fc));
    expect(result(results, "board.accCalibrated").status).toBe(STATUS.NA);
    expect(result(results, "board.level").status).toBe(STATUS.NA);
  });
});

describe("stage 2 · airframe", () => {
  it("passes a named model type whose axes all reach outputs", () => {
    const results = evaluateStage("airframe", ctxFor(conventionalTrainer()));
    expect(result(results, "airframe.modelTypeSet").status).toBe(STATUS.PASS);
    expect(result(results, "airframe.axesReachOutputs").status).toBe(STATUS.PASS);
  });

  it("fails an empty custom mixer and reports missing axes", () => {
    const results = evaluateStage("airframe", ctxFor(customEmptyMixer()));
    expect(result(results, "airframe.modelTypeSet").status).toBe(STATUS.FAIL);
    expect(result(results, "airframe.axesReachOutputs").status).toBe(STATUS.FAIL);
  });

  it("does not require throttle on a glider", () => {
    const results = evaluateStage("airframe", ctxFor(vtailGliderWithFlaps()));
    expect(result(results, "airframe.axesReachOutputs").status).toBe(STATUS.PASS);
  });

  it("flags a missing pitch output", () => {
    const fc = conventionalTrainer();
    fc.MIXER_RULES = fc.MIXER_RULES.filter((r) => r.src !== 2);
    const r = result(evaluateStage("airframe", ctxFor(fc)), "airframe.axesReachOutputs");
    expect(r.status).toBe(STATUS.FAIL);
    expect(r.values.axes).toBe("pitch");
  });
});

describe("stage 3 · wiring", () => {
  it("passes when pads exist and the RX port is configured; conflicts unknown before CLI read", () => {
    const results = evaluateStage("wiring", ctxFor(conventionalTrainer()));
    expect(result(results, "wiring.outputsHavePads").status).toBe(STATUS.PASS);
    expect(result(results, "wiring.rxPortConfigured").status).toBe(STATUS.PASS);
    expect(result(results, "wiring.noConflicts").status).toBe(STATUS.UNKNOWN);
  });

  it("fails an output beyond the board's pad count", () => {
    const fc = conventionalTrainer();
    fc.CONFIG.servoCount = 3;
    const r = result(evaluateStage("wiring", ctxFor(fc)), "wiring.outputsHavePads");
    expect(r.status).toBe(STATUS.FAIL);
    expect(r.values.outputs).toBe("S4");
  });

  it("fails serial RX without a UART", () => {
    const fc = conventionalTrainer();
    fc.SERIAL_CONFIG = { ports: [{ identifier: 20, functions: ["MSP"] }] };
    expect(result(evaluateStage("wiring", ctxFor(fc)), "wiring.rxPortConfigured").status).toBe(STATUS.FAIL);
  });

  it("uses the CLI reader's pads and conflicts when present", () => {
    const fc = conventionalTrainer();
    const ctx = ctxFor(fc);
    ctx.profile = deriveProfile(fc, {
      padsInUse: [{ key: "S1", pin: "B07" }, { key: "S2", pin: "B06" }, { key: "S3", pin: "B01" }, { key: "M1", pin: "A08" }],
      conflicts: [{ pin: "B06", kind: "dma" }],
    });
    const results = evaluateStage("wiring", ctx);
    expect(result(results, "wiring.outputsHavePads")).toMatchObject({ status: STATUS.FAIL, values: { outputs: "S4" } });
    expect(result(results, "wiring.noConflicts")).toMatchObject({ status: STATUS.FAIL, values: { count: 1 } });
  });
});

describe("stage 4 · link", () => {
  it("is unknown before anything is observed, then passes once sticks move", () => {
    const fc = conventionalTrainer();
    let results = evaluateStage("link", ctxFor(fc));
    expect(result(results, "link.primariesMoving").status).toBe(STATUS.UNKNOWN);
    expect(result(results, "link.endpointsInWindow").status).toBe(STATUS.UNKNOWN);
    expect(result(results, "link.channelMapSet").status).toBe(STATUS.PASS);
    expect(result(results, "link.armSwitchBound").status).toBe(STATUS.PASS);

    const observed = { min: [1000, 1000, 1000, 1000], max: [2000, 2000, 2000, 2000], samples: 50 };
    results = evaluateStage("link", ctxFor(fc, { observed }));
    expect(result(results, "link.primariesMoving").status).toBe(STATUS.PASS);
    expect(result(results, "link.endpointsInWindow").status).toBe(STATUS.PASS);
  });

  it("reports the channel that did not move and endpoints out of window", () => {
    const fc = conventionalTrainer(); // RC_MAP AETR: throttle is channel 2
    const observed = { min: [1000, 1000, 1500, 1000], max: [2000, 2000, 1520, 1700], samples: 5 };
    const results = evaluateStage("link", ctxFor(fc, { observed }));
    expect(result(results, "link.primariesMoving")).toMatchObject({ status: STATUS.FAIL, values: { channels: "3" } });
    expect(result(results, "link.endpointsInWindow").values.channels).toBe("3, 4");
  });

  it("fails when no arm switch is bound", () => {
    expect(result(evaluateStage("link", ctxFor(flyingWingTwoMotors())), "link.armSwitchBound").status).toBe(STATUS.FAIL);
  });
});

describe("stage 5 · outputs", () => {
  it("generates one direction check per surface and n/a throttle on a glider", () => {
    const glider = ctxFor(vtailGliderWithFlaps());
    const checks = checksForStage("outputs", glider.profile);
    const dynamic = checks.filter((c) => c.id.startsWith("outputs.direction."));
    expect(dynamic).toHaveLength(6);
    const results = evaluateStage("outputs", glider);
    expect(result(results, "outputs.throttleCalibrated").status).toBe(STATUS.NA);
    expect(result(results, "outputs.servoLimitsSane").status).toBe(STATUS.UNKNOWN); // no SERVO_CONFIG in fixture -> bad
  });

  it("acknowledged direction check goes stale when that servo's config changes, and only that one", () => {
    const fc = conventionalTrainer();
    fc.SERVO_CONFIG = Array.from({ length: 4 }, () => ({ mid: 1500, min: -700, max: 700, rneg: 500, rpos: 500, rate: 333, speed: 0, flags: 0 }));
    let ctx = ctxFor(fc);
    let results = evaluateStage("outputs", ctx);
    const left = ctx.profile.surfaces.find((s) => s.id === "aileron.left");
    const right = ctx.profile.surfaces.find((s) => s.id === "aileron.right");
    const leftId = surfaceDirectionCheckId(left);
    const rightId = surfaceDirectionCheckId(right);
    const acks = { [leftId]: result(results, leftId).hash, [rightId]: result(results, rightId).hash };

    results = evaluateStage("outputs", ctxFor(fc, { acks }));
    expect(result(results, leftId).status).toBe(STATUS.PASS);
    expect(result(results, rightId).status).toBe(STATUS.PASS);

    fc.SERVO_CONFIG[1].flags = 1; // reverse S2 (right aileron)
    results = evaluateStage("outputs", ctxFor(fc, { acks }));
    expect(result(results, leftId).status).toBe(STATUS.PASS);
    expect(result(results, rightId).status).toBe(STATUS.STALE);
  });
});

describe("stages 6-8", () => {
  it("evaluates failsafe, power and pre-flight checks", () => {
    const fc = conventionalTrainer();
    fc.FAILSAFE_CONFIG = { failsafe_delay: 10, failsafe_off_delay: 10, failsafe_throttle: 1000, failsafe_switch_mode: 0, failsafe_throttle_low_delay: 100, failsafe_procedure: 1 };
    fc.BATTERY_CONFIG = { voltageMeterSource: 1, currentMeterSource: 0, vbatmincellvoltage: 330, vbatwarningcellvoltage: 350, vbatmaxcellvoltage: 430 };
    fc.VOLTAGE_METER_CONFIGS = [{ id: 10, sensorType: 0, vbatscale: 110, vbatresdivval: 10, vbatresdivmultiplier: 1 }];
    const ctx = ctxFor(fc);
    const safety = evaluateStage("safety", ctx);
    expect(result(safety, "safety.failsafeProcedureSet").status).toBe(STATUS.PASS);
    expect(result(safety, "safety.failsafeVerified").status).toBe(STATUS.UNKNOWN);
    const power = evaluateStage("power", ctx);
    expect(result(power, "power.voltageCalibrated").status).toBe(STATUS.UNKNOWN);
    expect(result(power, "power.currentCalibrated").status).toBe(STATUS.NA);
    expect(result(power, "power.warningThresholdsSet").status).toBe(STATUS.PASS);
    const pre = evaluateStage("preflight", ctx);
    expect(pre).toHaveLength(5);
    expect(pre.every((r) => r.status === STATUS.UNKNOWN && r.hash)).toBe(true);
  });

  it("power stage is not applicable without any battery sensor", () => {
    const fc = conventionalTrainer();
    fc.BATTERY_CONFIG = { voltageMeterSource: 0, currentMeterSource: 0 };
    const results = evaluateStage("power", ctxFor(fc));
    expect(stageBadge(results)).toBe(BADGE.NOT_APPLICABLE);
  });

  it("invalidates pre-flight acknowledgments after a firmware flash", () => {
    const fc = conventionalTrainer();
    let results = evaluateStage("preflight", ctxFor(fc));
    const acks = Object.fromEntries(results.map((r) => [r.id, r.hash]));
    results = evaluateStage("preflight", ctxFor(fc, { acks }));
    expect(results.every((r) => r.status === STATUS.PASS)).toBe(true);
    fc.CONFIG.flightControllerVersion = "4.5.1";
    results = evaluateStage("preflight", ctxFor(fc, { acks }));
    expect(results.every((r) => r.status === STATUS.STALE)).toBe(true);
  });
});

describe("stageBadge", () => {
  const r = (status) => ({ status });

  it("follows the badge vocabulary", () => {
    expect(stageBadge([])).toBe(BADGE.NOT_APPLICABLE);
    expect(stageBadge([r("na"), r("na")])).toBe(BADGE.NOT_APPLICABLE);
    expect(stageBadge([r("pass"), r("na")])).toBe(BADGE.VERIFIED);
    expect(stageBadge([r("fail"), r("unknown")])).toBe(BADGE.NOT_STARTED);
    expect(stageBadge([r("pass"), r("fail")])).toBe(BADGE.IN_PROGRESS);
    expect(stageBadge([r("pass"), r("stale")])).toBe(BADGE.NEEDS_ATTENTION);
    expect(stageBadge([r("pass"), r("fail")], { wasVerified: true })).toBe(BADGE.NEEDS_ATTENTION);
    expect(stageBadge([r("pass"), r("unknown")], { wasVerified: true })).toBe(BADGE.IN_PROGRESS);
  });

  it("finds the next stage and overall completion", () => {
    const badges = { board: "verified", airframe: "verified", wiring: "inProgress", link: "notStarted" };
    expect(nextStageId(badges, ["board", "airframe", "wiring", "link"])).toBe("wiring");
    expect(allStagesVerified({ a: "verified", b: "notApplicable" }, ["a", "b"])).toBe(true);
    expect(allStagesVerified({ a: "verified", b: "inProgress" }, ["a", "b"])).toBe(false);
  });
});

describe("acknowledgment store", () => {
  beforeEach(() => _resetForTests());

  it("stores, validates, stales and revokes per uid", () => {
    expect(ackStatus("x", "uid1", "h1")).toBe("none");
    acknowledge("x", "uid1", "h1");
    expect(ackStatus("x", "uid1", "h1")).toBe("valid");
    expect(ackStatus("x", "uid1", "h2")).toBe("stale");
    expect(ackStatus("x", "uid2", "h1")).toBe("none");
    acknowledge("x", "uid1", "h2");
    expect(ackStatus("x", "uid1", "h2")).toBe("valid");
    expect(revoke("x", "uid1")).toBe(true);
    expect(ackStatus("x", "uid1", "h2")).toBe("none");
    expect(acknowledge("x", "", "h")).toBeNull();
  });

  it("remembers that a stage was verified once", () => {
    expect(wasStageVerified("board", "uid1")).toBe(false);
    markStageVerified("board", "uid1");
    expect(wasStageVerified("board", "uid1")).toBe(true);
    expect(wasStageVerified("board", "uid2")).toBe(false);
  });
});
