import semver from "semver";

import { configHash } from "./hash.js";
import { STAGE_BY_ID } from "./stages.js";

// Check definitions.
//
// Two kinds, treated very differently:
//
//   derived       pure functions over the profile and live FC state,
//                 recomputed on every refresh, never stored.
//   observed      like derived, but over something watched during this
//                 session (e.g. "have the four primary channels been seen
//                 moving?"). Also never stored -- it resets on connect.
//   acknowledged  things the board cannot see. The user confirms them; the
//                 confirmation is stored with a hash of the settings the check
//                 depends on (see deps()) and turns stale when they change.
//
// evaluate(ctx) returns { status, detail?, values? } where status is one of
// "pass" | "fail" | "unknown" | "na" | "stale" and detail is an i18n key
// (values are interpolated into it).
//
// ctx = { fc, profile, observed, ack(checkId, hash) -> "valid"|"stale"|"none",
//         support: { apiMin, apiMax, fwMin, fwMax } }

export const STATUS = {
  PASS: "pass",
  FAIL: "fail",
  UNKNOWN: "unknown",
  NA: "na",
  STALE: "stale",
};

const pass = (detail, values) => ({ status: STATUS.PASS, detail, values });
const fail = (detail, values) => ({ status: STATUS.FAIL, detail, values });
const unknown = (detail, values) => ({ status: STATUS.UNKNOWN, detail, values });
const na = (detail, values) => ({ status: STATUS.NA, detail, values });

const LEVEL_TOLERANCE_DEG = 3;
const PRIMARY_MOVEMENT_US = 100;
const ENDPOINT_LOW_MAX = 1150;
const ENDPOINT_HIGH_MIN = 1850;

function acknowledged(id, ctx, deps, applicable = () => true) {
  if (!applicable(ctx)) return na();
  const hash = configHash(deps(ctx));
  const state = ctx.ack ? ctx.ack(id, hash) : "none";
  if (state === "valid") return pass("journeyDetail.acknowledged");
  if (state === "stale") return { status: STATUS.STALE, detail: "journeyDetail.stale" };
  return unknown("journeyDetail.notAcknowledged");
}

function primaryChannels(fc) {
  const map = fc.RC_MAP ?? [];
  return [0, 1, 2, 3].map((fn) => map[fn]).filter((c) => Number.isInteger(c));
}

function servoConfigFor(fc, output) {
  return (fc.SERVO_CONFIG ?? [])[output - 1] ?? null;
}

const AXIS_KEYS = ["roll", "pitch", "yaw", "throttle"];

export const CHECKS = {
  // ---- 1 Board -----------------------------------------------------------
  "board.firmwareSupported": {
    kind: "derived",
    evaluate({ fc, support }) {
      const api = fc.CONFIG?.apiVersion ?? "0.0.0";
      const fw = fc.CONFIG?.flightControllerVersion ?? "";
      if (!semver.valid(api) || api === "0.0.0") return unknown("journeyDetail.noVersionYet");
      const apiOk = semver.gte(api, support.apiMin) && semver.lte(api, support.apiMax);
      const fwOk = !semver.valid(fw) || (semver.gte(fw, support.fwMin) && semver.lte(fw, support.fwMax));
      if (apiOk && fwOk) return pass("journeyDetail.firmwareVersion", { version: fw || api });
      return fail("journeyDetail.firmwareUnsupported", { version: fw || api, min: support.fwMin, max: support.fwMax });
    },
  },
  "board.accCalibrated": {
    kind: "derived",
    evaluate({ fc, profile }) {
      if (!profile.peripherals.accelerometer) return na("journeyDetail.noAccelerometer");
      const problems = fc.CONFIG?.configurationProblems ?? 0;
      const needsCal = ((problems >> 0) & 1) === 1; // ACC_NEEDS_CALIBRATION
      return needsCal ? fail("journeyDetail.accNeedsCalibration") : pass("journeyDetail.accCalibrated");
    },
  },
  "board.level": {
    kind: "derived",
    evaluate({ fc, profile }) {
      if (!profile.peripherals.accelerometer) return na("journeyDetail.noAccelerometer");
      const [roll, pitch] = fc.SENSOR_DATA?.kinematics ?? [0, 0];
      const values = { roll: roll.toFixed(1), pitch: pitch.toFixed(1), tolerance: LEVEL_TOLERANCE_DEG };
      if (Math.abs(roll) <= LEVEL_TOLERANCE_DEG && Math.abs(pitch) <= LEVEL_TOLERANCE_DEG) {
        return pass("journeyDetail.levelOk", values);
      }
      return fail("journeyDetail.notLevel", values);
    },
  },
  "board.orientationConfirmed": {
    kind: "acknowledged",
    deps: ({ fc }) => ({
      alignment: fc.BOARD_ALIGNMENT_CONFIG,
      mountTrim: fc.BOARD_MOUNT_TRIM,
      gyroAlign: fc.SENSOR_ALIGNMENT?.gyro_1_align,
    }),
    evaluate(ctx) {
      return acknowledged("board.orientationConfirmed", ctx, CHECKS["board.orientationConfirmed"].deps);
    },
  },

  // ---- 2 Airframe --------------------------------------------------------
  "airframe.modelTypeSet": {
    kind: "derived",
    evaluate({ profile }) {
      if (profile.layout === "unknown" && !profile.isCustom) return unknown("journeyDetail.noMixerYet");
      if (!profile.isCustom) return pass("journeyDetail.modelType", { type: profile.modelTypeKey });
      if (profile.surfaces.length > 0) return unknown("journeyDetail.customMixerWithSurfaces", { count: profile.surfaces.length });
      return fail("journeyDetail.customMixerEmpty");
    },
  },
  "airframe.axesReachOutputs": {
    kind: "derived",
    evaluate({ fc, profile }) {
      const required = ["roll", "pitch"];
      if ((fc.CONFIG?.motorCount ?? 0) > 0 || profile.hasMotors) required.push("throttle");
      const missing = required.filter((a) => !profile.axesDriven[a]);
      if (profile.outputs.length === 0) return fail("journeyDetail.noRules");
      if (missing.length === 0) return pass("journeyDetail.axesReach", { axes: required.join(", ") });
      return fail("journeyDetail.axesMissing", { axes: missing.join(", ") });
    },
  },

  // ---- 3 Wiring ----------------------------------------------------------
  "wiring.outputsHavePads": {
    kind: "derived",
    evaluate({ fc, profile }) {
      if (profile.outputs.length === 0) return unknown("journeyDetail.noRules");
      const missing = [];
      if (Array.isArray(profile.padsInUse)) {
        const have = new Set(profile.padsInUse.map((p) => p.key));
        for (const o of profile.outputs) if (!have.has(o.label)) missing.push(o.label);
      } else {
        const servoPads = fc.CONFIG?.servoCount ?? 0;
        const motorPads = fc.CONFIG?.motorCount ?? 0;
        for (const o of profile.outputs) {
          if (o.kind === "servo" && o.index > servoPads) missing.push(o.label);
          if (o.kind === "motor" && o.index > motorPads) missing.push(o.label);
        }
      }
      if (missing.length === 0) return pass("journeyDetail.outputsHavePads", { count: profile.outputs.length });
      return fail("journeyDetail.outputsMissingPads", { outputs: missing.join(", ") });
    },
  },
  "wiring.rxPortConfigured": {
    kind: "derived",
    evaluate({ profile }) {
      const link = profile.link;
      if (link.type === "none") return fail("journeyDetail.noReceiverType");
      if (link.type === "serial" && !link.portConfigured) return fail("journeyDetail.serialRxNoPort", { protocol: link.providerName });
      if (link.type === "serial") return pass("journeyDetail.serialRxOnPort", { protocol: link.providerName, port: link.portIdentifier });
      return pass("journeyDetail.rxType", { type: link.type.toUpperCase() });
    },
  },
  "wiring.noConflicts": {
    kind: "derived",
    evaluate({ profile }) {
      if (!Array.isArray(profile.conflicts)) return unknown("journeyDetail.conflictsNotRead");
      if (profile.conflicts.length === 0) return pass("journeyDetail.noConflicts");
      return fail("journeyDetail.conflicts", { count: profile.conflicts.length });
    },
  },

  // ---- 4 Link ------------------------------------------------------------
  "link.primariesMoving": {
    kind: "observed",
    evaluate({ fc, observed }) {
      if (!observed || observed.samples === 0) return unknown("journeyDetail.notObserved");
      const channels = primaryChannels(fc);
      if (channels.length < 4) return unknown("journeyDetail.noChannelMap");
      const still = channels.filter((c) => (observed.max[c] ?? 0) - (observed.min[c] ?? 0) < PRIMARY_MOVEMENT_US);
      // Nothing moved at all: the sticks have not been touched yet, which is
      // "not observed", not a failure.
      if (still.length === channels.length) return unknown("journeyDetail.notObserved");
      if (still.length === 0) return pass("journeyDetail.primariesMoved");
      return fail("journeyDetail.primariesStill", { channels: still.map((c) => c + 1).sort((a, b) => a - b).join(", ") });
    },
  },
  "link.channelMapSet": {
    kind: "derived",
    evaluate({ fc, profile }) {
      const map = fc.RC_MAP ?? [];
      if (map.length < 4) return unknown("journeyDetail.noChannelMap");
      const first = [...map.slice(0, 4)].sort();
      const ok = first.every((v, i) => v === i);
      return ok ? pass("journeyDetail.channelMap", { map: profile.channelMapString }) : fail("journeyDetail.channelMapInvalid");
    },
  },
  "link.endpointsInWindow": {
    kind: "observed",
    evaluate({ fc, profile, observed }) {
      if (!observed || observed.samples === 0) return unknown("journeyDetail.notObserved");
      const channels = primaryChannels(fc);
      if (channels.length < 4) return unknown("journeyDetail.noChannelMap");
      const lo = profile.link.pulseMin || 885;
      const hi = profile.link.pulseMax || 2115;
      // Endpoints can only be judged once every primary has been moved.
      const unmoved = channels.some((c) => (observed.max[c] ?? 0) - (observed.min[c] ?? 0) < PRIMARY_MOVEMENT_US);
      if (unmoved) return unknown("journeyDetail.notObserved");
      const bad = [];
      for (const c of channels) {
        const min = observed.min[c], max = observed.max[c];
        if (min === undefined || max === undefined) { bad.push(c + 1); continue; }
        if (min < lo || min > ENDPOINT_LOW_MAX || max > hi || max < ENDPOINT_HIGH_MIN) bad.push(c + 1);
      }
      bad.sort((a, b) => a - b);
      if (bad.length === 0) return pass("journeyDetail.endpointsOk", { lo, hi });
      return fail("journeyDetail.endpointsBad", { channels: bad.join(", "), lo, hi });
    },
  },
  "link.armSwitchBound": {
    kind: "derived",
    evaluate({ profile }) {
      const arm = profile.armSwitch;
      if (!arm.bound) return fail("journeyDetail.armSwitchUnbound");
      return pass("journeyDetail.armSwitchBound", { channel: arm.channel, start: arm.start, end: arm.end });
    },
  },

  // ---- 5 Outputs ---------------------------------------------------------
  "outputs.servoLimitsSane": {
    kind: "derived",
    evaluate({ fc, profile }) {
      const servos = profile.outputs.filter((o) => o.kind === "servo");
      if (servos.length === 0) return na("journeyDetail.noServos");
      if ((fc.SERVO_CONFIG ?? []).length === 0) return unknown("journeyDetail.servoConfigNotRead");
      const bad = [];
      for (const s of servos) {
        const cfg = servoConfigFor(fc, s.index);
        if (!cfg) { bad.push(s.label); continue; }
        if (!(cfg.min < cfg.max) || cfg.rneg <= 0 || cfg.rpos <= 0 || cfg.mid < 500 || cfg.mid > 2500) bad.push(s.label);
      }
      if (bad.length === 0) return pass("journeyDetail.servoLimitsOk", { count: servos.length });
      return fail("journeyDetail.servoLimitsBad", { outputs: bad.join(", ") });
    },
  },
  "outputs.throttleCalibrated": {
    kind: "acknowledged",
    applicable: ({ profile }) => profile.hasMotors,
    deps: ({ fc }) => ({
      minthrottle: fc.MOTOR_CONFIG?.minthrottle,
      maxthrottle: fc.MOTOR_CONFIG?.maxthrottle,
      mincommand: fc.MOTOR_CONFIG?.mincommand,
      protocol: fc.MOTOR_CONFIG?.motor_pwm_protocol,
      rcMinThrottle: fc.RC_CONFIG?.rc_min_throttle,
      rcMaxThrottle: fc.RC_CONFIG?.rc_max_throttle,
    }),
    evaluate(ctx) {
      const def = CHECKS["outputs.throttleCalibrated"];
      return acknowledged("outputs.throttleCalibrated", ctx, def.deps, def.applicable);
    },
  },

  // ---- 6 Safety ----------------------------------------------------------
  "safety.failsafeProcedureSet": {
    kind: "derived",
    evaluate({ fc }) {
      const fs = fc.FAILSAFE_CONFIG;
      if (!fs) return unknown("journeyDetail.failsafeNotRead");
      if (fs.failsafe_delay === 0 && fs.failsafe_off_delay === 0 && fs.failsafe_throttle === 0) return unknown("journeyDetail.failsafeNotRead");
      if (fs.failsafe_delay > 0) return pass("journeyDetail.failsafeSet", { procedure: fs.failsafe_procedure, delay: (fs.failsafe_delay / 10).toFixed(1) });
      return fail("journeyDetail.failsafeDelayZero");
    },
  },
  "safety.failsafeVerified": {
    kind: "acknowledged",
    deps: ({ fc, profile }) => ({
      failsafe: fc.FAILSAFE_CONFIG,
      rxfail: fc.RXFAIL_CONFIG,
      link: { type: profile.link.type, provider: profile.link.providerId },
      arm: profile.armSwitch,
    }),
    evaluate(ctx) {
      return acknowledged("safety.failsafeVerified", ctx, CHECKS["safety.failsafeVerified"].deps);
    },
  },

  // ---- 7 Power -----------------------------------------------------------
  "power.voltageCalibrated": {
    kind: "acknowledged",
    applicable: ({ profile }) => profile.peripherals.voltageSensor,
    deps: ({ fc }) => ({
      source: fc.BATTERY_CONFIG?.voltageMeterSource,
      scale: (fc.VOLTAGE_METER_CONFIGS ?? [])[0]?.vbatscale,
      divider: (fc.VOLTAGE_METER_CONFIGS ?? [])[0]?.vbatresdivval,
      multiplier: (fc.VOLTAGE_METER_CONFIGS ?? [])[0]?.vbatresdivmultiplier,
    }),
    evaluate(ctx) {
      const def = CHECKS["power.voltageCalibrated"];
      return acknowledged("power.voltageCalibrated", ctx, def.deps, def.applicable);
    },
  },
  "power.currentCalibrated": {
    kind: "acknowledged",
    applicable: ({ profile }) => profile.peripherals.currentSensor,
    deps: ({ fc }) => ({
      source: fc.BATTERY_CONFIG?.currentMeterSource,
      scale: (fc.CURRENT_METER_CONFIGS ?? [])[0]?.scale,
      offset: (fc.CURRENT_METER_CONFIGS ?? [])[0]?.offset,
    }),
    evaluate(ctx) {
      const def = CHECKS["power.currentCalibrated"];
      if (!def.applicable(ctx)) return na("journeyDetail.currentSensorDisabled");
      return acknowledged("power.currentCalibrated", ctx, def.deps);
    },
  },
  "power.warningThresholdsSet": {
    kind: "derived",
    evaluate({ fc, profile }) {
      if (!profile.peripherals.voltageSensor) return na("journeyDetail.noVoltageSensor");
      const b = fc.BATTERY_CONFIG ?? {};
      const min = b.vbatmincellvoltage ?? 0, warn = b.vbatwarningcellvoltage ?? 0, max = b.vbatmaxcellvoltage ?? 0;
      if (min > 0 && warn > 0 && max > 0 && min < warn && warn < max) return pass("journeyDetail.thresholdsOk", { min: (min / 100).toFixed(2), warn: (warn / 100).toFixed(2) });
      return fail("journeyDetail.thresholdsBad");
    },
  },

  // ---- 8 Pre-flight ------------------------------------------------------
  "preflight.surfaceDirections": {
    kind: "acknowledged",
    deps: ({ fc, profile }) => ({
      fw: fc.CONFIG?.flightControllerVersion,
      surfaces: profile.surfaces.map((s) => ({ id: s.id, output: s.output, signs: s.signs, servo: servoConfigFor(fc, s.output) })),
    }),
    evaluate(ctx) {
      return acknowledged("preflight.surfaceDirections", ctx, CHECKS["preflight.surfaceDirections"].deps);
    },
  },
  "preflight.stabilisationDirection": {
    kind: "acknowledged",
    deps: ({ fc, profile }) => ({
      fw: fc.CONFIG?.flightControllerVersion,
      signs: profile.surfaces.map((s) => [s.id, s.signs]),
      alignment: fc.BOARD_ALIGNMENT_CONFIG,
      gyroAlign: fc.SENSOR_ALIGNMENT?.gyro_1_align,
    }),
    evaluate(ctx) {
      return acknowledged("preflight.stabilisationDirection", ctx, CHECKS["preflight.stabilisationDirection"].deps);
    },
  },
  "preflight.centreOfGravity": {
    kind: "acknowledged",
    deps: ({ fc }) => ({ fw: fc.CONFIG?.flightControllerVersion, craft: fc.CONFIG?.name }),
    evaluate(ctx) {
      return acknowledged("preflight.centreOfGravity", ctx, CHECKS["preflight.centreOfGravity"].deps);
    },
  },
  "preflight.controlThrows": {
    kind: "acknowledged",
    deps: ({ fc, profile }) => ({
      fw: fc.CONFIG?.flightControllerVersion,
      servos: profile.surfaces.map((s) => [s.id, servoConfigFor(fc, s.output)]),
      rates: fc.RC_TUNING ? { roll: fc.RC_TUNING.roll_srate, pitch: fc.RC_TUNING.pitch_srate, yaw: fc.RC_TUNING.yaw_srate } : null,
    }),
    evaluate(ctx) {
      return acknowledged("preflight.controlThrows", ctx, CHECKS["preflight.controlThrows"].deps);
    },
  },
  "preflight.rangeCheck": {
    kind: "acknowledged",
    deps: ({ fc, profile }) => ({
      fw: fc.CONFIG?.flightControllerVersion,
      link: { type: profile.link.type, provider: profile.link.providerId, port: profile.link.portIdentifier },
    }),
    evaluate(ctx) {
      return acknowledged("preflight.rangeCheck", ctx, CHECKS["preflight.rangeCheck"].deps);
    },
  },
};

// Per-surface direction acknowledgments for stage 5, generated from the
// profile so a flying wing gets two elevon checks and a trainer gets four.
export function surfaceDirectionCheckId(surface) {
  return `outputs.direction.${surface.id}`;
}

export function surfaceDirectionCheck(surface) {
  const id = surfaceDirectionCheckId(surface);
  return {
    id,
    kind: "acknowledged",
    surface,
    titleKey: "journeyCheck.outputs.direction.title",
    titleValues: { surface: surface.id, output: surface.label },
    deps: ({ fc, profile }) => {
      const current = profile.surfaces.find((s) => s.id === surface.id) ?? surface;
      return {
        output: current.output,
        signs: current.signs,
        servo: servoConfigFor(fc, current.output),
        rules: (fc.MIXER_RULES ?? []).filter((r) => r && r.dst === current.dst).map((r) => [r.src, r.weight, r.weightNeg, r.offset]),
      };
    },
    evaluate(ctx) {
      return acknowledged(id, ctx, surfaceDirectionCheck(surface).deps);
    },
  };
}

// All checks for a stage, static and dynamic, as [{ id, ...definition }].
export function checksForStage(stageId, profile) {
  const stage = STAGE_BY_ID[stageId];
  if (!stage) return [];
  const list = stage.checks.map((id) => ({ id, titleKey: `journeyCheck.${id}.title`, ...CHECKS[id] }));
  if (stage.dynamicChecks === "outputs.direction" && profile) {
    const dynamic = profile.surfaces.map((s) => surfaceDirectionCheck(s));
    // Direction checks come first: they are what the stage is about.
    return [...dynamic, ...list];
  }
  return list;
}

export function evaluateCheck(check, ctx) {
  try {
    return check.evaluate(ctx) ?? unknown();
  } catch (error) {
    console.warn(`journey check ${check.id} threw`, error);
    return unknown("journeyDetail.checkError");
  }
}

export function evaluateStage(stageId, ctx) {
  return checksForStage(stageId, ctx.profile).map((check) => ({
    id: check.id,
    kind: check.kind,
    titleKey: check.titleKey,
    titleValues: check.titleValues,
    surface: check.surface,
    hash: check.kind === "acknowledged" && check.deps ? configHash(check.deps(ctx)) : null,
    ...evaluateCheck(check, ctx),
  }));
}

export { AXIS_KEYS };
