/**
 * File: src/js/remap_fc/timer_dma_reconciler.js
 * The entry point the "Load Changes" flow calls before sending its
 * `resource` commands: builds a per-feature view of the working
 * hardware map's timer/DMA state, checks whether anything about to be
 * sent to the flight controller would actually clash (a freshly
 * assigned/moved feature has no timer yet, two features would land on
 * the same timer+channel or DMA stream, a feature would land on a DMA
 * stream something outside this tool's control already owns -- SPI,
 * ADC, etc. -- or two different feature types would share a timer
 * base), and -- only if something does -- runs the full
 * timer_allocator.js/dma_allocator.js pass and turns its result into
 * the `timer`/`dma pin` CLI commands needed to apply it.
 *
 * Deliberately an all-or-nothing decision, matching the original
 * Wingflight remap tool: a clash anywhere means every feature's timer
 * and DMA is reallocated from scratch together, rather than patching
 * around just the clashing ones -- the whole point of the base-
 * exclusivity and critical-base rules is that one feature's "safe"
 * choice depends on every other feature's choice too, so a partial
 * reallocation could just move the clash elsewhere.
 */

import { getPinTimerOptions } from "./timer_dma_lookup.js";
import { classifyFeature } from "./feature_classifier.js";
import { allocateTimers } from "./timer_allocator.js";
import { allocateDma } from "./dma_allocator.js";

/**
 * @typedef {Object} FeatureTimerRow
 * @property {string} feature
 * @property {string} pin
 * @property {"motor"|"servo"|"freq"|"led"|"other"} type
 * @property {import("./timer_dma_lookup.js").TimerOption[]} options
 * @property {?import("./timer_dma_lookup.js").TimerOption} currentOption -
 *   Whichever of `options` this feature's HardwareMap entry currently
 *   points to (matched by AF), or null if it has none/an unrecognised
 *   one -- e.g. every feature the table's edits touched, since those
 *   are only ever given a pin, never a timer/DMA (see remap_fc.svelte's
 *   handleCurrentOptionChange).
 * @property {?import("./timer_dma_lookup.js").DmaChoice} currentDma -
 *   The DMA choice currentOption's own list points to at the
 *   HardwareMap entry's dma index, or null.
 */

/**
 * Builds one row per feature actually assigned a pin in the working
 * hardware map, joined against this MCU's timer options for that pin
 * and whatever timer/DMA that feature is currently recorded as using.
 *
 * Only considers motor/servo/freq/LED features -- workingCurrent also
 * carries every UART/I2C resource the board has wired (RX/TX/SDA/SCL),
 * which classifyFeature reports as "other". Those pins often still
 * report *some* timer AF/DMA in a `dump hardware` (the MCU pin is
 * electrically capable of PWM even though it's actually wired for
 * serial), but this tool never manages their timer/DMA -- treating
 * them as real timer users would make them compete for exclusive
 * timer bases against genuine motor/servo/freq features, flagging a
 * perfectly healthy default configuration as clashing with itself.
 * @param {import("./hardware_parser.js").HardwareMap} workingCurrent
 * @param {?string} mcuType
 * @param {Object} mcuAllData - The parsed contents of MCU-all.json.
 * @returns {FeatureTimerRow[]}
 */
export function buildFeatureRows(workingCurrent, mcuType, mcuAllData) {
  return Object.entries(workingCurrent)
    .filter(([feature]) => classifyFeature(feature) !== "other")
    .map(([feature, entry]) => {
      const options = getPinTimerOptions(mcuAllData, mcuType, entry.pin);

      // A HardwareMap entry's own `timer` field holds the pin's AF
      // value (e.g. "AF2"), not the full "TIM3 CH1" descriptor --
      // match it back to whichever option reports that AF to find
      // what's actually selected right now.
      const currentOption = entry.timer
        ? (options.find((o) => o.af === entry.timer) ?? null)
        : null;
      const currentDma = currentOption
        ? (currentOption.dma[Number(entry.dma)] ?? null)
        : null;

      return {
        feature,
        pin: entry.pin,
        type: classifyFeature(feature),
        options,
        currentOption,
        currentDma,
      };
    });
}

/**
 * @typedef {Object} ClashReport
 * @property {boolean} hasClash
 * @property {string[]} reasons - Human-readable descriptions, for
 *   logging/debugging -- not shown in the UI.
 */

/**
 * Checks the working set's current timer/DMA state for anything that
 * needs a reallocation pass: a feature with no timer chosen yet (every
 * newly assigned/moved one), two features sharing a full timer+channel
 * or a base across feature types, a feature already sitting on a
 * timer+channel or base something outside this tool's control (the
 * gyro's clock/sync signal, ...) has permanently claimed, two features
 * sharing a DMA stream, or a feature already sitting on a stream
 * something outside this tool's control (SPI, ADC, ...) has
 * permanently claimed.
 * @param {FeatureTimerRow[]} featureRows
 * @param {Set<string>} [reservedStreams] - See
 *   timer_dma_lookup.js's parseReservedDmaStreams.
 * @param {Set<string>} [reservedTimers] - See
 *   timer_dma_lookup.js's parseReservedTimers.
 * @returns {ClashReport}
 */
export function detectClashes(
  featureRows,
  reservedStreams = new Set(),
  reservedTimers = new Set(),
) {
  const reasons = [];

  for (const row of featureRows) {
    if (row.options.length > 0 && !row.currentOption) {
      reasons.push(`${row.feature} (${row.pin}) has no timer chosen yet`);
    }
  }

  const seenFullTimers = new Map();
  const baseOwner = new Map();
  const seenDma = new Map();

  for (const row of featureRows) {
    if (row.currentOption) {
      const { timer, base } = row.currentOption;

      if (reservedTimers.has(timer)) {
        reasons.push(`${row.feature} sits on ${timer}, which is reserved for another peripheral`);
      }

      const timerOwner = seenFullTimers.get(timer);
      if (timerOwner) {
        reasons.push(`${row.feature} and ${timerOwner} both use ${timer}`);
      } else {
        seenFullTimers.set(timer, row.feature);
      }

      const baseOwnerFeature = baseOwner.get(base);
      if (baseOwnerFeature && baseOwnerFeature.type !== row.type) {
        reasons.push(
          `${row.feature} (${row.type}) and ${baseOwnerFeature.feature} (${baseOwnerFeature.type}) both use base ${base}`,
        );
      } else if (!baseOwnerFeature) {
        baseOwner.set(base, { feature: row.feature, type: row.type });
      }
    }

    if (row.currentDma) {
      const stream = row.currentDma.stream;

      if (reservedStreams.has(stream)) {
        reasons.push(`${row.feature} sits on ${stream}, which is reserved for another peripheral`);
      }

      const dmaOwner = seenDma.get(stream);
      if (dmaOwner) {
        reasons.push(`${row.feature} and ${dmaOwner} both use ${stream}`);
      } else {
        seenDma.set(stream, row.feature);
      }
    }
  }

  return { hasClash: reasons.length > 0, reasons };
}

/**
 * @typedef {Object} FeatureAllocation
 * @property {string} feature
 * @property {string} pin
 * @property {?import("./timer_dma_lookup.js").TimerOption} chosen
 * @property {import("./dma_allocator.js").DmaAllocationResult} dma
 */

/**
 * Runs the full timer, then DMA, allocation pass over every feature
 * row together.
 * @param {FeatureTimerRow[]} featureRows
 * @param {Set<string>} [reservedStreams] - See
 *   timer_dma_lookup.js's parseReservedDmaStreams.
 * @param {Set<string>} [reservedTimers] - See
 *   timer_dma_lookup.js's parseReservedTimers.
 * @returns {FeatureAllocation[]}
 */
export function reallocateTimersAndDma(
  featureRows,
  reservedStreams = new Set(),
  reservedTimers = new Set(),
) {
  const timerRows = allocateTimers(
    featureRows.map(({ feature, pin, options }) => ({ feature, pin, options })),
    reservedTimers,
  );
  const dmaResults = allocateDma(timerRows, reservedStreams);

  return timerRows.map((row) => ({
    feature: row.feature,
    pin: row.pin,
    chosen: row.chosen,
    dma: dmaResults[row.feature],
  }));
}

/**
 * Turns a fresh allocation into the CLI commands needed to apply it,
 * skipping any feature whose allocated timer/DMA already matches what
 * it's currently set to -- so a reallocation triggered by one clashing
 * feature doesn't churn every other feature's settings along with it
 * unless the allocator genuinely moved them too.
 *
 * Every pin whose timer or DMA is changing is freed first (`timer
 * <PIN> NONE` / `dma pin <PIN> NONE`), and only once every removal has
 * been sent does any new assignment go out -- the same two-phase
 * ordering remap_table.js's buildChangeCommands uses for `resource`,
 * so a straight swap between two pins can never try to claim a value
 * the other side hasn't freed yet.
 *
 * A feature the allocator couldn't find any valid timer for at all
 * (timer_allocator.js's base-exclusivity/critical-base rules left it
 * with nothing) is left alone entirely -- no removal, no addition --
 * rather than freeing its existing timer with nothing to replace it.
 * Sending `timer <PIN> NONE` on its own would take a working output
 * and turn it into a broken one; leaving it exactly as it was is worse
 * only in that the clash it was already part of isn't fixed, which is
 * the same outcome as not running the allocator at all. Reported back
 * via `unresolved` so the caller can warn about it instead.
 * @param {FeatureTimerRow[]} featureRows
 * @param {FeatureAllocation[]} allocation
 * @returns {{commands: string[], unresolved: string[]}}
 */
export function buildTimerDmaCommands(featureRows, allocation) {
  const currentByFeature = new Map(featureRows.map((row) => [row.feature, row]));
  const timerRemovals = [];
  const timerAdditions = [];
  const dmaRemovals = [];
  const dmaAdditions = [];
  const unresolved = [];

  for (const result of allocation) {
    const current = currentByFeature.get(result.feature);

    // A feature with timer options that still ended up with none
    // chosen is a genuine allocation failure, not just "this feature
    // has no timer capability at all" (which also has chosen: null,
    // but with an empty options list too, and nothing to warn about).
    if (!result.chosen && (current?.options?.length ?? 0) > 0) {
      unresolved.push(result.feature);
      continue;
    }

    const oldAF = current?.currentOption?.af ?? null;
    const newAF = result.chosen?.af ?? null;
    const afChanged = oldAF !== newAF;

    if (afChanged) {
      if (oldAF !== null) timerRemovals.push(`timer ${result.pin} NONE`);
      if (newAF !== null) timerAdditions.push(`timer ${result.pin} ${newAF}`);
    }

    // A DMA index only means the same thing across two allocations if
    // the AF (and so the timer option it indexes into) hasn't changed
    // -- once the AF moves, last time's index refers to a different
    // option's DMA list entirely, so a changed AF always means the old
    // DMA choice (if any) needs freeing rather than being compared.
    const oldDmaIndex = !afChanged ? (current?.currentDma?.index ?? null) : null;
    const oldDmaPresent = afChanged ? current?.currentDma != null : oldDmaIndex !== null;
    const newDmaIndex = result.dma.selectedDMAIndex >= 0 ? result.dma.selectedDMAIndex : null;
    const dmaChanged = afChanged ? oldDmaPresent || newDmaIndex !== null : oldDmaIndex !== newDmaIndex;

    if (dmaChanged) {
      if (oldDmaPresent) dmaRemovals.push(`dma pin ${result.pin} NONE`);
      if (newDmaIndex !== null) dmaAdditions.push(`dma pin ${result.pin} ${newDmaIndex}`);
    }
  }

  return {
    commands: [...timerRemovals, ...timerAdditions, ...dmaRemovals, ...dmaAdditions],
    unresolved,
  };
}

// Turns a FeatureTimerRow's own as-read state into the same shape
// reallocateTimersAndDma() returns, so logAllocation can show a
// consistent table whether or not anything actually needed
// reallocating.
function allocationFromCurrentState(featureRows) {
  return featureRows.map((row) => ({
    feature: row.feature,
    pin: row.pin,
    chosen: row.currentOption,
    dma: {
      dmaOptions: row.currentOption?.dma ?? [],
      selectedDMAIndex: row.currentDma?.index ?? -1,
      dmaInfo: row.currentDma,
    },
  }));
}

/**
 * @typedef {Object} AllocationTableRow
 * @property {string} feature
 * @property {string} pin
 * @property {boolean} unresolved - Whether this feature's timer could
 *   not be resolved at all, so what's shown is its unchanged existing
 *   state rather than anything actually being applied.
 * @property {string} timerCommand - The `timer` CLI command, for
 *   reference alongside the human-readable form below.
 * @property {string} timer - A human-readable resolution, e.g.
 *   "pin A03: TIM9 CH2 (AF3)" -- much easier to place at a glance than
 *   "timer A03 AF3" alone.
 * @property {string} dmaCommand - The `dma pin` CLI command.
 * @property {string} dma - A human-readable resolution, e.g.
 *   "pin A09: DMA2 Stream 6 Channel 0".
 */

/**
 * Builds one row per feature describing its timer/DMA outcome, for
 * display in the UI's allocation panel. An unresolved feature (see
 * buildTimerDmaCommands) shows its unchanged *existing* state rather
 * than the failed allocation attempt, since nothing was actually sent
 * for it -- showing the attempt would misleadingly suggest its timer
 * had been cleared.
 *
 * A feature with nothing chosen at all -- e.g. one the table just
 * staged onto a new pin, which never had a timer/DMA of its own to
 * begin with -- shows "-" rather than a synthetic "timer <PIN> NONE"/
 * "dma pin <PIN> NONE": there's genuinely nothing there yet, so a
 * command-shaped string would misleadingly suggest one is about to be
 * (or already was) sent to clear something that was never set.
 * @param {FeatureTimerRow[]} featureRows
 * @param {FeatureAllocation[]} allocation
 * @param {string[]} unresolved
 * @returns {AllocationTableRow[]}
 */
export function buildAllocationTable(featureRows, allocation, unresolved = []) {
  const currentByFeature = new Map(featureRows.map((row) => [row.feature, row]));
  const unresolvedSet = new Set(unresolved);

  return allocation.map((result) => {
    const isUnresolved = unresolvedSet.has(result.feature);
    const current = currentByFeature.get(result.feature);

    const chosen = isUnresolved ? (current?.currentOption ?? null) : result.chosen;
    const dmaInfo = isUnresolved ? (current?.currentDma ?? null) : result.dma.dmaInfo;
    const dmaIndex = isUnresolved
      ? (current?.currentDma?.index ?? -1)
      : result.dma.selectedDMAIndex;

    return {
      feature: result.feature,
      pin: result.pin,
      unresolved: isUnresolved,
      timerCommand: chosen ? `timer ${result.pin} ${chosen.af}` : "-",
      timer: chosen ? `pin ${result.pin}: ${chosen.timer} (${chosen.af})` : "-",
      dmaCommand: dmaIndex >= 0 ? `dma pin ${result.pin} ${dmaIndex}` : "-",
      dma: dmaInfo ? `pin ${result.pin}: ${dmaInfo.stream} Channel ${dmaInfo.channel}` : "-",
    };
  });
}

/**
 * The single entry point for the apply flow. Always runs the full
 * timer/DMA allocation pass and returns calculatedTable (what a from-
 * scratch allocation pass computes -- the working state's own current
 * timer/DMA when nothing needs fixing, since that's already the
 * correct answer) for display in the UI, but only stages `commands`
 * (and only reports `unresolved`) when the working state's current
 * timer/DMA actually has a clash: calculating what a reallocation
 * *would* look like is harmless and useful to see at any time, but
 * only ever worth actually sending when something's genuinely wrong.
 * @param {import("./hardware_parser.js").HardwareMap} workingCurrent
 * @param {?string} mcuType
 * @param {Object} mcuAllData
 * @param {Set<string>} [reservedDmaStreams] - DMA streams already
 *   claimed by something outside this tool's control (SPI, ADC, ...)
 *   -- see timer_dma_lookup.js's parseReservedDmaStreams. Never
 *   offered to a motor/servo/freq/LED feature, and a feature already
 *   sitting on one of these counts as a clash on its own.
 * @param {Set<string>} [reservedTimers] - Full timer+channel strings
 *   already claimed by something outside this tool's control (the
 *   gyro's clock/sync signal, ...) -- see timer_dma_lookup.js's
 *   parseReservedTimers. Same treatment as reservedDmaStreams.
 * @returns {{commands: string[], clash: ClashReport, unresolved: string[], calculatedTable: AllocationTableRow[]}}
 */
export function reconcileTimersAndDma(
  workingCurrent,
  mcuType,
  mcuAllData,
  reservedDmaStreams = new Set(),
  reservedTimers = new Set(),
) {
  const featureRows = buildFeatureRows(workingCurrent, mcuType, mcuAllData);
  const clash = detectClashes(featureRows, reservedDmaStreams, reservedTimers);

  if (!clash.hasClash) {
    const calculatedTable = buildAllocationTable(featureRows, allocationFromCurrentState(featureRows));
    return { commands: [], clash, unresolved: [], calculatedTable };
  }

  const allocation = reallocateTimersAndDma(featureRows, reservedDmaStreams, reservedTimers);
  const { commands, unresolved } = buildTimerDmaCommands(featureRows, allocation);
  return {
    commands,
    clash,
    unresolved,
    calculatedTable: buildAllocationTable(featureRows, allocation, unresolved),
  };
}
