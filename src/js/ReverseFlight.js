// Bidirectional (4D) throttle and reverse flight: wingflight-firmware
// pg/reverse_flight.h and flight/reverse_flight.c. With throttle_mode
// BIDIRECTIONAL the throttle is neutral at mid stick, forward above and reverse
// below, and the firmware flips the stabilisation when the aircraft reverses.

export const THROTTLE_MODE_NORMAL = 0;
export const THROTTLE_MODE_BIDIRECTIONAL = 1;

// reverseFlightState_e, for the live status
export const REVERSE_FLIGHT_STATES = [
  "off",
  "disarmed",
  "ground",
  "motorStopped",
  "forward",
  "handover",
  "reverse",
];

// pg/reverse_flight.c defaults
export const REVERSE_FLIGHT_DEFAULTS = {
  throttle_mode: THROTTLE_MODE_NORMAL,
  throttle_deadband: 40,
  throttle_reverse_hysteresis: 50,
  throttle_reverse_limit: 100,
  reverse_motor_time: 80,
  reverse_time_constant: 400,
  reverse_surface_gain: 100,
  reverse_fade: 15,
  reverse_motor_dwell: 0,
  reverse_coupled_axes: 0,
};

// reverse_coupled_axes bits: one servo moves both this axis' surface and the gimbal
export const COUPLED_AXIS_ROLL = 1 << 0;
export const COUPLED_AXIS_PITCH = 1 << 1;
export const COUPLED_AXIS_YAW = 1 << 2;

// MSP2_WING_REVERSE_FLIGHT_CONFIG payload version 1. Returns null for an empty
// reply (firmware without the message).
export function readReverseFlightConfig(data) {
  // 18 bytes: version, 4 x U8, 3 x U16, 3 x U8, U16 neutral, 2 x U8
  if (data.byteLength < 18) {
    return null;
  }
  data.readU8(); // payload version
  return {
    throttle_mode: data.readU8(),
    throttle_deadband: data.readU8(),
    throttle_reverse_hysteresis: data.readU8(),
    throttle_reverse_limit: data.readU8(),
    reverse_motor_time: data.readU16(),
    reverse_time_constant: data.readU16(),
    reverse_surface_gain: data.readU16(),
    reverse_fade: data.readU8(),
    reverse_motor_dwell: data.readU8(),
    reverse_coupled_axes: data.readU8(),
    // read only: throttle channel value for zero thrust, follows the RC settings
    throttle_neutral: data.readU16(),
    // bit n = motor n+1 runs bidirectional (motor_control_mode BIDIR)
    motor_bidir_mask: data.readU8(),
    motor_count: data.readU8(),
  };
}

// MSP2_WING_SET_REVERSE_FLIGHT_CONFIG: the read without its version byte, the
// neutral and the motor count (14 bytes).
export function writeReverseFlightConfig(buffer, config) {
  buffer
    .push8(config.throttle_mode)
    .push8(config.throttle_deadband)
    .push8(config.throttle_reverse_hysteresis)
    .push8(config.throttle_reverse_limit)
    .push16(config.reverse_motor_time)
    .push16(config.reverse_time_constant)
    .push16(config.reverse_surface_gain)
    .push8(config.reverse_fade)
    .push8(config.reverse_motor_dwell)
    .push8(config.reverse_coupled_axes)
    .push8(config.motor_bidir_mask);
}

// MSP2_WING_REVERSE_FLIGHT_STATUS payload version 1. Factors and estimates are
// x1000 on the wire.
export function readReverseFlightStatus(data) {
  if (data.byteLength < 19) {
    return null;
  }
  data.readU8(); // payload version
  return {
    enabled: data.readU8() !== 0,
    state: data.readU8(),
    direction: data.read8(),
    stickInDeadband: data.readU8() !== 0,
    throttleChannel: data.readU16(),
    stickThrust: data.read16() / 1000,
    motorCommand: data.read16() / 1000,
    thrustEstimate: data.read16() / 1000,
    speedEstimate: data.read16() / 1000,
    vectorFactor: data.read16() / 1000,
    surfaceFactor: data.read16() / 1000,
  };
}

// Bidirectional throttle needs every motor in bidirectional mode, so the
// Configurator sets the motor modes together with the throttle mode.
export function motorMaskForThrottleMode(throttleMode, motorCount) {
  if (throttleMode !== THROTTLE_MODE_BIDIRECTIONAL) {
    return 0;
  }
  return (1 << Math.max(motorCount, 1)) - 1;
}

// ESC PPM centre for a bidirectional PWM/OneShot motor: the firmware maps zero
// thrust to the middle of min_throttle..max_throttle.
export function escNeutralPulse(motorConfig) {
  return Math.round((motorConfig.minthrottle + motorConfig.maxthrottle) / 2);
}
