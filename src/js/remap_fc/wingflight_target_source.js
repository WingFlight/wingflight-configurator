/**
 * File: src/js/remap_fc/wingflight_target_source.js
 * A board with no Rotorflight-specific build of its own reports
 * "BTFL" (or nothing at all) as its board_design -- see
 * remap_fc.svelte's boardDiagramSrc for the same check. Its own
 * `dump hardware` still only ever reports resources up to whatever
 * Rotorflight's own runtime was compiled to support (see
 * remap_table.js's MAX_VALID_MOTORS/MAX_VALID_SERVOS), even though
 * the shared Betaflight target it's actually running defines more --
 * commonly up to 8 motors, sometimes 12 servos.
 *
 * This looks up that same target's own unified config file from
 * WingFlight/wingflight-targets -- the same GitHub repository the
 * Firmware Flasher tab already reads builds from (see
 * FirmwareFlasher.svelte) -- and parses it with hardware_parser.js's
 * own parseHardwareDump, unmodified: a unified target config is
 * already written in the identical `resource`/`timer`/`dma pin` CLI
 * syntax a real `dump hardware` response uses (confirmed by
 * firmware_flasher/util.js's own IGNORE_REGEXP, which explicitly
 * strips `resource MOTOR [5-8]` lines back out when *flashing* one of
 * these to a non-Rotorflight-fork target -- proof those lines are
 * actually present in the raw file). So this needs no parser of its
 * own, just the right file to hand parseHardwareDump instead of a CLI
 * dump.
 *
 * Never used for anything sent back to the flight controller -- see
 * remap_fc.js's #doRunSequence, which only ever hands this result to
 * the Svelte component's own display-only defaultHardware, keeping
 * its own restoreCommands/buildChangeCommands computation on the
 * FC's real, as-reported defaults throughout.
 */

import * as github from "@/js/GitHubApi.js";
import { parseHardwareDump } from "./hardware_parser.js";

const REPO = "WingFlight/wingflight-targets";
const BRANCH = "master";
const CONFIGS_PATH = "configs";
const FETCH_TIMEOUT_MS = 4000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error("timed out")), ms),
    ),
  ]);
}

async function fetchRawConfig(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

/**
 * Finds and parses the unified target config matching the given
 * manufacturer/board pair, if any. Never throws -- any failure (no
 * matching file, the repository listing or the file itself can't be
 * fetched in time, or the matched file has no usable resources in it)
 * just resolves to null, so a caller can always fall back to the FC's
 * own reported defaults without special-casing errors itself.
 * @param {?string} manufacturerId - e.g. "MTKS", from FC.CONFIG.manufacturerId.
 * @param {?string} boardName - e.g. "MATEKF405TE", from FC.CONFIG.boardName.
 * @returns {Promise<?import("./hardware_parser.js").HardwareMap>}
 */
export async function fetchWingflightTargetDefaults(manufacturerId, boardName) {
  if (!manufacturerId || !boardName) return null;

  // Config filenames follow "<manufacturer>-<board>.config" -- the
  // same convention firmware_flasher/util.js's parseUnifiedTargets
  // splits back apart via its own TARGET_REGEXP, just assembled
  // forwards here since we already know both halves.
  const wantedName = `${manufacturerId}-${boardName}.config`.toUpperCase();

  try {
    const entries = await withTimeout(
      github.getContents(REPO, BRANCH, CONFIGS_PATH),
      FETCH_TIMEOUT_MS,
    );
    const match = entries.find(
      (entry) => entry.name.toUpperCase() === wantedName,
    );
    if (!match?.download_url) {
      console.log(`remap_fc: no wingflight-targets config found for ${wantedName}`);
      return null;
    }

    const configText = await withTimeout(
      fetchRawConfig(match.download_url),
      FETCH_TIMEOUT_MS,
    );
    const hardware = parseHardwareDump(configText);
    if (Object.keys(hardware).length === 0) {
      throw new Error("parsed target config had no resources");
    }

    console.log(`remap_fc: loaded default hardware from wingflight-targets (${match.name})`);
    return hardware;
  } catch (err) {
    console.log(
      "remap_fc: could not load wingflight-targets default hardware, falling back to the FC's own defaults",
      err,
    );
    return null;
  }
}
