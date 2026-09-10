import { Mixer } from "@/js/Mixer.js";

// Pure derivation of the Aircraft Profile from flight-controller state.
//
// This file must stay free of Svelte runes and of module-level access to
// FC/CONFIGURATOR so it can be unit-tested against plain fixture objects.
// The reactive wrapper lives in src/js/profile.svelte.js.
//
// Everything in the profile is recomputed from the passed-in state on every
// call. Nothing here is ever persisted -- the profile is the single object
// the rest of the app reads to answer "what is this aeroplane?", and it must
// never be able to drift out of step with the board.

// Mixer input ids (firmware pg/mixer.h, mirrored in Mixer.inputNames).
export const MIXER_IN = {
  NONE: 0,
  STABILIZED_ROLL: 1,
  STABILIZED_PITCH: 2,
  STABILIZED_YAW: 3,
  STABILIZED_THROTTLE: 4,
  RC_COMMAND_ROLL: 5,
  RC_COMMAND_PITCH: 6,
  RC_COMMAND_YAW: 7,
  RC_COMMAND_THROTTLE: 8,
  RC_CHANNEL_ROLL: 9,
  RC_CHANNEL_PITCH: 10,
  RC_CHANNEL_YAW: 11,
  RC_CHANNEL_THROTTLE: 12,
  RC_CHANNEL_AUX1: 13,
  RC_CHANNEL_AUX2: 14,
  RC_CHANNEL_AUX3: 15,
  RC_CHANNEL_8: 16,
  RC_CHANNEL_18: 26,
  STABILIZED_TV_ROLL: 27,
  STABILIZED_TV_PITCH: 28,
  STABILIZED_TV_YAW: 29,
};

export const SERVO_OUTPUT_COUNT = Mixer.SERVO_OUTPUT_COUNT; // 26
export const MOTOR_OUTPUT_OFFSET = Mixer.MOTOR_OUTPUT_OFFSET; // 27

// Sensor bits in FC.CONFIG.activeSensors (see serial_backend.js have_sensor).
const SENSOR_BITS = { acc: 0, baro: 1, mag: 2, gps: 3, sonar: 4, gyro: 5 };

// Serial receiver provider ids (rx_config.serialrx_provider) -> label. Kept
// local so the profile does not pull the receiver tab in. Matches
// src/tabs/receiver/protocols.js.
const SERIAL_RX_PROVIDERS = {
  0: "SPEKTRUM1024",
  1: "SPEKTRUM2048",
  2: "SBUS",
  3: "SUMD",
  4: "SUMH",
  5: "XBUS_MODE_B",
  6: "XBUS_MODE_B_RJ01",
  7: "IBUS",
  8: "JETIEXBUS",
  9: "CRSF",
  10: "SRXL",
  11: "CUSTOM",
  12: "FPORT",
  13: "SRXL2",
  14: "GHST",
  15: "SBUS2",
};

// Which flight axis (if any) a mixer input id represents.
export function axisOfInput(src) {
  switch (src) {
    case MIXER_IN.STABILIZED_ROLL:
    case MIXER_IN.RC_COMMAND_ROLL:
    case MIXER_IN.RC_CHANNEL_ROLL:
      return "roll";
    case MIXER_IN.STABILIZED_PITCH:
    case MIXER_IN.RC_COMMAND_PITCH:
    case MIXER_IN.RC_CHANNEL_PITCH:
      return "pitch";
    case MIXER_IN.STABILIZED_YAW:
    case MIXER_IN.RC_COMMAND_YAW:
    case MIXER_IN.RC_CHANNEL_YAW:
      return "yaw";
    case MIXER_IN.STABILIZED_THROTTLE:
    case MIXER_IN.RC_COMMAND_THROTTLE:
    case MIXER_IN.RC_CHANNEL_THROTTLE:
      return "throttle";
    case MIXER_IN.STABILIZED_TV_ROLL:
      return "tvRoll";
    case MIXER_IN.STABILIZED_TV_PITCH:
      return "tvPitch";
    case MIXER_IN.STABILIZED_TV_YAW:
      return "tvYaw";
    default:
      if (src >= MIXER_IN.RC_CHANNEL_AUX1 && src <= MIXER_IN.RC_CHANNEL_18) {
        return src === MIXER_IN.RC_CHANNEL_AUX1 ? "flap" : "aux";
      }
      return null;
  }
}

function isActiveRule(rule) {
  return (
    rule &&
    rule.oper !== Mixer.OP_NUL &&
    rule.dst > 0 &&
    rule.src > 0 &&
    (rule.weight !== 0 || rule.weightNeg !== 0)
  );
}

function ruleSign(rule) {
  const w = rule.weight !== 0 ? rule.weight : rule.weightNeg;
  return w < 0 ? -1 : 1;
}

// Classify one output from the set of axes that reach it.
function roleForAxes(axes, kind) {
  const has = (a) => axes.has(a);
  if (kind === "motor") {
    if (has("throttle") && has("yaw")) return "throttleDifferential";
    if (has("throttle")) return "throttle";
    return "motorOther";
  }
  if (has("roll") && has("pitch")) return "elevon";
  if (has("pitch") && has("yaw")) return "ruddervator";
  if (has("roll") && has("yaw")) return "rollYawMixed";
  if (has("roll")) return "aileron";
  if (has("pitch")) return "elevator";
  if (has("yaw")) return "rudder";
  if (has("tvRoll") || has("tvPitch") || has("tvYaw")) return "thrustVector";
  if (has("throttle")) return "throttleServo";
  if (has("flap")) return "flap";
  if (has("aux")) return "auxiliary";
  return "unknown";
}

// Firmware/wizard convention: for a paired roll surface the positively
// weighted one is the left side (S1 left aileron, S2 reversed = right); for a
// paired yaw surface the positive one is the right side (V-tail wizard puts
// YAW + on the right ruddervator).
function sideFromSign(role, signs) {
  if (role === "aileron" || role === "elevon") {
    return signs.roll < 0 ? "right" : "left";
  }
  if (role === "ruddervator") {
    return signs.yaw < 0 ? "left" : "right";
  }
  return null;
}

const PAIRED_ROLES = new Set(["aileron", "elevon", "ruddervator", "flap"]);

// Build the list of outputs (servos and motors) driven by the mixer, each
// with its role, side and per-axis sign.
export function deriveOutputs(rules) {
  const byDst = new Map();
  for (const rule of rules ?? []) {
    if (!isActiveRule(rule)) continue;
    if (!byDst.has(rule.dst)) byDst.set(rule.dst, []);
    byDst.get(rule.dst).push(rule);
  }

  const outputs = [];
  for (const [dst, dstRules] of [...byDst.entries()].sort((a, b) => a[0] - b[0])) {
    const kind = dst >= MOTOR_OUTPUT_OFFSET ? "motor" : "servo";
    const index = kind === "motor" ? dst - MOTOR_OUTPUT_OFFSET + 1 : dst;
    const axes = new Set();
    const signs = {};
    for (const rule of dstRules) {
      const axis = axisOfInput(rule.src);
      if (!axis) continue;
      axes.add(axis);
      if (!(axis in signs)) signs[axis] = ruleSign(rule);
    }
    const role = roleForAxes(axes, kind);
    outputs.push({
      dst,
      kind,
      index,
      label: kind === "motor" ? `M${index}` : `S${index}`,
      role,
      axes: [...axes],
      signs,
      side: sideFromSign(role, signs),
      rules: dstRules,
    });
  }

  // Sides for roles whose sign carries no left/right meaning (flaps) and
  // for any pair that ended up on the same side: fall back to output order.
  for (const role of PAIRED_ROLES) {
    const group = outputs.filter((o) => o.role === role);
    if (group.length === 2) {
      if (group[0].side === group[1].side || !group[0].side) {
        group[0].side = "left";
        group[1].side = "right";
      }
    } else if (group.length === 1 && !group[0].side) {
      group[0].side = role === "flap" ? "center" : "both";
    } else if (group.length > 2) {
      group.forEach((o, i) => {
        if (!o.side) o.side = i % 2 === 0 ? "left" : "right";
      });
    }
  }
  for (const o of outputs) {
    if (!o.side) o.side = "center";
  }

  return outputs;
}

function surfaceId(output) {
  const side = output.side && output.side !== "center" && output.side !== "both" ? output.side : "";
  return side ? `${output.role}.${side}` : output.role === "unknown" ? `${output.role}.${output.label}` : output.role;
}

function uidToHex(uid) {
  if (!Array.isArray(uid) || uid.length === 0) return "";
  return uid.map((n) => (n >>> 0).toString(16)).join("");
}

function channelMapString(rcMap) {
  const letters = ["A", "E", "R", "T", "1", "2", "3", "4"];
  if (!Array.isArray(rcMap) || rcMap.length < 4) return "";
  const out = new Array(Math.max(8, rcMap.length)).fill("?");
  rcMap.forEach((channel, fn) => {
    if (channel < out.length && letters[fn]) out[channel] = letters[fn];
  });
  return out.slice(0, 8).join("");
}

function deriveLink(fc) {
  const features = fc.FEATURE_CONFIG?.features;
  const enabled = (name) => (features && typeof features.isEnabled === "function" ? features.isEnabled(name) : false);
  const ports = fc.SERIAL_CONFIG?.ports ?? [];

  let type = "none";
  let port = null;
  if (enabled("RX_SERIAL")) {
    type = "serial";
    port = ports.find((p) => (p.functions ?? []).includes("RX_SERIAL")) ?? null;
  } else if (enabled("RX_PPM")) type = "ppm";
  else if (enabled("RX_PARALLEL_PWM")) type = "pwm";
  else if (enabled("RX_MSP")) type = "msp";
  else if (enabled("RX_SPI")) type = "spi";

  const providerId = fc.RX_CONFIG?.serialrx_provider ?? null;
  return {
    type,
    providerId,
    providerName: type === "serial" ? (SERIAL_RX_PROVIDERS[providerId] ?? `provider ${providerId}`) : null,
    portIdentifier: port ? port.identifier : null,
    portConfigured: type !== "serial" || port !== null,
    pulseMin: fc.RX_CONFIG?.rx_pulse_min ?? 0,
    pulseMax: fc.RX_CONFIG?.rx_pulse_max ?? 0,
    activeChannels: fc.RC?.active_channels ?? 0,
  };
}

function deriveArmSwitch(fc) {
  const names = fc.AUX_CONFIG ?? [];
  const ids = fc.AUX_CONFIG_IDS ?? [];
  const armIndex = names.indexOf("ARM");
  const armId = armIndex >= 0 ? (ids[armIndex] ?? 0) : 0;
  const range = (fc.MODE_RANGES ?? []).find(
    (r) => r && r.id === armId && r.range && r.range.start < r.range.end,
  );
  if (!range) return { bound: false, armId };
  return {
    bound: true,
    armId,
    auxChannelIndex: range.auxChannelIndex,
    channel: range.auxChannelIndex + 5, // 1-based RC channel number (AUX1 = ch5)
    start: range.range.start,
    end: range.range.end,
  };
}

function derivePeripherals(fc) {
  const features = fc.FEATURE_CONFIG?.features;
  const enabled = (name) => (features && typeof features.isEnabled === "function" ? features.isEnabled(name) : false);
  const sensors = fc.CONFIG?.activeSensors ?? 0;
  const hasSensor = (name) => ((sensors >> SENSOR_BITS[name]) & 1) === 1;
  return {
    gps: enabled("GPS"),
    ledStrip: enabled("LED_STRIP"),
    thrustVector: enabled("THRUST_VECTOR"),
    telemetry: enabled("TELEMETRY"),
    escSensor: enabled("ESC_SENSOR"),
    rssiAdc: enabled("RSSI_ADC"),
    freqSensor: enabled("FREQ_SENSOR"),
    blackbox: (fc.BLACKBOX?.blackboxDevice ?? 0) > 0,
    voltageSensor: (fc.BATTERY_CONFIG?.voltageMeterSource ?? 0) > 0,
    currentSensor: (fc.BATTERY_CONFIG?.currentMeterSource ?? 0) > 0,
    accelerometer: hasSensor("acc"),
    barometer: hasSensor("baro"),
    magnetometer: hasSensor("mag"),
    gpsFix: hasSensor("gps"),
    busServos: (fc.SERIAL_CONFIG?.ports ?? []).some(
      (p) => (p.functions ?? []).includes("FBUS_OUT") || (p.functions ?? []).includes("SBUS_OUT"),
    ),
  };
}

/**
 * Derive the Aircraft Profile.
 *
 * @param {object} fc      FC-shaped state (the real FC singleton or a fixture)
 * @param {object} extras  Data the CLI reader (stage 3) contributes:
 *                         { padsInUse, conflicts, boardProfile }
 */
export function deriveProfile(fc, extras = {}) {
  const config = fc.CONFIG ?? {};
  // No mixer config at all (nothing fetched yet) is "unknown", not the
  // firmware default airplane -- the profile must not guess.
  const modelType = fc.MIXER_CONFIG?.model_type ?? null;
  const typeInfo = modelType === null ? null : (Mixer.MODEL_TYPES.find((t) => t.value === modelType) ?? null);
  const isCustom = modelType === Mixer.MODEL_TYPE_CUSTOM;

  const outputs = deriveOutputs(fc.MIXER_RULES);
  const servos = outputs.filter((o) => o.kind === "servo");
  const motors = outputs.filter((o) => o.kind === "motor");

  const surfaces = servos
    .filter((o) => o.role !== "throttleServo")
    .map((o) => ({
      id: surfaceId(o),
      role: o.role,
      side: o.side,
      output: o.index,
      label: o.label,
      axes: o.axes,
      signs: o.signs,
      dst: o.dst,
    }));

  const axesDriven = { roll: false, pitch: false, yaw: false, throttle: false };
  for (const o of outputs) {
    for (const a of o.axes) if (a in axesDriven) axesDriven[a] = true;
  }

  // Layout: from the model type when it is a named type; otherwise inferred
  // from the surfaces so a Custom mixer still gets a drawing.
  let layout = typeInfo?.layout ?? null;
  if (!layout && modelType !== null) {
    layout = surfaces.some((s) => s.role === "elevon") ? "flyingWing" : surfaces.length ? "conventional" : "unknown";
  }

  const hasRole = (role) => surfaces.some((s) => s.role === role);
  const tail = hasRole("ruddervator")
    ? "vtail"
    : hasRole("rudder") && hasRole("elevator")
      ? "elevatorRudder"
      : hasRole("elevator")
        ? "elevatorOnly"
        : hasRole("rudder")
          ? "rudderOnly"
          : "none";

  const uidHex = uidToHex(config.uid);

  if (!layout) layout = "unknown";

  return {
    // Airframe
    modelType,
    modelTypeKey: typeInfo?.key ?? "UNKNOWN",
    isCustom,
    layout,
    tail,
    ailerons: surfaces.filter((s) => s.role === "aileron").length,
    hasFlaps: hasRole("flap"),
    hasRudder: hasRole("rudder") || hasRole("ruddervator"),
    surfaces,
    outputs,
    motorCount: motors.length,
    motors: motors.map((m) => ({ index: m.index, label: m.label, role: m.role, axes: m.axes, dst: m.dst })),
    differentialThrust: motors.some((m) => m.role === "throttleDifferential"),
    thrustVectorAxes: outputs.filter((o) => o.role === "thrustVector").flatMap((o) => o.axes),
    axesDriven,
    hasServos: servos.length > 0,
    hasMotors: motors.length > 0,
    isGlider: motors.length === 0,

    // Board
    board: {
      identifier: config.boardIdentifier ?? "",
      targetName: config.targetName ?? "",
      boardName: config.boardName ?? "",
      boardDesign: config.boardDesign ?? "",
      manufacturerId: config.manufacturerId ?? "",
      mcuTypeId: config.mcuTypeId ?? 255,
      uid: uidHex,
      craftName: config.name ?? "",
      firmwareVersion: config.flightControllerVersion ?? "",
      firmwareIdentifier: config.flightControllerIdentifier ?? "",
      apiVersion: config.apiVersion ?? "0.0.0",
      servoPads: config.servoCount ?? 0,
      motorPads: config.motorCount ?? 0,
      profile: extras.boardProfile ?? null,
      recognised: !!extras.boardProfile,
    },
    silkscreen: extras.boardProfile
      ? Object.fromEntries((extras.boardProfile.pads ?? []).map((p) => [p.pin, p.silkscreen]))
      : null,

    // Link
    link: deriveLink(fc),
    channelMap: Array.isArray(fc.RC_MAP) ? [...fc.RC_MAP] : [],
    channelMapString: channelMapString(fc.RC_MAP),
    armSwitch: deriveArmSwitch(fc),

    // Peripherals
    peripherals: derivePeripherals(fc),

    // Wiring (filled by the CLI reader in stage 3; null = not read yet)
    padsInUse: extras.padsInUse ?? null,
    conflicts: extras.conflicts ?? null,
  };
}
