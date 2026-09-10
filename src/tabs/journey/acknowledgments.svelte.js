import * as config from "@/js/config.js";

// Acknowledged-check store.
//
// Schema per record: { checkId, uid, configHash, timestamp }. Records are
// keyed on the board's unique id so a laptop that configures several
// aeroplanes keeps them apart, and carry the hash of exactly the settings
// the check depends on so a change to those -- and only those -- turns the
// acknowledgment stale.
//
// Decision (concept §10.2): acknowledgments stay on the machine that made
// them. Writing them into the flight controller would need a firmware change
// and storage; the exportable pre-flight card (stage 8) is how they travel.

const RECORDS_KEY = "journeyAcknowledgments";
const STAGE_MEMORY_KEY = "journeyStageMemory";

function load(key) {
  const value = config.get(key);
  return Array.isArray(value) ? value : [];
}

let records = $state(load(RECORDS_KEY));
// [{ stageId, uid, verifiedAt }]
let stageMemory = $state(load(STAGE_MEMORY_KEY));

function persist() {
  config.set({ [RECORDS_KEY]: $state.snapshot(records) });
}

function persistStageMemory() {
  config.set({ [STAGE_MEMORY_KEY]: $state.snapshot(stageMemory) });
}

export function getAcknowledgment(checkId, uid) {
  return records.find((r) => r.checkId === checkId && r.uid === uid) ?? null;
}

export function acknowledgmentsForUid(uid) {
  return records.filter((r) => r.uid === uid);
}

// "valid" | "stale" | "none"
export function ackStatus(checkId, uid, currentHash) {
  const record = getAcknowledgment(checkId, uid);
  if (!record) return "none";
  return record.configHash === currentHash ? "valid" : "stale";
}

export function acknowledge(checkId, uid, configHash, timestamp = Date.now()) {
  if (!uid) return null;
  const record = { checkId, uid, configHash, timestamp };
  const index = records.findIndex((r) => r.checkId === checkId && r.uid === uid);
  if (index >= 0) records[index] = record;
  else records.push(record);
  persist();
  return record;
}

export function revoke(checkId, uid) {
  const index = records.findIndex((r) => r.checkId === checkId && r.uid === uid);
  if (index < 0) return false;
  records.splice(index, 1);
  persist();
  return true;
}

export function revokeAllForUid(uid) {
  const before = records.length;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].uid === uid) records.splice(i, 1);
  }
  if (records.length !== before) persist();
  stageMemory = stageMemory.filter((m) => m.uid !== uid);
  persistStageMemory();
}

export function markStageVerified(stageId, uid) {
  if (!uid) return;
  if (stageMemory.some((m) => m.stageId === stageId && m.uid === uid)) return;
  stageMemory.push({ stageId, uid, verifiedAt: Date.now() });
  persistStageMemory();
}

export function wasStageVerified(stageId, uid) {
  return stageMemory.some((m) => m.stageId === stageId && m.uid === uid);
}

// Test hook: replace the in-memory state (does not touch storage).
export function _resetForTests() {
  records = [];
  stageMemory = [];
}
