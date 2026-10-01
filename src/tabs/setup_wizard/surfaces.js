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

// Servo config flags (SERVO_FLAG_REVERSED).
export const SERVO_FLAG_REVERSE = 1;

// Axis Gain range offered by the Mixer tab (percent).
export const AXIS_GAIN_MIN = 0;
export const AXIS_GAIN_MAX = 200;

// Scale range the wizard will set (us per unit of output). Below this a
// side has almost no travel; above the travel limit it only clips.
export const SCALE_MIN = 50;

// Contribution of each stabilized axis to each servo output, as weight
// fractions for positive and negative input. Only SET/ADD rules count; MUL
// rules and logic conditions are ignored, since the wizard sets up the
// plain surface mix.
export function surfacesFromRules(rules, servoCount) {
  const byServo = new Map();

  for (const rule of rules) {
    if (rule.oper !== OP_SET && rule.oper !== OP_ADD) continue;
    const axis = AXES.find((a) => a.input === rule.src);
    if (!axis) continue;
    const servo = rule.dst - 1;
    if (servo < 0 || servo >= servoCount) continue;

    if (!byServo.has(servo)) {
      byServo.set(servo, { servo, axes: {} });
    }
    const entry = byServo.get(servo);
    const prev = entry.axes[axis.key] ?? { pos: 0, neg: 0 };
    const set = rule.oper === OP_SET;
    entry.axes[axis.key] = {
      pos: (set ? 0 : prev.pos) + rule.weight / 1000,
      neg: (set ? 0 : prev.neg) + rule.weightNeg / 1000,
    };
  }

  return [...byServo.values()]
    .filter((s) => Object.values(s.axes).some((w) => w.pos !== 0 || w.neg !== 0))
    .sort((a, b) => a.servo - b.servo)
    .map((s) => ({ ...s, kind: surfaceKind(s.axes) }));
}

export function surfaceKind(axes) {
  const has = (k) => axes[k] && (axes[k].pos !== 0 || axes[k].neg !== 0);
  const roll = has("roll");
  const pitch = has("pitch");
  const yaw = has("yaw");
  if (roll && pitch && !yaw) return "elevon";
  if (pitch && yaw && !roll) return "ruddervator";
  if (roll && !pitch && !yaw) return "aileron";
  if (pitch && !roll && !yaw) return "elevator";
  if (yaw && !roll && !pitch) return "rudder";
  return "mixed";
}

// The axis the wizard uses to move a surface on its own.
export function primaryAxis(surface) {
  switch (surface.kind) {
    case "aileron":
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

// Servo side ("pos" uses rpos/max, "neg" uses rneg/min) that a mixer output
// lands on after the servo's reverse flag.
export function servoSide(output, reversed) {
  const signed = reversed ? -output : output;
  return signed >= 0 ? "pos" : "neg";
}

// Worst-case reach of each servo side with every axis at full stick in the
// direction that pushes that side furthest, in us and as a fraction of the
// side's travel limit. reach > 1 means the surface hits its limit before
// full stick on every axis at once.
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

  const posUs = pos * servoConfig.rpos;
  const negUs = -neg * servoConfig.rneg;
  const posLimit = Math.max(servoConfig.max, 0);
  const negLimit = Math.max(-servoConfig.min, 0);

  return {
    pos: { us: posUs, limit: posLimit, fraction: posLimit > 0 ? posUs / posLimit : 0 },
    neg: { us: negUs, limit: negLimit, fraction: negLimit > 0 ? negUs / negLimit : 0 },
  };
}

// New Axis Gain (percent) that turns the measured throw into the target,
// assuming throw is proportional to gain.
export function gainForThrow(currentPercent, measured, target) {
  if (!(measured > 0) || !(target > 0)) return currentPercent;
  const next = Math.round((currentPercent * target) / measured);
  return Math.min(AXIS_GAIN_MAX, Math.max(AXIS_GAIN_MIN, next));
}

// New scale (us) for one servo side that turns the measured throw into the
// target. `output` is the mixer output on that side at the stick position
// that was measured (its magnitude). The throw was measured where the servo
// actually got to, which is the travel limit if scale x output passed it, so
// the correction starts from there. The result is capped so the new throw
// stays inside the limit rather than clipping against it.
export function scaleForThrow(currentScale, output, measured, target, sideLimit) {
  const out = Math.abs(output);
  if (!(measured > 0) || !(target > 0) || !(out > 0)) return currentScale;
  const reached = sideLimit > 0 ? Math.min(currentScale * out, sideLimit) : currentScale * out;
  let next = (reached * target) / measured / out;
  if (sideLimit > 0) next = Math.min(next, sideLimit / out);
  return Math.max(SCALE_MIN, Math.round(next));
}
