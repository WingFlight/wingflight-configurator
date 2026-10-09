// Servo output limits, matching the firmware (wingflight-firmware
// src/main/flight/servos.c). The stored min/max are kept as set, and
// servoTravelMin/Max() limit them against the center when the output is
// worked out, so center + travel stays inside the servo's signal range.
// Firmware before that change rewrote the stored min/max instead; either way
// servoTravelLimited() flags the servos it affects.

// PWM_SERVO_PULSE_MIN/MAX (rx/rx.h)
const PWM_SIGNAL = { min: 50, max: 2250 };
// BUS_SERVO_MIN/MAX_SIGNAL (pg/bus_servo.h)
const BUS_SIGNAL = { min: 1000, max: 2000 };

// SERVO_LIMIT_MIN/MAX (flight/servos.h)
const TRAVEL_LIMIT = 1000;

// Travel the Servos tab offers either side of center. Bus servos only span
// 1000-2000, so a centered bus servo can't use more than 500.
const PWM_TRAVEL = 1000;
const BUS_TRAVEL = 500;

export function servoSignalRange(isBusServo) {
  return isBusServo ? BUS_SIGNAL : PWM_SIGNAL;
}

// Travel range for the Min/Max fields, before the center is considered.
export function servoTravelRange(isBusServo) {
  const travel = isBusServo ? BUS_TRAVEL : PWM_TRAVEL;
  return { min: -travel, max: travel };
}

// Travel the output actually uses at this center (servoTravelMin/Max()).
export function servoUsableTravel(config, isBusServo) {
  const signal = servoSignalRange(isBusServo);
  return {
    min: Math.max(config.min, signal.min - config.mid),
    max: Math.min(config.max, signal.max - config.mid),
  };
}

// Whether min/max reach a limit set by the center rather than by the travel
// range, so the output stops short of (or exactly at) the signal limit.
export function servoTravelLimited(config, isBusServo) {
  const signal = servoSignalRange(isBusServo);
  const travel = servoTravelRange(isBusServo);
  const minLimit = signal.min - config.mid;
  const maxLimit = signal.max - config.mid;
  return {
    min: minLimit > travel.min && config.min <= minLimit,
    max: maxLimit < travel.max && config.max >= maxLimit,
  };
}

// Same fix the firmware's validateAndFixServoConfig() applies on every servo
// config write. It doesn't touch min/max against the center.
export function clampServoConfig(config, isBusServo) {
  const signal = servoSignalRange(isBusServo);
  config.mid = Math.min(Math.max(config.mid, signal.min), signal.max);
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
