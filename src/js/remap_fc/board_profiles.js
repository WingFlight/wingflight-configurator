/**
 * File: src/js/remap_fc/board_profiles.js
 * Looks up the board profile (silkscreen labels + pad coordinates) for
 * the connected flight controller. Profiles live in
 * src/tabs/journey/board_profiles.json; see docs/board-views.md for the
 * schema and docs/adding-a-board-profile.md for how to add one.
 *
 * Boards are identified the way unified firmware identifies them: by
 * `manufacturer_id` and `board_name`, the pair the catalogue at
 * WingFlight/wingflight-targets names its files after and the pair a
 * flashed board reports over MSP. The old target name deliberately
 * plays no part -- under unified firmware every H743 board reports the
 * same one, so matching on it would hand one board's drawing to every
 * other board of the same silicon.
 *
 * This module returns the file's own shape, unnormalised:
 * `findBoardProfile` returning null is what tells the wiring session
 * the board is unrecognised and pin changes must not be written to it.
 * Anything that wants to *draw* a board should go through
 * src/js/boardview/board_views.js, which normalises the profile and
 * falls back to a synthesised schematic.
 */

import boardProfiles from "@/tabs/journey/board_profiles.json";

/**
 * @typedef {Object} BoardPad
 * @property {string} pin - CLI pin form, e.g. "B07".
 * @property {string} silkscreen - Label printed on the board, e.g. "S1".
 * @property {number} x - mm from the view's left edge.
 * @property {number} y - mm from the view's top edge.
 * @property {"top"|"left"|"right"} [view] - which drawing it appears in.
 * @property {"top"|"bottom"} side
 * @property {"outputs"|"uart"|"power"|"i2c"|"adc"|"led"|"other"} group
 * @property {boolean} [reserved]
 */

/**
 * @typedef {Object} BoardProfile
 * @property {string} id - the catalogue target id, e.g. "MTKS-MATEKH743".
 * @property {{manufacturerId?: string[], boardName?: string[]}} match
 * @property {string} display
 * @property {string} mcu - e.g. "STM32H743".
 * @property {boolean} [coordinatesSchematic]
 * @property {Object.<string, Object>} views one entry per drawn side
 * @property {BoardPad[]} pads
 * @property {Object[]} [headers]
 * @property {Object[]} [ports] each serial port's TX and RX pins
 */

function normalise(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function matches(profile, field, wanted) {
  if (!wanted) return false;
  return (profile.match?.[field] ?? []).some(
    (entry) => normalise(entry) === wanted,
  );
}

/**
 * All known profiles.
 * @returns {BoardProfile[]}
 */
export function allBoardProfiles() {
  return boardProfiles.boards ?? [];
}

/**
 * Picks the profile for a board's MSP identity out of a given list.
 *
 * A profile naming both a manufacturer and a board name wins, because
 * that pair is unique in the catalogue. A profile naming only a board
 * name is accepted next: board names are very nearly unique on their
 * own, and it lets one profile cover a board sold under two
 * manufacturer ids. Nothing matches on manufacturer alone, and nothing
 * matches without a board name at all.
 *
 * Exported separately from `findBoardProfile` so the rule can be
 * tested against profiles of the test's own choosing rather than
 * against whatever happens to ship.
 *
 * @param {BoardProfile[]} profiles
 * @param {{boardName?: string, manufacturerId?: string}} config
 * @returns {?BoardProfile}
 */
export function matchBoardProfile(profiles, config) {
  const boardName = normalise(config?.boardName);
  const manufacturerId = normalise(config?.manufacturerId);
  if (!boardName) return null;

  const candidates = (profiles ?? []).filter((profile) =>
    matches(profile, "boardName", boardName),
  );

  return (
    candidates.find((profile) =>
      matches(profile, "manufacturerId", manufacturerId),
    ) ??
    candidates.find(
      (profile) => !(profile.match?.manufacturerId ?? []).length,
    ) ??
    null
  );
}

/**
 * The profile for the connected board, or null when nobody has drawn
 * it. Null is also what tells the wiring session the board is
 * unrecognised and pin changes must not be written to it.
 * @param {{boardName?: string, manufacturerId?: string}} config e.g. FC.CONFIG
 * @returns {?BoardProfile}
 */
export function findBoardProfile(config) {
  return matchBoardProfile(allBoardProfiles(), config);
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
