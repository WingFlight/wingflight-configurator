// Servo names (wingflight-firmware pg/servo_name.h): a short label per servo,
// read with MSP2_WING_SERVO_NAMES and set with MSP2_WING_SET_SERVO_NAME.

import { FC } from "@/js/fc.svelte.js";
import { MSPCodes } from "@/js/msp/MSPCodes.js";

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

// Reads the names into FC.SERVO_NAMES. Firmware without servo names answers
// unsupported, which leaves it null, and every label then shows no name.
export async function loadServoNames() {
  FC.SERVO_NAMES = null;
  await MSP.promise(MSPCodes.MSP2_WING_SERVO_NAMES);
}

// Name of 0-based servo `index`, or "" when it has none
export function servoName(index) {
  return FC.SERVO_NAMES?.[index] ?? "";
}

// `label` with the servo's name after it, e.g. "Servo #1 (L AIL)"
export function withServoName(label, index) {
  const name = servoName(index);
  return name ? `${label} (${name})` : label;
}
