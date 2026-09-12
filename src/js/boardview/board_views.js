/**
 * File: src/js/boardview/board_views.js
 * Picks the drawing to use for the flight controller in front of us.
 *
 * In order of preference:
 *   1. a hand-made profile from src/tabs/journey/board_profiles.json,
 *      matched on the board's manufacturer id and board name;
 *   2. a schematic synthesised from what the board itself reported
 *      (generic_layout.js), for a board nobody has drawn yet;
 *   3. nothing, when the board has not been read and is not known.
 *
 * Callers get the same normalised shape either way and can tell the
 * two apart by `profile.synthesised`.
 */

import { findBoardProfile } from "@/js/remap_fc/board_profiles.js";

import { synthesiseBoardView } from "./generic_layout.js";
import { normaliseProfile } from "./schema.js";

/**
 * The hand-made profile for a board, normalised, or null.
 * @param {{boardName?: string, manufacturerId?: string}} config e.g. FC.CONFIG
 * @returns {?Object}
 */
export function findBoardView(config) {
  return normaliseProfile(findBoardProfile(config));
}

/**
 * The drawing to use, hand-made or synthesised.
 * @param {Object} args
 * @param {?Object} [args.matched] a profile the caller has already
 *        matched. The wiring session matches on the board it actually
 *        read, which in virtual mode is not the same identity as
 *        FC.CONFIG, so its answer wins over a fresh lookup.
 * @param {{boardName?: string, manufacturerId?: string}} [args.config]
 * @param {Object.<string, {pin: string}>} [args.hardwareMap]
 * @param {{identifier: number}[]} [args.serialPorts]
 * @param {boolean} [args.allowSynthesised] set false to get null
 *        rather than a schematic for an undrawn board
 * @returns {?Object}
 */
export function resolveBoardView({
  matched = null,
  config = null,
  hardwareMap = null,
  serialPorts = [],
  allowSynthesised = true,
} = {}) {
  const known = normaliseProfile(matched) ?? findBoardView(config);
  if (known) return known;
  if (!allowSynthesised) return null;

  return synthesiseBoardView({
    hardwareMap: hardwareMap ?? {},
    serialPorts,
    // The board's own name, falling back to the target name only as a
    // title for the picture. Matching never does this: under unified
    // firmware every board on one MCU reports the same target name.
    boardName: config?.boardName || config?.targetName || null,
    mcu: config?.mcu ?? null,
  });
}
