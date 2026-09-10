import { BADGE } from "./stages.js";
import { STATUS } from "./checks.js";

// Aggregate a stage's check results into one badge.
//
//   notApplicable   every check is n/a (or the stage has no checks)
//   needsAttention  an acknowledgment went stale, or a check fails on a
//                   stage that has been verified before
//   verified        every applicable check passes right now
//   notStarted      nothing passes and nothing has been acknowledged
//   inProgress      anything in between
//
// `wasVerified` is the one bit of memory involved: whether this stage has
// ever reached verified for this board. It is what separates "you have not
// got here yet" from "this used to be fine and something changed".
export function stageBadge(results, { wasVerified = false } = {}) {
  const applicable = results.filter((r) => r.status !== STATUS.NA);
  if (applicable.length === 0) return BADGE.NOT_APPLICABLE;

  const stale = applicable.some((r) => r.status === STATUS.STALE);
  if (stale) return BADGE.NEEDS_ATTENTION;

  const passes = applicable.filter((r) => r.status === STATUS.PASS).length;
  if (passes === applicable.length) return BADGE.VERIFIED;

  const fails = applicable.some((r) => r.status === STATUS.FAIL);
  if (fails && wasVerified) return BADGE.NEEDS_ATTENTION;

  if (passes === 0) return BADGE.NOT_STARTED;
  return BADGE.IN_PROGRESS;
}

export function stageProgress(results) {
  const applicable = results.filter((r) => r.status !== STATUS.NA);
  return {
    passed: applicable.filter((r) => r.status === STATUS.PASS).length,
    total: applicable.length,
  };
}

// The first stage that is not verified / not applicable -- where the user
// should go next.
export function nextStageId(stageBadges, order) {
  for (const id of order) {
    const badge = stageBadges[id];
    if (badge !== BADGE.VERIFIED && badge !== BADGE.NOT_APPLICABLE) return id;
  }
  return null;
}

export function allStagesVerified(stageBadges, order) {
  return order.every((id) => stageBadges[id] === BADGE.VERIFIED || stageBadges[id] === BADGE.NOT_APPLICABLE);
}
