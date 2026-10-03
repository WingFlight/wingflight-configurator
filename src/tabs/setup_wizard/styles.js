// Flying-style starting points, applied to roll, pitch and yaw:
//  - rates: deg/s at full stick and expo percent (the Rates tab holds rate as
//    deg/s / 500 and expo as a fraction). Yaw has its own, lower rate: a
//    rudder turns a plane far slower than the ailerons roll it, and a yaw
//    rate the airframe cannot reach leaves an error the rate loop never
//    closes, so P and I drive the rudder to full travel on a small input.
//    3D keeps a high yaw rate for knife-edge and harriers;
//  - I-term relax score (1-10, pidItermRelaxCutoff() in the firmware's
//    flight/pid.c: higher holds I back longer after a stick movement) and
//    relax level (deg/s of stick movement at which I is held fully).
// Sport is the firmware default for relax. Trainer lets I hold trim against
// wind sooner; 3D keeps I from winding up through big, fast inputs, which
// shows as bounce-back at the end of a snap or roll.
export const STYLES = [
  { key: "trainer", rate: 150, yawRate: 90, expo: 20, relax: 3, relaxLevel: 30 },
  { key: "sport", rate: 250, yawRate: 120, expo: 30, relax: 5, relaxLevel: 22 },
  { key: "3d", rate: 500, yawRate: 300, expo: 60, relax: 7, relaxLevel: 15 },
];

export const STYLE_AXES = ["roll", "pitch", "yaw"];
const AXIS_SUFFIX = { roll: "Roll", pitch: "Pitch", yaw: "Yaw" };

export function styleRate(style, axis) {
  return axis === "yaw" ? style.yawRate : style.rate;
}

export function rateOf(rcTuning, axis) {
  return Math.round(rcTuning[`${axis}_rc_rate`] * 500);
}

export function expoOf(rcTuning, axis) {
  return Math.round(rcTuning[`${axis}_rc_expo`] * 100);
}

export function relaxOf(pidProfile, axis) {
  return pidProfile[`bounceback${AXIS_SUFFIX[axis]}`];
}

export function relaxLevelOf(pidProfile, axis) {
  return pidProfile[`itermRelaxLevel${AXIS_SUFFIX[axis]}`];
}

export function matchingStyle(rcTuning, pidProfile) {
  return (
    STYLES.find((style) =>
      STYLE_AXES.every(
        (a) =>
          rateOf(rcTuning, a) === styleRate(style, a) &&
          expoOf(rcTuning, a) === style.expo &&
          relaxOf(pidProfile, a) === style.relax &&
          relaxLevelOf(pidProfile, a) === style.relaxLevel,
      ),
    ) ?? null
  );
}

export function applyStyle(style, rcTuning, pidProfile) {
  for (const axis of STYLE_AXES) {
    rcTuning[`${axis}_rc_rate`] = styleRate(style, axis) / 500;
    rcTuning[`${axis}_rc_expo`] = style.expo / 100;
    pidProfile[`bounceback${AXIS_SUFFIX[axis]}`] = style.relax;
    pidProfile[`itermRelaxLevel${AXIS_SUFFIX[axis]}`] = style.relaxLevel;
  }
}
