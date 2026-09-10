/**
 * File: src/js/remap_fc/board_profiles.js
 * Looks up the board profile (silkscreen labels + pad coordinates) for
 * the connected flight controller. Profiles live in
 * src/tabs/journey/board_profiles.json; see docs/adding-a-board-profile.md
 * for the schema and how to add one.
 */

import boardProfiles from "@/tabs/journey/board_profiles.json";

/**
 * @typedef {Object} BoardPad
 * @property {string} pin - CLI pin form, e.g. "B07".
 * @property {string} silkscreen - Label printed on the board, e.g. "S1".
 * @property {number} x - mm from the board's left edge (top-down view).
 * @property {number} y - mm from the board's top edge (USB at top).
 * @property {"top"|"bottom"} side
 * @property {"outputs"|"uart"|"power"|"i2c"|"adc"|"led"|"other"} group
 * @property {boolean} [reserved]
 */

/**
 * @typedef {Object} BoardProfile
 * @property {string} id
 * @property {{targetName?: string[], boardDesign?: string[]}} match
 * @property {string} display
 * @property {string} mcu - e.g. "STM32F405".
 * @property {boolean} [coordinatesSchematic]
 * @property {{width: number, height: number, mountHoles: number[][]}} outline
 * @property {BoardPad[]} pads
 */

function normalise(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

/**
 * All known profiles.
 * @returns {BoardProfile[]}
 */
export function allBoardProfiles() {
  return boardProfiles.boards ?? [];
}

/**
 * Finds the profile matching a board's FC.CONFIG identity. `match`
 * values are compared case-insensitively against `targetName` first
 * (the firmware build's own target), then `boardDesign`.
 * @param {{targetName?: string, boardDesign?: string}} config e.g. FC.CONFIG
 * @returns {?BoardProfile}
 */
export function findBoardProfile(config) {
  const targetName = normalise(config?.targetName);
  const boardDesign = normalise(config?.boardDesign);
  if (!targetName && !boardDesign) return null;

  const byTarget = allBoardProfiles().find((profile) =>
    (profile.match?.targetName ?? []).some(
      (name) => targetName && normalise(name) === targetName,
    ),
  );
  if (byTarget) return byTarget;

  return (
    allBoardProfiles().find((profile) =>
      (profile.match?.boardDesign ?? []).some(
        (name) => boardDesign && normalise(name) === boardDesign,
      ),
    ) ?? null
  );
}

/**
 * The pad on a profile for a CLI pin name, or null.
 * @param {?BoardProfile} profile
 * @param {string} pin e.g. "B07"
 * @returns {?BoardPad}
 */
export function padForPin(profile, pin) {
  const wanted = normalise(pin);
  return profile?.pads?.find((pad) => normalise(pad.pin) === wanted) ?? null;
}

/**
 * The silkscreen label for a pin on a profile, or null when the
 * profile doesn't name it (the UI then shows the bare pin).
 * @param {?BoardProfile} profile
 * @param {string} pin
 * @returns {?string}
 */
export function silkscreenFor(profile, pin) {
  return padForPin(profile, pin)?.silkscreen ?? null;
}
