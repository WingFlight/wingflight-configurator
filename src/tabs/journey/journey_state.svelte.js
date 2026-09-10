import { CONFIGURATOR } from "@/js/configurator.svelte.js";
import { FC } from "@/js/fc.svelte.js";
import { MSPCodes } from "@/js/msp/MSPCodes.js";
import { getProfile, resetProfileExtras } from "@/js/profile.svelte.js";
import { getWiringSession } from "@/js/remap_fc/wiring_session.svelte.js";
import { openTabByName } from "@/js/tab_tree.js";

import { ackStatus, markStageVerified, wasStageVerified } from "./acknowledgments.svelte.js";
import { evaluateStage } from "./checks.js";
import { STAGES } from "./stages.js";
import { stageBadge, stageProgress } from "./status.js";

// Session state for the journey tab: which stage is open, and what has been
// observed on the RC link since connecting. Nothing here is persisted.

export const journey = $state({
  activeStage: null, // null = overview
  observedUid: "",
});

// Live RC observation: per-channel min/max seen while the journey was open.
const observed = $state({ min: [], max: [], samples: 0 });

export function getObserved() {
  return observed;
}

export function resetObserved() {
  observed.min = [];
  observed.max = [];
  observed.samples = 0;
}

export function observeChannels(channels, count) {
  if (!Array.isArray(channels)) return;
  const n = Math.min(count ?? channels.length, channels.length);
  let touched = false;
  for (let i = 0; i < n; i++) {
    const v = channels[i];
    if (!Number.isFinite(v) || v <= 0) continue;
    if (observed.min[i] === undefined || v < observed.min[i]) { observed.min[i] = v; touched = true; }
    if (observed.max[i] === undefined || v > observed.max[i]) { observed.max[i] = v; touched = true; }
  }
  if (touched || observed.samples === 0) observed.samples += 1;
}

// A new board id means new observations, and whatever the CLI reader knew
// about the previous board is stale.
export function syncObservedToBoard(uid) {
  if (journey.observedUid !== uid) {
    journey.observedUid = uid;
    resetObserved();
    resetProfileExtras();
    getWiringSession().reset();
  }
}

// ---- Navigation -----------------------------------------------------------

function clickTab(tabName) {
  globalThis.$?.(`#tabs .tab_${tabName} a`).trigger("click");
}

export function openStage(stageId) {
  journey.activeStage = stageId;
  if (globalThis.GUI?.active_tab !== "journey") clickTab("journey");
}

export function openOverview() {
  journey.activeStage = null;
  if (globalThis.GUI?.active_tab !== "journey") clickTab("journey");
}

export function openTab(tabName) {
  openTabByName(tabName);
}

// ---- Evaluation -----------------------------------------------------------

function supportRange() {
  return {
    apiMin: CONFIGURATOR.API_VERSION_MIN_SUPPORTED,
    apiMax: CONFIGURATOR.API_VERSION_MAX_SUPPORTED,
    fwMin: CONFIGURATOR.FW_VERSION_MIN_SUPPORTED,
    fwMax: CONFIGURATOR.FW_VERSION_MAX_SUPPORTED,
  };
}

export function buildContext() {
  const profile = getProfile();
  const uid = profile.board.uid;
  return {
    fc: FC,
    profile,
    observed,
    ack: (checkId, hash) => ackStatus(checkId, uid, hash),
    support: supportRange(),
    uid,
  };
}

// Evaluate one stage right now. Pure: reads state, writes nothing, so it can
// run inside a $derived. Remembering that a stage reached "verified" is a
// state write and happens in rememberVerifiedStages() from an effect.
export function evaluateStageNow(stageId, ctx = buildContext()) {
  const results = evaluateStage(stageId, ctx);
  const badge = stageBadge(results, { wasVerified: wasStageVerified(stageId, ctx.uid) });
  return { stageId, results, badge, progress: stageProgress(results), uid: ctx.uid };
}

export function evaluateAllStages(ctx = buildContext()) {
  const out = {};
  for (const stage of STAGES) out[stage.id] = evaluateStageNow(stage.id, ctx);
  return out;
}

// The one bit of memory the badge logic has: once a stage has been verified
// for this board, a later failing check reads "needs attention" rather than
// "not started".
export function rememberVerifiedStages(evaluation) {
  for (const e of Object.values(evaluation ?? {})) {
    if (e.badge === "verified" && e.uid) markStageVerified(e.stageId, e.uid);
  }
}

// ---- Data -----------------------------------------------------------------

// Everything the checks read, fetched once when the journey opens. Tabs
// embedded inside a stage fetch their own data on top of this.
const INITIAL_CODES = [
  "MSP_STATUS",
  "MSP_BOARD_INFO",
  "MSP_NAME",
  "MSP_UID",
  "MSP_FEATURE_CONFIG",
  "MSP_SENSOR_CONFIG",
  "MSP_SENSOR_ALIGNMENT",
  "MSP_BOARD_ALIGNMENT_CONFIG",
  "MSP2_WING_BOARD_MOUNT_TRIM",
  "MSP_ATTITUDE",
  "MSP_MIXER_CONFIG",
  "MSP_MIXER_INPUTS",
  "MSP_MIXER_RULES",
  "MSP_SERIAL_CONFIG",
  "MSP_RX_CONFIG",
  "MSP_RX_MAP",
  "MSP_RC_CONFIG",
  "MSP_RC_TUNING",
  "MSP_RC",
  "MSP_BOXNAMES",
  "MSP_BOXIDS",
  "MSP_MODE_RANGES",
  "MSP_MODE_RANGES_EXTRA",
  "MSP_SERVO_CONFIGURATIONS",
  "MSP_SERVO",
  "MSP_MOTOR_CONFIG",
  "MSP_FAILSAFE_CONFIG",
  "MSP_RXFAIL_CONFIG",
  "MSP_BATTERY_CONFIG",
  "MSP_VOLTAGE_METER_CONFIG",
  "MSP_CURRENT_METER_CONFIG",
  "MSP_VOLTAGE_METERS",
  "MSP_CURRENT_METERS",
  "MSP_BATTERY_STATE",
  "MSP_BLACKBOX_CONFIG",
];

export async function refreshJourneyData() {
  for (const name of INITIAL_CODES) {
    const code = MSPCodes[name];
    if (code === undefined) continue;
    await globalThis.MSP.promise(code);
  }
}

// Light live poll while the journey is open: status flags, attitude, RC
// channels (feeding the link observation) and servo positions (feeding the
// airframe canvas).
const LIVE_CODES = ["MSP_ATTITUDE", "MSP_RC", "MSP_SERVO"];
let liveTick = 0;

export async function pollLiveData() {
  for (const name of LIVE_CODES) {
    await globalThis.MSP.promise(MSPCodes[name]);
  }
  observeChannels(FC.RC?.channels, FC.RC?.active_channels);
  liveTick += 1;
  if (liveTick % 5 === 0) {
    await globalThis.MSP.promise(MSPCodes.MSP_STATUS);
  }
}
