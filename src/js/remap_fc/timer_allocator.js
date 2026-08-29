/**
 * File: src/js/remap_fc/timer_allocator.js
 * Picks a non-clashing timer+channel for every feature in a working
 * hardware map, following the same rules as the original Wingflight
 * remap tool's allocator:
 *
 *   1. No two features may ever share a full timer+channel (e.g. two
 *      features both on "TIM3 CH1", or one on "TIM3 CH1" and another
 *      on "TIM3 CH1N" -- same channel, opposite polarity, still a
 *      clash).
 *   2. A timer base (e.g. "TIM3") may not be shared between different
 *      feature types -- if a servo is using TIM3, no motor/freq/LED/
 *      other feature may also use TIM3, even on a different channel.
 *      Same-type sharing is allowed, still subject to rule 1.
 *   3. A base is "critical" for a feature if it's that feature's only
 *      possible base. Non-critical-owning features avoid a base that's
 *      critical for someone else whenever they have any alternative,
 *      so the feature that has no other choice keeps its only option
 *      open. A feature may always use its own critical base. For a
 *      group (S1-S3, M1-M4), a base is still fair game if every
 *      critical owner of that base is within the group itself.
 *   4. S1-S3 and M1-M4 prefer to share one common base with a unique
 *      channel each, tried before falling back to allocating each
 *      member individually.
 *   5. Frequency inputs (Freq1, Freq2, ...) prefer TIM2 or TIM5 when
 *      available.
 *
 * Allocation runs in a fixed order -- freq inputs, LED strip, S1-S3 as
 * a group, remaining servos, M1-M4 as a group, remaining motors, then
 * everything else -- so the features with the narrowest options are
 * resolved first, before their preferred bases get taken by something
 * more flexible.
 */

import { classifyFeature, SERVO_GROUP, MOTOR_GROUP } from "./feature_classifier.js";

// A sentinel base owner for a timer+channel claimed by something
// outside this tool's control entirely -- the gyro's clock/sync
// signal, a hardware PPM input, and the like (see timer_dma_lookup.js's
// parseReservedTimers). Deliberately not a real feature type, so rule
// 2's cross-type base exclusivity treats it the same as any other
// foreign owner: no feature this tool manages may share that base,
// full stop, and there's no equivalent of a "same type" exception to
// let one through.
const RESERVED_TYPE = "__reserved__";

/**
 * @typedef {Object} TimerAllocationRow
 * @property {string} feature - The option key, e.g. "M1".
 * @property {string} pin
 * @property {"motor"|"servo"|"freq"|"led"|"other"} type
 * @property {import("./timer_dma_lookup.js").TimerOption[]} options
 * @property {?import("./timer_dma_lookup.js").TimerOption} chosen
 * @property {?string} rule - Why this choice was made, for debugging.
 */

/**
 * Allocates a clash-free timer+channel to every feature that has a
 * pin with timer options.
 * @param {{feature: string, pin: string, options: import("./timer_dma_lookup.js").TimerOption[]}[]} features
 * @param {Set<string>} [reservedTimers] - Full timer+channel strings
 *   (e.g. "TIM11 CH1") already claimed by something outside this
 *   tool's control -- see timer_dma_lookup.js's parseReservedTimers.
 *   Never offered to any feature, and the whole base each one belongs
 *   to is treated as permanently unavailable too.
 * @returns {TimerAllocationRow[]}
 */
export function allocateTimers(features, reservedTimers = new Set()) {
  const rows = features.map((f) => ({
    ...f,
    type: classifyFeature(f.feature),
    chosen: null,
    rule: null,
  }));

  // Two forms of state accumulate as rows are resolved: every full
  // timer+channel already claimed (rule 1), and which feature type
  // owns each base so far (rule 2).
  const usedFullTimers = new Set();
  const baseOwner = new Map();

  // Seed both with whatever's reserved outside this tool's control,
  // before any of this tool's own rows are considered -- the exact
  // channel is blocked outright, and its whole base is marked owned by
  // RESERVED_TYPE so no other channel on that base can be claimed
  // either (sharing a base means sharing its counter/prescaler, which
  // could interfere with whatever that fixed peripheral needs from it).
  for (const fullTimer of reservedTimers) {
    usedFullTimers.add(fullTimer);
    const base = fullTimer.split(" ")[0];
    if (!baseOwner.has(base)) baseOwner.set(base, RESERVED_TYPE);
  }

  // A base is critical for whichever features have it as their only
  // possible base (rule 3) -- computed once up front, since it only
  // depends on each feature's own option list, not allocation order.
  const criticalOwnersByBase = new Map();
  for (const row of rows) {
    const bases = new Set(row.options.map((o) => o.base).filter(Boolean));
    if (bases.size === 1) {
      const [base] = [...bases];
      if (!criticalOwnersByBase.has(base)) {
        criticalOwnersByBase.set(base, new Set());
      }
      criticalOwnersByBase.get(base).add(row.feature);
    }
  }

  // Whether a row could use a given option right now: not already
  // claimed, its base isn't owned by a different feature type, and
  // (when asked to) it isn't a base critical to some other feature.
  function canUseOption(row, opt, avoidCritical) {
    if (!opt?.base || !opt?.timer) return false;
    if (usedFullTimers.has(opt.timer)) return false;

    const owner = baseOwner.get(opt.base);
    if (owner && owner !== row.type) return false;

    if (avoidCritical) {
      const owners = criticalOwnersByBase.get(opt.base);
      if (owners && !owners.has(row.feature)) return false;
    }

    return true;
  }

  // Records a row's chosen option against the shared claim state so
  // later rows see it as unavailable.
  function registerUsage(row) {
    if (!row.chosen) return;
    usedFullTimers.add(row.chosen.timer);
    if (!baseOwner.has(row.chosen.base)) {
      baseOwner.set(row.chosen.base, row.type);
    }
  }

  // Picks the best remaining option for a single row: the first
  // non-negative candidate, or failing that the first candidate at
  // all, or null if nothing is left.
  function pickBestOption(row, label, avoidCritical = true) {
    const candidates = row.options.filter((o) => canUseOption(row, o, avoidCritical));
    row.chosen = candidates.find((o) => !o.negative) ?? candidates[0] ?? null;
    row.rule = label;
    if (row.chosen) registerUsage(row);
  }

  // Backtracking search for a way to give every feature in a group a
  // distinct channel on the same base, none of them already claimed.
  function findUniqueChannelAssignment(optionsByFeature) {
    const features = Object.keys(optionsByFeature);
    const assignment = {};
    const usedChannels = new Set();

    function backtrack(i) {
      if (i === features.length) return true;
      const f = features[i];
      for (const opt of optionsByFeature[f]) {
        if (!opt.channel || usedChannels.has(opt.channel)) continue;
        if (usedFullTimers.has(opt.timer)) continue;

        usedChannels.add(opt.channel);
        assignment[f] = opt;
        if (backtrack(i + 1)) return true;
        usedChannels.delete(opt.channel);
        delete assignment[f];
      }
      return false;
    }

    return backtrack(0) ? assignment : null;
  }

  // Tries to put every member of a preference group (S1-S3, M1-M4) on
  // one shared base with a unique channel each. Only bases every
  // member has an option on, and whose critical owners (if any) are
  // entirely within the group, are considered -- if none work out,
  // this is a no-op and every member is left for individual
  // allocation afterwards.
  function tryGroup(groupNames, label) {
    const groupRows = rows.filter((r) => groupNames.includes(r.feature));
    if (groupRows.length !== groupNames.length) return;

    const optionsByBase = {};
    for (const row of groupRows) {
      for (const opt of row.options) {
        if (!canUseOption(row, opt, false)) continue;
        optionsByBase[opt.base] ??= {};
        optionsByBase[opt.base][row.feature] ??= [];
        optionsByBase[opt.base][row.feature].push(opt);
      }
    }

    const candidateBases = Object.keys(optionsByBase).filter((base) => {
      if (!groupNames.every((name) => optionsByBase[base][name]?.length > 0)) {
        return false;
      }
      const owners = criticalOwnersByBase.get(base);
      return !owners || [...owners].every((o) => groupNames.includes(o));
    });

    for (const base of candidateBases) {
      const perFeature = {};
      for (const name of groupNames) {
        const opts = optionsByBase[base][name];
        const nonNegative = opts.filter((o) => !o.negative);
        perFeature[name] = nonNegative.length > 0 ? nonNegative : opts;
      }

      const assignment = findUniqueChannelAssignment(perFeature);
      if (assignment) {
        for (const row of groupRows) {
          row.chosen = assignment[row.feature];
          row.rule = `${label}: grouped on ${base}`;
          registerUsage(row);
        }
        return;
      }
    }
  }

  // 1) Frequency inputs: unique, prefer TIM2/TIM5, non-negative, avoid
  // critical bases -- resolved first since they have the narrowest
  // preference and the most to lose if a preferred base is taken.
  for (const row of rows.filter((r) => r.type === "freq")) {
    const usable = row.options.filter((o) => canUseOption(row, o, true) && !o.negative);
    row.chosen =
      usable.find((o) => o.base === "TIM2") ??
      usable.find((o) => o.base === "TIM5") ??
      usable[0] ??
      row.options.filter((o) => canUseOption(row, o, true))[0] ??
      null;
    row.rule = "freq: assigned";
    if (row.chosen) registerUsage(row);
  }

  // 2) LED strip: unique, avoid critical bases.
  const ledRow = rows.find((r) => r.type === "led");
  if (ledRow) pickBestOption(ledRow, "LED_STRIP: assigned");

  // 3) S1-S3 as a group, then whatever's left individually.
  tryGroup(SERVO_GROUP, "servo S1-S3");
  for (const row of rows.filter((r) => r.type === "servo" && !r.chosen)) {
    pickBestOption(row, "servo: assigned");
  }

  // 4) M1-M4 as a group, then whatever's left individually.
  tryGroup(MOTOR_GROUP, "motor M1-M4");
  for (const row of rows.filter((r) => r.type === "motor" && !r.chosen)) {
    pickBestOption(row, "motor: assigned");
  }

  // 5) Everything else, individually.
  for (const row of rows.filter((r) => r.type === "other" && !r.chosen)) {
    pickBestOption(row, "other: assigned");
  }

  return rows;
}
