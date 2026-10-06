// Pure helpers for the Setup Wizard: which servos are control surfaces, how
// far full stick drives each one, and the gain/scale changes that turn a
// measured throw into a wanted one. Mirrors the firmware signal chain
// (wingflight-firmware flight/mixer.c mixerUpdateRules() and flight/servos.c
// servoUpdate()):
//
//   input (+-1) * axis gain -> rule weight (input >= 0) / weightNeg (< 0)
//   -> sum on the output -> servo reverse -> scale rpos/rneg (us) -> min/max

// Stabilized mixer inputs (MIXER_IN_STABILIZED_ROLL/PITCH/YAW).
export const AXES = [
  { key: "roll", input: 1 },
  { key: "pitch", input: 2 },
  { key: "yaw", input: 3 },
];

const OP_SET = 1;
const OP_ADD = 2;

// MIXER_IN_RC_CHANNEL_AUX1, the channel the Mixer setup drives flaps from.
// The wizard takes channel centre as flaps up and positive as flaps down,
// the same as the flaperon mix (Mixer.buildWizardRules()).
export const FLAP_INPUT = 13;

// Servo config flags (SERVO_FLAG_REVERSED).
export const SERVO_FLAG_REVERSE = 1;

// Axis Gain range offered by the Mixer tab (percent).
export const AXIS_GAIN_MIN = 0;
export const AXIS_GAIN_MAX = 200;

// Scale range the wizard will set (us per unit of output). Below the
// minimum a side has almost no travel; the maximum is the servo travel limit
// (SERVO_LIMIT_MAX in the firmware's flight/servos.h).
export const SCALE_MIN = 50;
export const SCALE_MAX = 1000;

// Contribution of each stabilized axis to each servo output, as weight
// fractions for positive and negative input. Only SET/ADD rules count; MUL
// rules and logic conditions are ignored, since the wizard sets up the
// plain surface mix. The flap channel is kept apart as `flap` (in the same
// pos/neg form). `base` is the input of the servo's last SET rule (an axis
// key or "flap"): the input the servo is built on, which the rest are ADDed
// onto.
export function surfacesFromRules(rules, servoCount) {
  const byServo = new Map();

  for (const rule of rules) {
    if (rule.oper !== OP_SET && rule.oper !== OP_ADD) continue;
    const axis = AXES.find((a) => a.input === rule.src);
    if (!axis && rule.src !== FLAP_INPUT) continue;
    const servo = rule.dst - 1;
    if (servo < 0 || servo >= servoCount) continue;

    if (!byServo.has(servo)) {
      byServo.set(servo, { servo, axes: {}, flap: null, base: null });
    }
    const entry = byServo.get(servo);
    const prev = (axis ? entry.axes[axis.key] : entry.flap) ?? { pos: 0, neg: 0 };
    const set = rule.oper === OP_SET;
    const next = {
      pos: (set ? 0 : prev.pos) + rule.weight / 1000,
      neg: (set ? 0 : prev.neg) + rule.weightNeg / 1000,
    };
    if (axis) entry.axes[axis.key] = next;
    else entry.flap = next;
    if (set) entry.base = axis ? axis.key : "flap";
  }

  return [...byServo.values()]
    .filter((s) => moves(s.flap) || Object.values(s.axes).some(moves))
    .sort((a, b) => a.servo - b.servo)
    .map((s) => ({ ...s, kind: surfaceKind(s.axes, s.flap, s.base) }));
}

function moves(w) {
  return !!w && (w.pos !== 0 || w.neg !== 0);
}

export function surfaceKind(axes, flap, base = null) {
  const roll = moves(axes.roll);
  const pitch = moves(axes.pitch);
  const yaw = moves(axes.yaw);
  // A flap servo, alone or with roll ADDed on (flaps that follow the
  // ailerons).
  if (moves(flap) && !pitch && !yaw && (!roll || base === "flap")) {
    return "flap";
  }
  if (roll && pitch && !yaw) return "elevon";
  if (pitch && yaw && !roll) return "ruddervator";
  if (roll && !pitch && !yaw) {
    return moves(flap) ? "flaperon" : "aileron";
  }
  if (pitch && !roll && !yaw) return "elevator";
  if (yaw && !roll && !pitch) return "rudder";
  return "mixed";
}

// The input the wizard uses to move a surface on its own: an axis key, or
// "flap" for the flap channel.
export function primaryAxis(surface) {
  switch (surface.kind) {
    case "flap":
      return "flap";
    case "aileron":
    case "flaperon":
      return "roll";
    case "rudder":
      return "yaw";
    default:
      return surface.axes.pitch ? "pitch" : Object.keys(surface.axes)[0];
  }
}

// Mixer output for this surface with the given axis held at +1 or -1
// (stick = +1 / -1) and every other axis at 0.
export function outputForAxis(surface, axisKey, stick, axisGains) {
  const w = surface.axes[axisKey];
  if (!w) return 0;
  const gain = axisGains[axisKey] ?? 1;
  const input = stick * gain;
  return input >= 0 ? input * w.pos : input * w.neg;
}

// Mixer output for this surface with the flap channel at +1 (full flap) or
// -1 and every axis at 0.
export function outputForFlap(surface, stick) {
  const w = surface.flap;
  if (!w) return 0;
  return stick >= 0 ? stick * w.pos : stick * w.neg;
}

// Servo side ("pos" uses rpos/max, "neg" uses rneg/min) that a mixer output
// lands on after the servo's reverse flag.
export function servoSide(output, reversed) {
  const signed = reversed ? -output : output;
  return signed >= 0 ? "pos" : "neg";
}

// Worst-case reach of each servo side with every axis at full stick in the
// direction that pushes that side furthest (and the flap channel, if the
// surface has one, at whichever end does the same), in us and as a fraction
// of the side's travel limit. reach > 1 means the surface hits its limit
// before full stick on every axis at once.
export function travelReach(surface, servoConfig, axisGains) {
  const reversed = (servoConfig.flags & SERVO_FLAG_REVERSE) !== 0;
  let pos = 0;
  let neg = 0;

  for (const axisKey of Object.keys(surface.axes)) {
    const up = outputForAxis(surface, axisKey, 1, axisGains);
    const down = outputForAxis(surface, axisKey, -1, axisGains);
    const a = reversed ? -up : up;
    const b = reversed ? -down : down;
    pos += Math.max(a, b, 0);
    neg += Math.min(a, b, 0);
  }

  if (surface.flap) {
    // Flap channel at +1 (weight) and -1 (weightNeg).
    const up = reversed ? -surface.flap.pos : surface.flap.pos;
    const down = reversed ? surface.flap.neg : -surface.flap.neg;
    pos += Math.max(up, down, 0);
    neg += Math.min(up, down, 0);
  }

  const posUs = pos * servoConfig.rpos;
  const negUs = -neg * servoConfig.rneg;
  const posLimit = Math.max(servoConfig.max, 0);
  const negLimit = Math.max(-servoConfig.min, 0);

  return {
    pos: { us: posUs, limit: posLimit, fraction: posLimit > 0 ? posUs / posLimit : 0 },
    neg: { us: negUs, limit: negLimit, fraction: negLimit > 0 ? negUs / negLimit : 0 },
  };
}

// Largest scale (us) for one servo side at which full stick (mixer output
// `output` on that side) still stays inside the side's binding limit. Past
// it the surface would stop at the limit before full stick.
export function maxScale(output, sideLimit) {
  const out = Math.abs(output);
  if (!(out > 0) || !(sideLimit > 0)) return SCALE_MAX;
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.floor(sideLimit / out)));
}
