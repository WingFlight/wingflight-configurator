// Servos that drive the same control surface (e.g. two servos on one aileron).
//
// A follower takes the mixer output of the servo it follows, its primary, and
// then applies its own reverse, balance curve, scale, trim, center and limits
// (servoUpdate() in wingflight-firmware flight/servos.c). It needs no mixer
// rules of its own, and its speed limit is the primary's.
//
// FC.SERVO_FOLLOW holds, per servo, the servo it follows: 1-based, 0 for none.
// Only one level: a primary drives itself, and a follower can't be followed.
//
// Pure helpers, no FC import: scripts/tests/servo-groups.test.mjs loads this
// file in plain Node.

import { ServoBalanceCurve } from "./ServoBalanceCurve.js";

// SERVO_FLAG_REVERSED
const FLAG_REVERSE = 1;

// SERVO_SCALE_MIN/MAX and SERVO_CENTER_MIN/MAX (flight/servos.h)
const SCALE_MIN = 50;
const SCALE_MAX = 1000;
const CENTER_MIN = 1000;
const CENTER_MAX = 2000;

// The 0-based servo whose mixer output drives `servo`: its primary when it
// follows a valid one, otherwise the servo itself. Mirrors getServoPrimary().
export function primaryOf(follow, servo, servoCount = follow?.length ?? 0) {
  const primary = follow?.[servo] ?? 0;
  if (!primary) return servo;
  const index = primary - 1;
  if (index === servo || index >= servoCount || follow[index]) return servo;
  return index;
}

export function isFollower(follow, servo, servoCount) {
  return primaryOf(follow, servo, servoCount) !== servo;
}

// Primaries that have followers, in servo order:
// [{ primary, followers: [servo, ...] }], all 0-based.
export function servoGroups(follow, servoCount = follow?.length ?? 0) {
  const groups = new Map();
  for (let servo = 0; servo < servoCount; servo++) {
    const primary = primaryOf(follow, servo, servoCount);
    if (primary === servo) continue;
    if (!groups.has(primary)) groups.set(primary, []);
    groups.get(primary).push(servo);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([primary, followers]) => ({ primary, followers }));
}

// Servos (0-based) that `servo` could follow: any other servo that drives
// itself. None while other servos follow `servo` itself, since a primary
// can't become a follower.
export function followChoices(follow, servo, servoCount) {
  const followed = Array.from({ length: servoCount }, (_, i) => i).some(
    (i) => i !== servo && follow?.[i] === servo + 1,
  );
  if (followed) return [];
  return Array.from({ length: servoCount }, (_, i) => i).filter(
    (i) => i !== servo && !follow?.[i],
  );
}

// Servos with mixer rules of their own that the FC ignores because they
// follow another servo (0-based).
export function followersWithRules(follow, rules, servoCount) {
  const servos = new Set();
  for (const rule of rules ?? []) {
    if (!rule?.oper) continue;
    const servo = rule.dst - 1;
    if (servo >= 0 && servo < servoCount && isFollower(follow, servo, servoCount)) {
      servos.add(servo);
    }
  }
  return [...servos].sort((a, b) => a - b);
}

function reversed(config) {
  return (config.flags & FLAG_REVERSE) !== 0;
}

// Starts a follower from its primary's travel: the same scale and limits on
// each side of the surface, swapped when one of the two is mounted the other
// way round (reverse set on only one). Center, reverse, geometry correction
// and the balance curve are its own and are left alone.
export function copyPrimaryTravel(primary, follower) {
  const swap = reversed(primary) !== reversed(follower);
  if (swap) {
    follower.rpos = primary.rneg;
    follower.rneg = primary.rpos;
    follower.max = -primary.min;
    follower.min = -primary.max;
  } else {
    follower.rpos = primary.rpos;
    follower.rneg = primary.rneg;
    follower.max = primary.max;
    follower.min = primary.min;
  }
}

//// Balancing
//
// The surface is held at a few points of the primary's command (1000 = full
// stick one way). At each one the follower is moved, in us, until it sits
// where the primary does. Each point moves a different setting, so the
// points don't undo each other when taken in this order:
//   - center: the follower's Center (mid),
//   - the ends: its Scale on that side (rpos/rneg),
//   - half way: its balance curve, which bends the travel in between.

export const BALANCE_POINTS = [
  { key: "center", command: 0 },
  { key: "endPos", command: 1000 },
  { key: "endNeg", command: -1000 },
  { key: "halfPos", command: 500 },
  { key: "halfNeg", command: -500 },
];

// x of the balance curve points the tool sets. The ends and the center stay
// at 0: those are taken up by Scale and Center.
export const BALANCE_CURVE_X = [-1000, -500, 0, 500, 1000];

// The balance curve shape this tool works on: five points, BALANCE_CURVE_X.
export function isBalanceCurve(curve) {
  return (
    curve?.count === BALANCE_CURVE_X.length &&
    BALANCE_CURVE_X.every((x, i) => curve.points[i].x === x)
  );
}

// A copy of `curve` in the balance tool's shape: kept as it is if it already
// has it, otherwise flat (no correction).
export function balanceCurve(curve) {
  if (isBalanceCurve(curve)) {
    return ServoBalanceCurve.cloneCurve(curve);
  }
  const points = BALANCE_CURVE_X.map((x) => ({ x, y: 0 }));
  while (points.length < ServoBalanceCurve.POINT_COUNT) {
    points.push({ x: 0, y: 0 });
  }
  return { count: BALANCE_CURVE_X.length, points };
}

// The setting a point moves on this follower: "mid", "rpos", "rneg" or
// "curve". The end points use the scale of the side the follower moves to,
// which is the other side when it is reversed.
export function balanceSetting(point, config) {
  if (point.command === 0) return "mid";
  if (Math.abs(point.command) < 1000) return "curve";
  const up = point.command > 0;
  return up !== reversed(config) ? "rpos" : "rneg";
}

// Where the follower's output is, in us, for the primary's command (-1000..1000):
// the firmware's chain after the mixer, without the speed limit and limits.
export function followerOutput(config, curve, command, trim = 0) {
  let pos = command / 1000;
  if (curve) {
    pos += ServoBalanceCurve.evaluate(curve, pos * 1000) / 1000;
  }
  if (reversed(config)) pos = -pos;
  const scale = pos > 0 ? config.rpos : config.rneg;
  return config.mid + scale * pos + trim;
}

// Moves the follower's output at `point` by `deltaUs` (positive is a longer
// pulse), through the setting balanceSetting() names. Changes `config` or
// `curve` in place and returns the setting changed, or null when it is at its
// limit already. The curve must be in the balance tool's shape.
export function nudgeBalance(point, config, curve, deltaUs) {
  const setting = balanceSetting(point, config);

  if (setting === "mid") {
    const mid = clamp(config.mid + deltaUs, CENTER_MIN, CENTER_MAX);
    if (mid === config.mid) return null;
    config.mid = mid;
    return setting;
  }

  if (setting === "rpos" || setting === "rneg") {
    // At the end the output is mid + rpos, or mid - rneg: a longer pulse is
    // more rpos, or less rneg.
    const step = setting === "rpos" ? deltaUs : -deltaUs;
    const scale = clamp(config[setting] + step, SCALE_MIN, SCALE_MAX);
    if (scale === config[setting]) return null;
    config[setting] = scale;
    return setting;
  }

  // The curve adds y / 1000 to the command before reverse and scale, so 1 us
  // is 1000 / scale of y, the other way round when reversed. At least one
  // step, so a small nudge always moves it.
  const index = BALANCE_CURVE_X.indexOf(point.command);
  const point_ = curve.points[index];
  const command = point.command / 1000 + point_.y / 1000;
  const sideUp = (command > 0) !== reversed(config);
  const scale = sideUp ? config.rpos : config.rneg;
  const sign = reversed(config) ? -1 : 1;
  let dy = Math.round((deltaUs * 1000 * sign) / scale);
  if (dy === 0) dy = Math.sign(deltaUs) * sign;
  const y = clamp(
    point_.y + dy,
    ServoBalanceCurve.Y_MIN,
    ServoBalanceCurve.Y_MAX,
  );
  if (y === point_.y) return null;
  point_.y = y;
  return setting;
}

// How far the balance curve point at `point` is from its limit, as a share
// (0..1): near 1 the follower is too far off to balance with the curve, and
// the linkage should be adjusted instead.
export function balanceCurveUse(point, curve) {
  const index = BALANCE_CURVE_X.indexOf(point.command);
  if (index < 0 || !curve) return 0;
  return Math.abs(curve.points[index].y) / ServoBalanceCurve.Y_MAX;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
