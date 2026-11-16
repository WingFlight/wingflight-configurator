// Balancing two servos that drive the same control surface (e.g. two servos
// on one aileron) with the balanced servo's balance curve.
//
// Two servos never track each other exactly: horns, linkages and the servos
// themselves differ a little, so at some points of the travel one pushes
// against the other. The balance curve (FC.SERVO_CURVES, see
// ServoBalanceCurve.js) adds a small offset to the servo's output at each
// of its points, so the balanced servo can be matched to the other one, the
// reference, along the whole travel.
//
// Pure helpers, no FC import: scripts/tests/servo-balance.test.mjs loads this
// file in plain Node.

import { ServoBalanceCurve } from "./ServoBalanceCurve.js";

// SERVO_FLAG_REVERSED
const FLAG_REVERSE = 1;

// Stabilized roll/pitch/yaw and the flap channel (MIXER_IN_RC_CHANNEL_AUX1):
// the inputs that move a surface, in the order a shared one is looked for.
const SURFACE_INPUTS = [1, 2, 3, 13];

// Point counts the tool offers: the ends only (a straight offset or tilt),
// or evenly spaced points for a bend in between.
export const POINT_COUNTS = [2, 5, 9];

function reversed(config) {
  return (config.flags & FLAG_REVERSE) !== 0;
}

function rulesFor(rules, servo) {
  return (rules ?? []).filter((rule) => rule?.oper && rule.dst === servo + 1);
}

function ruleSign(rule) {
  const weight = rule.weight !== 0 ? rule.weight : rule.weightNeg;
  return weight < 0 ? -1 : 1;
}

// Whether servos `a` and `b` (0-based) are mixed the same way: the same inputs
// with the same weights, perhaps all of opposite sign. Two servos on one
// surface are; a left and a right aileron (opposite roll, same pitch on a
// flaperon) are not.
export function sameMix(rules, a, b) {
  const key = (servo, sign) =>
    rulesFor(rules, servo)
      .map((r) => `${r.oper}:${r.src}:${sign * r.weight}:${sign * r.weightNeg}`)
      .sort()
      .join("|");
  const keyA = key(a, 1);
  if (!keyA) return false;
  return keyA === key(b, 1) || keyA === key(b, -1);
}

// Servos (0-based) mixed the same way as `servo`: the likely other servos on
// its surface.
export function referenceCandidates(rules, servo, servoCount) {
  return Array.from({ length: servoCount }, (_, i) => i).filter(
    (i) => i !== servo && sameMix(rules, servo, i),
  );
}

// +1 when the mix moves `reference` the same way as `servo`, -1 when it has
// the opposite weight (mounted mirrored and reversed in the mix rather than
// with the servo's Reverse flag), from the first surface input they share.
// null when they share none.
export function mixDirection(rules, servo, reference) {
  const own = rulesFor(rules, servo);
  const other = rulesFor(rules, reference);
  for (const input of SURFACE_INPUTS) {
    const a = own.find((r) => r.src === input);
    const b = other.find((r) => r.src === input);
    if (a && b) return ruleSign(a) * ruleSign(b);
  }
  return null;
}

// Override values (-1000..1000, the servo's mixer output) that hold both
// servos where the mix would put them for `x` on the balanced servo. The
// overrides go in before reverse and the balance curve, like the mixer
// output does (servoUpdate() in flight/servos.c).
export function holdCommands(x, direction) {
  return { servo: x, reference: x * (direction ?? 1) };
}

// The balanced servo's curve with `count` evenly spaced points, keeping the
// offsets it has (worked out at the new points).
export function resampleCurve(curve, count) {
  const points = Array.from({ length: count }, (_, i) => {
    const x = Math.round(
      ServoBalanceCurve.X_MIN +
        ((ServoBalanceCurve.X_MAX - ServoBalanceCurve.X_MIN) * i) / (count - 1),
    );
    const y = curve ? Math.round(ServoBalanceCurve.evaluate(curve, x)) : 0;
    return { x, y: clamp(y, ServoBalanceCurve.Y_MIN, ServoBalanceCurve.Y_MAX) };
  });
  while (points.length < ServoBalanceCurve.POINT_COUNT) {
    points.push({ x: 0, y: 0 });
  }
  return { count, points };
}

// Where the servo's output is, in us, for a mixer output (or override) of
// `command` (-1000..1000): the firmware's chain after the mixer, without the
// speed limit and the travel limits.
export function servoOutput(config, curve, command, trim = 0) {
  let pos = command / 1000;
  if (curve) {
    pos += ServoBalanceCurve.evaluate(curve, command) / 1000;
  }
  if (reversed(config)) pos = -pos;
  const scale = pos > 0 ? config.rpos : config.rneg;
  return config.mid + scale * pos + trim;
}

// Moves the servo's output at curve point `index` by `deltaUs` (positive is
// a longer pulse) by changing that point's offset. The offset is added
// before reverse and scale, so 1 us is 1000 / scale of it, the other way
// round when reversed. Always at least one step, so a small nudge moves it.
// Changes `curve` in place; returns false when the point is at its limit.
export function nudgeCurvePoint(config, curve, index, deltaUs) {
  const point = curve.points[index];
  const pos = (point.x + point.y) / 1000;
  const sign = reversed(config) ? -1 : 1;
  const scale = pos * sign >= 0 ? config.rpos : config.rneg;
  let dy = Math.round((deltaUs * 1000 * sign) / scale);
  if (dy === 0) dy = Math.sign(deltaUs) * sign;
  const y = clamp(point.y + dy, ServoBalanceCurve.Y_MIN, ServoBalanceCurve.Y_MAX);
  if (y === point.y) return false;
  point.y = y;
  return true;
}

// The offset at a point in us, for showing next to its percentage.
export function pointOffsetUs(config, curve, index) {
  const point = curve.points[index];
  return Math.round(
    servoOutput(config, curve, point.x) -
      servoOutput(config, null, point.x),
  );
}

// How much of the curve's range a point uses (0..1). Near 1 the servos are
// too far apart for the curve: the linkage should be adjusted instead.
export function pointUse(curve, index) {
  return Math.abs(curve.points[index].y) / ServoBalanceCurve.Y_MAX;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
