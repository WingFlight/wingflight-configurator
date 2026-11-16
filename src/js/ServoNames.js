// Servo names (wingflight-firmware pg/servo_name.h): a short label per servo,
// read with MSP2_WING_SERVO_NAMES and set with MSP2_WING_SET_SERVO_NAME.

// The longest name the firmware stores (SERVO_NAME_LENGTH)
export const SERVO_NAME_LENGTH = 8;

// Cleans a name the way the firmware accepts it: printable ASCII only, no
// leading or trailing spaces, at most SERVO_NAME_LENGTH characters.
export function cleanServoName(name) {
  return (name ?? "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, SERVO_NAME_LENGTH)
    .trim();
}
