/**
 * File: src/js/remap_fc/pin_conflict_suggestions.js
 * When a timer/DMA clash survives a full reallocation pass (see
 * timer_dma_reconciler.js's reallocateTimersAndDma) -- meaning no
 * choice of timer/DMA on the *current* pin assignments can resolve
 * it -- the problem is which option sits on which pin, not the
 * timer/DMA choice on that pin. This searches for an alternative pin
 * assignment that would let a fresh reallocation resolve everything,
 * so the UI can offer it as a one-click fix rather than leaving the
 * user to work out a swap by hand.
 *
 * The search itself is deliberately simple: for each feature a full
 * reallocation pass still couldn't resolve, try moving it onto every
 * other row's own default pin, one at a time -- a swap if that pin is
 * currently occupied (the two features trade places), a plain move if
 * it's free. Each candidate layout is itself run through a full
 * reallocation pass; only ones that leave nothing unresolved at all
 * are kept. This is a single-swap search, not an exhaustive one -- a
 * clash that needs two coordinated moves at once to resolve won't
 * find a suggestion here, only the fallback below.
 */

import { buildFeatureRows, reallocateTimersAndDma, buildTimerDmaCommands } from "./timer_dma_reconciler.js";

/**
 * @typedef {Object} PinConflictSuggestion
 * @property {"swap"|"move"|"clear"} type
 * @property {string} feature - The unresolved feature this suggestion moves.
 * @property {?string} otherFeature - For "swap", the feature it trades places with.
 * @property {?string} targetPin - For "swap"/"move", the pin `feature` would move to.
 * @property {import("./hardware_parser.js").HardwareMap} apply - The
 *   resulting working hardware map, ready to adopt as-is if this
 *   suggestion is accepted.
 *
 * Deliberately no human-readable description here -- this module has
 * no knowledge of a board's reference design, so it only ever knows
 * `feature`/`otherFeature` by their raw CLI option keys (e.g. "M1"),
 * never a board's own connector name for them (e.g. "ESC"). Building
 * the label is the caller's job -- see remap_fc.svelte's
 * suggestionLabel, which uses the same optionLabel() every other
 * option label in this tab goes through.
 */

/**
 * Whether a full reallocation pass over this hardware map leaves
 * nothing unresolved.
 * @param {import("./hardware_parser.js").HardwareMap} hardwareMap
 * @param {?string} mcuType
 * @param {Object} mcuAllData
 * @param {Set<string>} reservedDmaStreams
 * @param {Set<string>} reservedTimers
 * @returns {string[]} The features still unresolved after reallocating, if any.
 */
function unresolvedAfterReallocation(
  hardwareMap,
  mcuType,
  mcuAllData,
  reservedDmaStreams,
  reservedTimers,
) {
  const featureRows = buildFeatureRows(hardwareMap, mcuType, mcuAllData);
  const allocation = reallocateTimersAndDma(featureRows, reservedDmaStreams, reservedTimers);
  return buildTimerDmaCommands(
    featureRows,
    allocation,
    reservedDmaStreams,
    reservedTimers,
  ).unresolved;
}

/**
 * @param {import("./hardware_parser.js").HardwareMap} workingCurrent
 * @param {?string} mcuType
 * @param {Object} mcuAllData - The parsed contents of MCU-all.json.
 * @param {Set<string>} reservedDmaStreams
 * @param {Set<string>} reservedTimers
 * @param {import("./remap_table.js").RemapRow[]} tableRows - Every
 *   row currently in the table, as candidate target pins to move an
 *   unresolved feature onto.
 * @returns {PinConflictSuggestion[]} Empty if nothing's unresolved, or
 *   if it is but no single swap/move/clear was tried (never actually
 *   happens -- clearing an unresolved feature always resolves it, so
 *   the fallback always has something to offer once there's anything
 *   unresolved at all).
 */
export function findPinConflictSuggestions(
  workingCurrent,
  mcuType,
  mcuAllData,
  reservedDmaStreams,
  reservedTimers,
  tableRows,
) {
  const unresolved = unresolvedAfterReallocation(
    workingCurrent,
    mcuType,
    mcuAllData,
    reservedDmaStreams,
    reservedTimers,
  );
  if (unresolved.length === 0) return [];

  const occupantOf = (pin) =>
    Object.keys(workingCurrent).find((key) => workingCurrent[key].pin === pin);
  const resolves = (candidate) =>
    unresolvedAfterReallocation(
      candidate,
      mcuType,
      mcuAllData,
      reservedDmaStreams,
      reservedTimers,
    ).length === 0;

  const suggestions = [];

  for (const feature of unresolved) {
    const currentPin = workingCurrent[feature]?.pin;
    if (!currentPin) continue;

    for (const row of tableRows) {
      if (!row.defaultPin || row.defaultPin === currentPin) continue;

      const displaced = occupantOf(row.defaultPin);
      const candidate = { ...workingCurrent };
      delete candidate[feature];
      if (displaced) delete candidate[displaced];
      candidate[feature] = { pin: row.defaultPin };
      if (displaced) candidate[displaced] = { pin: currentPin };

      if (!resolves(candidate)) continue;

      suggestions.push(
        displaced
          ? {
              type: "swap",
              feature,
              otherFeature: displaced,
              targetPin: row.defaultPin,
              apply: candidate,
            }
          : {
              type: "move",
              feature,
              otherFeature: null,
              targetPin: row.defaultPin,
              apply: candidate,
            },
      );
    }
  }

  // Fallback: no single swap/move resolves everything (a clash that
  // needs two coordinated moves at once, say) -- clearing an
  // unresolved feature back to unassigned always resolves it on its
  // own, so this is always available even when nothing else is.
  if (suggestions.length === 0) {
    for (const feature of unresolved) {
      const candidate = { ...workingCurrent };
      delete candidate[feature];
      suggestions.push({
        type: "clear",
        feature,
        otherFeature: null,
        targetPin: null,
        apply: candidate,
      });
    }
  }

  return suggestions;
}
