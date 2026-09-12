/**
 * File: src/js/boardview/unified_config.js
 * Reads a unified target configuration -- one `.config` file from
 * WingFlight/wingflight-targets -- into the two things a board drawing
 * needs: who the board is, and which pin carries what.
 *
 * A target config is a CLI script. Its `resource` lines are the same
 * lines a board prints for `dump hardware`, so the parsing is already
 * written and tested in src/js/remap_fc/hardware_parser.js and is
 * reused here rather than restated. What this module adds is the
 * identity at the top of the file:
 *
 *     # Betaflight / STM32H743 (SH74) 4.3.0 Jan 16 2022 ...
 *     board_name MATEKH743
 *     manufacturer_id MTKS
 *
 * Those two fields are what a connected board reports over MSP, and so
 * they are what a board profile matches on. The old target name is not:
 * under unified firmware every H743 board reports the same one.
 *
 * The catalogue names its files `<MANUFACTURER>-<BOARD>.config`, and
 * that pair is used throughout as the target id, e.g. "MTKS-MATEKH743".
 */

import { parseHardwareDump } from "@/js/remap_fc/hardware_parser.js";

/** How the catalogue names its files. Manufacturer ids are four characters. */
const FILE_NAME_RE = /^([^-]{1,4})-(.+)\.config$/;

/** The build line the firmware prints first, e.g. "... / STM32H743 (SH74) ...". */
const BUILD_LINE_RE = /^#.*\/\s+(STM32[A-Z0-9]+)/im;

function keyword(text, name) {
  const match = text.match(new RegExp(`^${name}\\s+(\\S+)\\s*$`, "im"));
  return match ? match[1] : null;
}

/**
 * The catalogue's id for a board, e.g. "MTKS-MATEKH743". Null when
 * either half is missing, because half an id matches nothing.
 * @param {{manufacturerId?: string, boardName?: string}} identity
 * @returns {?string}
 */
export function targetId(identity) {
  const manufacturer = String(identity?.manufacturerId ?? "").trim().toUpperCase();
  const board = String(identity?.boardName ?? "").trim().toUpperCase();
  return manufacturer && board ? `${manufacturer}-${board}` : null;
}

/**
 * Splits a catalogue file name into its parts.
 * @param {string} fileName e.g. "MTKS-MATEKH743.config"
 * @returns {?{targetId: string, manufacturerId: string, boardName: string}}
 */
export function parseTargetFileName(fileName) {
  const match = String(fileName ?? "").match(FILE_NAME_RE);
  if (!match) return null;
  const manufacturerId = match[1].toUpperCase();
  const boardName = match[2].toUpperCase();
  return { targetId: `${manufacturerId}-${boardName}`, manufacturerId, boardName };
}

/**
 * Who a config says the board is.
 *
 * `board_name` and `manufacturer_id` are read from the file's own
 * keywords rather than from its file name: the file name is how the
 * catalogue stores it, the keywords are what the board will report
 * once flashed, and those are what a profile has to match.
 *
 * @param {string} text the config file
 * @returns {{boardName: ?string, manufacturerId: ?string, mcu: ?string,
 *            targetId: ?string}}
 */
export function readIdentity(text) {
  const boardName = keyword(text, "board_name")?.toUpperCase() ?? null;
  const manufacturerId = keyword(text, "manufacturer_id")?.toUpperCase() ?? null;
  return {
    boardName,
    manufacturerId,
    // The build the config was captured from, e.g. "STM32H743". It is
    // the MCU family, which is what the timer and DMA tables key off.
    mcu: text.match(BUILD_LINE_RE)?.[1] ?? null,
    targetId: targetId({ boardName, manufacturerId }),
  };
}

/**
 * Everything a board drawing can learn from a target config.
 * @param {string} text
 * @returns {{identity: Object, hardwareMap: Object, serialPorts: Object[]}}
 *   `hardwareMap` is keyed by option key ("S1", "TX2"), the same shape
 *   the wiring session produces from a live board.
 */
export function readTargetConfig(text) {
  return {
    identity: readIdentity(text),
    hardwareMap: parseHardwareDump(text),
    serialPorts: readSerialPorts(text),
  };
}

/**
 * The `serial <identifier> <functionMask> ...` lines, which say what
 * the board's own defaults put on each port. Used to show a realistic
 * set of assignments while drawing, never written into a profile.
 * @param {string} text
 * @returns {{identifier: number, functionMask: number}[]}
 */
export function readSerialPorts(text) {
  const ports = [];
  for (const match of text.matchAll(/^serial\s+(\d+)\s+(\d+)\s/gim)) {
    ports.push({
      identifier: Number(match[1]),
      functionMask: Number(match[2]),
    });
  }
  return ports;
}

/**
 * Turns a catalogue listing into rows the board editor can offer,
 * grouped and sorted the way the firmware flasher groups them.
 * @param {{name: string, download_url?: string, path?: string}[]} entries
 *        the GitHub contents listing of the `configs` directory
 * @returns {{targetId: string, manufacturerId: string, boardName: string,
 *            url: ?string, path: ?string}[]}
 */
export function listTargets(entries) {
  const targets = [];
  for (const entry of entries ?? []) {
    const parsed = parseTargetFileName(entry.name);
    if (!parsed) continue;
    targets.push({
      ...parsed,
      url: entry.download_url ?? null,
      path: entry.path ?? null,
    });
  }
  targets.sort(
    (a, b) =>
      a.manufacturerId.localeCompare(b.manufacturerId) ||
      a.boardName.localeCompare(b.boardName),
  );
  return targets;
}
