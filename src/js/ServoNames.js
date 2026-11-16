// Servo names (wingflight-firmware pg/servo_name.h): a short label per servo,
// read with MSP2_WING_SERVO_NAMES and set with MSP2_WING_SET_SERVO_NAME.

import { FC } from "@/js/fc.svelte.js";
import { MSPCodes } from "@/js/msp/MSPCodes.js";
import { surfacesFromRules } from "@/tabs/setup_wizard/surfaces.js";

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

// Every servo the firmware has a name for
const SERVO_COUNT = 24;

// Short name of each surface kind (surfaces.js surfaceKind())
const SURFACE_ABBREVIATIONS = {
  aileron: "AIL",
  flaperon: "FLPRN",
  elevon: "ELEVON",
  ruddervator: "VTAIL",
  elevator: "ELEV",
  rudder: "RUDDER",
  flap: "FLAP",
  mixed: "MIX",
};

// Thrust-vector mixer inputs (MIXER_IN_STABILIZED_TV_ROLL/PITCH/YAW)
const TV_NAMES = { 27: "TV ROLL", 28: "TV PITCH", 29: "TV YAW" };

// A name assignServoNames() could have written, so one left on a servo the
// mix no longer drives can be told from a name the pilot typed
const GENERATED_NAME = new RegExp(
  `^((L |R )?(${Object.values(SURFACE_ABBREVIATIONS).join("|")})( \\d+)?|${Object.values(TV_NAMES).join("|")})$`,
);

// Names for the servos a mixer rule set drives, by 0-based servo: a pair of
// one kind of surface is left and right (the wizards give the left one the
// lower servo), one alone has no side, and more are numbered.
export function namesFromRules(rules) {
  const names = new Map();

  const byKind = new Map();
  for (const surface of surfacesFromRules(rules, SERVO_COUNT)) {
    if (!byKind.has(surface.kind)) byKind.set(surface.kind, []);
    byKind.get(surface.kind).push(surface.servo);
  }
  for (const [kind, servos] of byKind) {
    const abbr = SURFACE_ABBREVIATIONS[kind] ?? SURFACE_ABBREVIATIONS.mixed;
    servos.forEach((servo, i) => {
      if (servos.length === 1) names.set(servo, abbr);
      else if (servos.length === 2) names.set(servo, `${i ? "R" : "L"} ${abbr}`);
      else names.set(servo, `${abbr} ${i + 1}`);
    });
  }

  for (const rule of rules) {
    const servo = rule.dst - 1;
    if (TV_NAMES[rule.src] && servo >= 0 && servo < SERVO_COUNT && !names.has(servo)) {
      names.set(servo, TV_NAMES[rule.src]);
    }
  }

  return names;
}

// After a wizard has set up the mix: names every servo it drives in
// FC.SERVO_NAMES, and clears a generated name from a servo it no longer
// drives. A name the pilot typed on a servo the mix doesn't use is kept.
// Only FC is changed; the caller sends the names with the mix (sendServoName).
export function assignServoNames(rules) {
  if (!Array.isArray(FC.SERVO_NAMES)) return;

  const names = namesFromRules(rules);
  for (let servo = 0; servo < FC.SERVO_NAMES.length; servo++) {
    if (names.has(servo)) {
      FC.SERVO_NAMES[servo] = names.get(servo);
    } else if (GENERATED_NAME.test(FC.SERVO_NAMES[servo])) {
      FC.SERVO_NAMES[servo] = "";
    }
  }
}

// Sends every name that differs from `initial` (an earlier copy of
// FC.SERVO_NAMES). Does nothing on firmware without servo names.
export async function sendChangedServoNames(initial) {
  if (!Array.isArray(FC.SERVO_NAMES) || !Array.isArray(initial)) return;
  for (let i = 0; i < FC.SERVO_NAMES.length; i++) {
    if (FC.SERVO_NAMES[i] !== initial[i]) {
      await mspHelper.sendServoName(i);
    }
  }
}

// `label` with the servo's name after it, e.g. "Servo #1 (L AIL)"
export function withServoName(label, index) {
  const name = servoName(index);
  return name ? `${label} (${name})` : label;
}
