// Servo output limits, matching the firmware (wingflight-firmware
// src/main/flight/servos.c). The stored min/max are kept as set, and
// servoTravelMin/Max() limit them against the center when the output is
// worked out, so center + travel stays inside the servo's signal range.
// Firmware before that change rewrote the stored min/max instead; either way
// servoTravelLimited() flags the servos it affects.

// Every servo has the same limits, whether it is sent on a PWM output, a bus
// channel (SBUS, F.Bus) or both.

// SERVO_SIGNAL_MIN/MAX (flight/servos.h): what a bus channel can carry
const SIGNAL = { min: 880, max: 2159 };
// SERVO_CENTER_MIN/MAX (flight/servos.h): a standard pulse on every servo
const CENTER = { min: 1000, max: 2000 };

// SERVO_LIMIT_MIN/MAX (flight/servos.h)
const TRAVEL_LIMIT = 1000;


export function servoSignalRange() {
  return SIGNAL;
}

// Travel range for the Min/Max fields, before the center is considered. The
// same for every servo: the FC stores what is set and limits it against the
// signal range when it works out the output.
export function servoTravelRange() {
  return { min: -TRAVEL_LIMIT, max: TRAVEL_LIMIT };
}

// Travel the output actually uses at this center (servoTravelMin/Max()).
export function servoUsableTravel(config) {
  const signal = servoSignalRange();
  return {
    min: Math.max(config.min, signal.min - config.mid),
    max: Math.min(config.max, signal.max - config.mid),
  };
}

// Whether min/max reach a limit set by the center rather than by the travel
// range, so the output stops short of (or exactly at) the signal limit.
export function servoTravelLimited(config) {
  const signal = servoSignalRange();
  const travel = servoTravelRange();
  const minLimit = signal.min - config.mid;
  const maxLimit = signal.max - config.mid;
  return {
    min: minLimit > travel.min && config.min <= minLimit,
    max: maxLimit < travel.max && config.max >= maxLimit,
  };
}

// Same fix the firmware's validateAndFixServoConfig() applies on every servo
// config write. It doesn't touch min/max against the center.
export function clampServoConfig(config) {
  config.mid = Math.min(Math.max(config.mid, CENTER.min), CENTER.max);
  config.min = Math.min(Math.max(config.min, -TRAVEL_LIMIT), 0);
  config.max = Math.min(Math.max(config.max, 0), TRAVEL_LIMIT);
}

// SERVO_TRIM_LIMIT_PERCENT (flight/servos.h): the trim, saved and live
// together, is limited to this share of the servo's larger scale.
const TRIM_LIMIT_PERCENT = 20;

export function servoTrimLimit(config) {
  return Math.trunc(
    (Math.max(config.rneg, config.rpos) * TRIM_LIMIT_PERCENT) / 100,
  );
}
