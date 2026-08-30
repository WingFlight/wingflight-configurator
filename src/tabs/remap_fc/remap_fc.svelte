<script>
  /**
   * File: src/tabs/remap_fc/remap_fc.svelte
   * UI for the "Remap FC" tab: a run button plus a live, editable
   * current-vs-default pin remap table, driven by remap_fc.js via the
   * exported setRunning/setError/setHardware/reset functions. All the
   * table-building and editing logic lives in this component — the
   * tab controller only hands over the raw current/default hardware
   * maps read from the FC.
   */

  import { i18n } from "@/js/i18n.js";
  import { FC } from "@/js/fc.svelte.js";
  import { getTabHelpURL } from "@/js/help";
  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Select from "@/components/Select.svelte";
  import Switch from "@/components/Switch.svelte";
  import {
    OPTION_KEYS,
    TABLE_OPTION_KEYS,
    buildChangeCommands,
    buildRowsForOptions,
    getAddableOptions,
    getRowSelectableOptions,
  } from "@/js/remap_fc/remap_table.js";
  import { reconcileTimersAndDma } from "@/js/remap_fc/timer_dma_reconciler.js";
  import { findPinConflictSuggestions } from "@/js/remap_fc/pin_conflict_suggestions.js";
  import {
    buildReferenceLabels,
    buildReservedPins,
    buildNamedConnectorPins,
    expandOptionName,
  } from "@/js/remap_fc/reference_design_labels.js";
  import { loadReferenceDesigns } from "@/js/remap_fc/reference_design_source.js";
  import mcuAllData from "@/tabs/remap_fc/MCU-all.json";
  import referenceDesignsLocal from "@/tabs/remap_fc/reference_designs.json";

  // Starts as the copy bundled with this build so the tab is usable
  // immediately, then replaced with the latest version fetched from
  // GitHub once that resolves (cached for the rest of this session --
  // see reference_design_source.js), so a newly documented board
  // doesn't have to wait for a new configurator release to show up
  // here. Silently keeps the bundled copy if the fetch fails.
  let referenceDesigns = $state(referenceDesignsLocal);
  loadReferenceDesigns(referenceDesignsLocal).then((data) => {
    referenceDesigns = data;
  });

  // Sentinel dropdown value meaning "nothing assigned to this pin" —
  // distinct from the empty placeholder value used by the "+ Add" row.
  const NONE_VALUE = "__none__";

  /**
   * @typedef {Object} Props
   * @property {() => void} onRunClick - Called when the run button is pressed.
   * @property {(commands: string[]) => void} onLoadChanges - Called with the full staged command list (`resource`/`timer`/`dma pin` plus a trailing "save") when "Load Changes" is pressed.
   */
  /** @type {Props} */
  const { onRunClick, onLoadChanges } = $props();

  // --- Local UI state, all driven by remap_fc.js via the exported
  // setters below (this component never fetches anything itself). ---
  let running = $state(false);
  let error = $state(null);
  // Whether a read has completed at least once — once true, the board
  // info card (and everything else below it) shows instead of the
  // "Read FC" button, since there's no longer anything for that
  // button to do.
  let hasRead = $state(false);
  // The flight controller's MCU family (e.g. "STM32F7X2"), parsed from
  // the current hardware dump. Matches the top-level keys of
  // STM32_timers.json/STM32_DMA.json.
  let mcuType = $state(null);
  // workingCurrent is a local, editable copy of the current hardware
  // map: it starts as whatever was read from the FC, and is mutated
  // here as the user makes "Current Option" picks. Nothing is sent to
  // the FC yet — this is staging only.
  /** @type {import("@/js/remap_fc/hardware_parser.js").HardwareMap} */
  let workingCurrent = $state({});
  // originalCurrent is the untouched hardware map exactly as last read
  // (or last successfully applied) — the baseline workingCurrent is
  // diffed against to work out what actually changed and needs to be
  // sent to the FC. Never mutated by editing, only replaced wholesale
  // by setHardware()/reset().
  /** @type {import("@/js/remap_fc/hardware_parser.js").HardwareMap} */
  let originalCurrent = $state({});
  // defaultHardware is the read-only reference for each option's
  // default pin; it never changes after a "Read FC" run.
  /** @type {import("@/js/remap_fc/hardware_parser.js").HardwareMap} */
  let defaultHardware = $state({});
  // DMA streams already claimed by something outside this tool's
  // control -- SPI buses, the ADC, etc. -- read once per "Read FC" (see
  // remap_fc.js's #doRunSequence) and handed to reconcileTimersAndDma
  // so its reallocation pass never proposes stealing one of these.
  /** @type {Set<string>} */
  let reservedDmaStreams = $state(new Set());
  // Same idea for full timer+channel claims outside this tool's
  // control -- the gyro's clock/sync signal, etc.
  /** @type {Set<string>} */
  let reservedTimers = $state(new Set());
  // The board's own current dshot_burst/dshot_bitbang settings, read
  // once per "Read FC" (see remap_fc.js's #dshotBurst/#dshotBitbang) --
  // purely informational, shown as CLI comment lines ahead of the
  // staged commands (see commandsToSend) so they're visible whenever
  // reviewing what's about to be sent, since they affect whether
  // firmware actually uses DMA for a motor output at all (see
  // feature_classifier.js's featureNeedsDma). null before read, or if
  // dump hardware's own "# master" section didn't report them.
  /** @type {?string} */
  let dshotBurstSetting = $state(null);
  /** @type {?string} */
  let dshotBitbangSetting = $state(null);
  // The option keys that have a row in the table: seeded from whatever
  // was assigned on read, and grown whenever an option is added via
  // the "+ Add" row. Picking "None" for a row's current option removes
  // that row again — that's how an accidental add gets undone.
  /** @type {string[]} */
  let visibleOptions = $state([]);
  // Option keys whose row was just added via "+ Add" and hasn't had a
  // "Current Option" pick made yet — these show the "Set Option"
  // placeholder instead of whatever their default pin's join would
  // otherwise resolve to, forcing an explicit "None" or real choice.
  /** @type {string[]} */
  let unsetOptions = $state([]);
  // Bound to the "+ Add" dropdown so we can reset it back to the
  // placeholder after each selection.
  let selectedAddOption = $state("");
  // Whether the "+ Add" row is currently showing its dropdown rather
  // than the button that reveals it — opened on click, and closed
  // again as soon as a choice is made.
  let addMenuOpen = $state(false);
  // The option key most recently placed onto a pin via a row's
  // Current Option dropdown -- set in handleCurrentOptionChange, read
  // by the pin-conflict warning panel when no automatic swap/move
  // resolves an unresolved clash, to point the user back at whichever
  // pin choice they just made rather than guessing at some other
  // feature to touch on their behalf.
  let lastChangedOption = $state(null);
  // Whether the "Calculated config" card is expanded -- collapsed by
  // default, since it's implementation detail (raw timer/DMA
  // assignments) most users never need to look at.
  let showCalculatedDetails = $state(false);

  // Keep the visible rows in the same fixed order as OPTION_KEYS,
  // regardless of the order options were added in.
  let orderedVisible = $derived(
    OPTION_KEYS.filter((option) => visibleOptions.includes(option)),
  );

  // The rows actually rendered in the table, recomputed from the
  // (possibly edited) working copy every time it changes.
  let tableRows = $derived(
    buildRowsForOptions(orderedVisible, workingCurrent, defaultHardware),
  );

  // The board diagram's own square size in pixels, computed directly
  // from the table's row count rather than measured from the DOM --
  // measuring the table's own rendered height instead would also
  // catch the "+ Add" dropdown's option list temporarily inflating it
  // while open, growing and then shrinking the diagram back down as
  // soon as it's closed. This way only real, committed rows change
  // it. Clamped so it's never too small to read or big enough to
  // dwarf the table next to it. Computed in JS rather than via the
  // CSS aspect-ratio property -- this app's own runtime doesn't
  // support aspect-ratio (it silently resolves to a height of 0), so
  // this is the reliable alternative regardless.
  const DIAGRAM_BASE_SIZE = 70;
  const DIAGRAM_ROW_SIZE = 25;
  let diagramSize = $derived(
    Math.min(
      480,
      Math.max(160, DIAGRAM_BASE_SIZE + tableRows.length * DIAGRAM_ROW_SIZE),
    ),
  );

  // Pin -> friendly name (e.g. "ESC", "TAIL", "Port A Rx") from the
  // reference design matching this board's own design family, so the
  // table and "+ Add" can show the board's own silkscreen labelling
  // alongside the CLI's MOTOR/SERVO/SERIAL_RX naming. Empty for a
  // board whose design isn't one of the documented reference families
  // -- every lookup below just falls back to the plain option name.
  let referenceLabels = $derived(
    buildReferenceLabels(referenceDesigns, FC.CONFIG.boardDesign),
  );

  // Pins the reference design wires to fixed onboard sensor/support
  // hardware (the baro's I2C bus, the gyro's SPI lines, etc.) rather
  // than a general-purpose connector -- excluded from "+ Add" below,
  // since offering them for reassignment would silently break
  // whatever that sensor is rather than free up a spare pin.
  let reservedPins = $derived(
    buildReservedPins(referenceDesigns, FC.CONFIG.boardDesign),
  );

  // Pins this board's reference design documents as a specific,
  // purpose-built connector (AUX, SBUS, TLM, RPM, ...) rather than a
  // generic "Port X" one -- same set setHardware already uses to
  // decide which UART/I2C options always get a row.
  let namedConnectorPins = $derived(
    buildNamedConnectorPins(referenceDesigns, FC.CONFIG.boardDesign),
  );

  // The UART/I2C option keys behind those named-connector pins (e.g.
  // "RX2" for a board that calls it "TLM") -- passed to
  // getRowSelectableOptions so a named connector can be picked as any
  // row's Current Option (labelled through optionLabel the same as
  // everything else, so the user sees "TLM", never the raw "RX2"), the
  // same as a motor/servo can. Without this, clearing a named
  // connector's own row leaves it reachable only through "+ Add",
  // where nothing hints that "TLM" is what "RX2" is called there -- a
  // user who doesn't already know that mapping would have no way to
  // bring it back at all.
  //
  // Explicitly excludes TABLE_OPTION_KEYS: a servo/motor's own default
  // pin can itself be a named connector (e.g. "TAIL" is S4's own pin
  // on some boards), but getRowSelectableOptions's own pool already
  // includes every TABLE_OPTION_KEYS member unconditionally -- adding
  // S4 again here would offer it twice in the same dropdown, which
  // Svelte's keyed {#each} in Select.svelte rejects outright as a
  // duplicate key.
  let namedConnectorOptionKeys = $derived(
    Object.keys(defaultHardware).filter(
      (option) =>
        !TABLE_OPTION_KEYS.includes(option) &&
        namedConnectorPins.has(defaultHardware[option]?.pin),
    ),
  );

  // Two labels displayName would otherwise resolve to that read
  // misleadingly for how this board's outputs are actually used in
  // practice, even though the FC's own reference design / CLI naming
  // is unchanged: "TAIL" (a reference design usage name) is wired to a
  // servo output, and "Motor 2" (expandOptionName's fallback for M2)
  // is actually a second ESC output. Applied by optionLabel, on top of
  // displayName's own result, wherever a *function* is being picked
  // for a port rather than the port itself being named -- see
  // optionLabel/displayName's own comments for the distinction.
  const DISPLAY_LABEL_OVERRIDES = {
    TAIL: "Servo 4",
    "Motor 2": "ESC 2",
  };

  // The board's own name for an option's default pin (e.g. "ESC" for
  // "M1", "TAIL" for "S4") when this board's reference design
  // documents one, since that's the label the user actually has
  // printed on the board; otherwise falls back to expandOptionName's
  // spelled-out CLI name (e.g. "Servo 1" for "S1"). Used anywhere a
  // *physical port* is being named, never overridden, since that
  // identity is the board's own connector name and can't change: a
  // row's own "FC Pin" column, and "+ Add" (bringing a port into the
  // table is about which port, not which logical function ends up
  // occupying it -- see optionLabel for that). Always resolved via the
  // option's *own* default pin, regardless of where it's currently
  // sitting -- an option's identity, and so its reference label,
  // doesn't change just because it's been reassigned elsewhere.
  function displayName(option) {
    const pin = defaultHardware[option]?.pin;
    return (
      (pin !== undefined && referenceLabels[pin]) || expandOptionName(option)
    );
  }

  // The name to show for an option wherever it appears as a value
  // being *picked* for some port's Current Option -- the dropdown's
  // own selected-value display and its list of choices. Same as
  // displayName, but with DISPLAY_LABEL_OVERRIDES applied on top,
  // since a function being assigned to a port reads better by its
  // logical servo/ESC slot than by whichever other connector's name
  // its own default pin happens to share (e.g. picking S4 to drive the
  // TAIL port reads as "Servo 4", not as "TAIL" a second time).
  function optionLabel(option) {
    return DISPLAY_LABEL_OVERRIDES[displayName(option)] || displayName(option);
  }

  // Builds the human-readable label for a pin-conflict suggestion (see
  // pinConflictSuggestions/pin_conflict_suggestions.js), using this
  // board's own reference-design labels the same way every other
  // option label in this tab does -- pin_conflict_suggestions.js
  // itself has no knowledge of reference designs, only raw CLI option
  // keys (e.g. "M1"), so building the actual display label is this
  // component's job, not that module's.
  function suggestionLabel(suggestion) {
    return suggestion.type === "swap"
      ? $i18n.t("remapFcSuggestionSwap", {
          feature: optionLabel(suggestion.feature),
          otherFeature: optionLabel(suggestion.otherFeature),
        })
      : $i18n.t("remapFcSuggestionMove", {
          feature: optionLabel(suggestion.feature),
          targetPin: suggestion.targetPin,
        });
  }

  // The option keys currently claimed as some row's Current Option —
  // including a row showing itself, unchanged. Anything in this set is
  // spoken for and shouldn't be offered anywhere else.
  //
  // Unioned with every TABLE_OPTION_KEYS member directly present as a
  // key in workingCurrent, not just ones a row's join could discover:
  // buildRowsForOptions finds a row's occupant by looking up who else
  // sits on *that row's own default pin*, so an option the FC reports
  // as actually assigned, but whose own default hardware never sets a
  // pin for it (e.g. an LED strip pin some boards don't wire by
  // default), has no row whose default pin ever points back to it —
  // its row resolves to defaultPin: null, currentOption: null, even
  // though it's genuinely still claimed. Without this, such an option
  // would wrongly show back up in "+ Add" and other rows' dropdowns as
  // if it were free.
  let claimedOptions = $derived([
    ...new Set([
      ...tableRows
        .map((row) => row.currentOption)
        .filter((option) => option !== null),
      ...TABLE_OPTION_KEYS.filter((option) => option in workingCurrent),
    ]),
  ]);

  // The full pool for the "+ Add" row: every default-structure option
  // that isn't already spoken for — including ones that are currently
  // assigned but never get an automatic row (UART/I2C resources),
  // which still show up here so they can be brought into view
  // (handleAddChange guards against re-adding an option that already
  // has a row, so this can't create a duplicate when picked) — except
  // reservedPins, which are never offered at all (see its own comment).
  // No "None" sentinel here, unlike a row's own Current Option
  // dropdown — "+ Add" only ever brings something new into view, so
  // there's nothing for "None" to mean.
  let addablePool = $derived(
    getAddableOptions(defaultHardware, visibleOptions).filter(
      (addable) => !reservedPins.has(addable.defaultPin),
    ),
  );

  // Whether there's anything left to add — used to hide the "+ Add"
  // row once nothing remains.
  let hasRealAddableOptions = $derived(addablePool.length > 0);

  // How many rows the "+ Add" listbox shows at once while open: every
  // choice plus the placeholder, capped so it can't grow unreasonably
  // tall when there's a lot to pick from.
  let addMenuSize = $derived(Math.min(addablePool.length + 1, 10));

  // The pool offered by a given row's own "Current Option" dropdown.
  // Computed per row, rather than shared, because eligibility depends
  // on what this row currently holds: picking anything here other than
  // "None" or the row's own option evicts row.currentOption (see
  // handleCurrentOptionChange's previousOccupant), so that occupant is
  // excluded from the claimed set passed into the M/S/Freq
  // filling-order check (getRowSelectableOptions/isEligibleToAdd) —
  // otherwise a candidate that's only eligible *because* the occupant
  // is configured (e.g. M3 needs M2 configured, and M2 is what this
  // row currently holds) would be offered, and picking it would
  // immediately break the very invariant that made it eligible,
  // leaving M3 configured with M2 gone. The row's own current value
  // doesn't need to be included here regardless — the template always
  // renders it as its own option separately.
  //
  // Otherwise excludes only options genuinely claimed elsewhere right
  // now (claimedOptions, via getRowSelectableOptions) -- deliberately
  // not options merely sitting in another row's unresolved "unset"
  // state (e.g. a freshly "+ Add"ed row nobody's picked a value for
  // yet). An earlier version excluded those too, on the theory that
  // one row's edit could "steal" an option another row was mid-pick
  // on -- but every row's own dropdown recomputes live off
  // claimedOptions, so the moment anything actually claims an option,
  // every other row's list drops it immediately regardless; there was
  // no real race to guard against, only an option that's genuinely
  // free being needlessly withheld from every row but its own.
  //
  // Deliberately uses claimedOptions rather than visibleOptions: an
  // option can have its own row (visibleOptions) while having gone
  // "homeless" — e.g. M1's row still exists, but a different row's edit
  // moved M1 off its own default pin, so M1 itself is no longer any
  // row's Current Option — and a homeless option must stay pickable
  // elsewhere, exactly like it does in the "+ Add" pool (see
  // getAddableOptions), or there'd be no way to place it anywhere but
  // back onto its own original pin.
  //
  // namedConnectorOptionKeys extends getRowSelectableOptions's own
  // pool beyond TABLE_OPTION_KEYS with this board's own named
  // connectors (AUX, SBUS, TLM, RPM, ...) -- without it, clearing one
  // is reachable only through "+ Add", where nothing hints that (say)
  // "TLM" is what "RX2" is called here, so a user who doesn't already
  // know that mapping would have no way to bring it back at all.
  /**
   * @param {import("@/js/remap_fc/remap_table.js").RemapRow} row
   */
  function optionsForRow(row) {
    const claimedIfPicked = row.currentOption
      ? claimedOptions.filter((option) => option !== row.currentOption)
      : claimedOptions;

    return [
      NONE_VALUE,
      ...getRowSelectableOptions(claimedIfPicked, namedConnectorOptionKeys),
    ].filter((option) => option !== row.currentOption);
  }

  // The `resource` CLI commands needed to bring the flight controller
  // from originalCurrent to workingCurrent -- recomputed on every edit
  // so the "Load Changes" button and its preview panel always reflect
  // exactly what's staged right now. hasPendingChanges is based on this
  // alone (not commandsToSend below), since a "save" on its own with no
  // resource changes to go with it is never something to offer.
  let pendingCommands = $derived(
    buildChangeCommands(originalCurrent, workingCurrent),
  );
  let hasPendingChanges = $derived(pendingCommands.length > 0);

  // The single, always-current timer/DMA reallocation pass over the
  // working state: whether it clashes right now, what a fresh
  // allocation pass would assign each feature (forcing one through
  // even if it still collides with something, rather than leaving a
  // feature blank -- see pickBestOption/allocateDma's own comments for
  // why), which features are still genuinely unresolved despite that,
  // and the `timer`/`dma pin` commands needed to apply it. Recomputed
  // on every table edit -- there's no separate "Allocate Timers/DMA"
  // step to press; see markApplied for how it avoids proposing the
  // same commands again forever once they've actually been sent. Empty/
  // no-clash before the FC's been read, since there's nothing to check
  // yet.
  let reconciled = $derived(
    hasRead
      ? reconcileTimersAndDma(
          workingCurrent,
          mcuType,
          mcuAllData,
          reservedDmaStreams,
          reservedTimers,
        )
      : {
          commands: [],
          clash: { hasClash: false, reasons: [] },
          unresolved: [],
          calculatedTable: [],
          allocation: [],
        },
  );
  let timerDmaCommands = $derived(reconciled.commands);
  let calculatedAllocationTable = $derived(reconciled.calculatedTable);
  let unresolvedFeatures = $derived(reconciled.unresolved);

  // Candidate pin swaps/moves that would let a fresh reallocation
  // resolve everything, plus which features are genuinely unresolved
  // regardless of whether any were found -- empty whenever a clash
  // exists but a full reallocation pass on the *current* pin
  // assignments would already resolve it (liveClash.hasClash true,
  // unresolvedFeatures empty): that case only needs "Allocate
  // Timers/DMA" pressed, not a pin-level fix, so the warning panel
  // below stays hidden for it. unresolvedFeatures only non-empty once
  // reallocation genuinely can't resolve the current pin layout at
  // all -- see pin_conflict_suggestions.js for the search itself.
  // suggestions can still be empty even then, when no single swap/move
  // resolves it -- the panel falls back to pointing at
  // lastChangedOption for that case rather than guessing at a fix.
  let pinConflictResult = $derived(
    hasRead
      ? findPinConflictSuggestions(
          workingCurrent,
          mcuType,
          mcuAllData,
          reservedDmaStreams,
          reservedTimers,
          tableRows,
        )
      : { unresolvedFeatures: [], suggestions: [] },
  );

  // Bound to the suggestion picker dropdown when there's more than
  // one candidate -- a string, like every other value this app's
  // Select component binds (a native <select>'s own value is always a
  // string regardless), rather than relying on the index surviving
  // the round trip as a number. Clamped defensively in case the
  // suggestion list itself shrinks (e.g. after a table edit) while an
  // index past its new end is still selected.
  let selectedSuggestionIndex = $state("0");
  let selectedSuggestion = $derived(
    pinConflictResult.suggestions[
      Math.min(
        Number(selectedSuggestionIndex),
        pinConflictResult.suggestions.length - 1,
      )
    ] ?? null,
  );

  // The feature the pin-conflict warning panel's manual-fix message/
  // button targets when no swap/move resolves the clash -- whichever
  // one the user most recently placed, falling back to whichever
  // unresolved feature comes first if nothing's been touched yet this
  // session (e.g. the clash was already there on read).
  let manualFixTarget = $derived(
    lastChangedOption ?? pinConflictResult.unresolvedFeatures[0] ?? null,
  );

  // Whether there's anything staged to actually send -- resource
  // changes, timer/DMA changes, or both. Drives the "Load Changes"
  // button/preview panel, which needs to appear even when the only
  // thing staged is a timer/DMA fix with no resource edits alongside it.
  let hasStagedCommands = $derived(
    hasPendingChanges || timerDmaCommands.length > 0,
  );

  // Leading `#` comment lines noting the board's own current
  // dshot_burst/dshot_bitbang settings (see setHardware) -- purely
  // informational for now (a `#` line is an inert CLI comment,
  // harmless to actually send), so whoever's reviewing the staged
  // commands can see at a glance what DSHOT/bitbang mode is active,
  // since it affects whether firmware actually uses DMA for a motor
  // output at all. Omitted individually if dump hardware's own
  // "# master" section didn't report one, rather than showing "null".
  let dshotSettingComments = $derived([
    ...(dshotBurstSetting !== null
      ? [`# dshot_burst = ${dshotBurstSetting}`]
      : []),
    ...(dshotBitbangSetting !== null
      ? [`# dshot_bitbang = ${dshotBitbangSetting}`]
      : []),
  ]);

  // What "Load Changes" actually sends, and what the preview panel
  // shows -- the two must always match exactly, so this is the single
  // place "save" gets appended. `resource`/`timer`/`dma pin` commands
  // only change the in-memory config; `save` is what persists them and
  // reboots the flight controller so the new pin/timer/DMA assignments
  // actually take effect. Timer/DMA commands go out after every
  // `resource` command, since a pin's final timer options can depend
  // on which feature ends up on it.
  let commandsToSend = $derived([
    ...dshotSettingComments,
    ...pendingCommands,
    ...timerDmaCommands,
    "save",
  ]);

  // --- Functions below are called from remap_fc.js on the mounted
  // instance (e.g. `component.setRunning(true)`), the same way
  // Failsafe.svelte exposes onSave/onRevert/isDirty. ---

  export function setRunning(value) {
    running = value;
  }

  export function setError(message) {
    error = message;
  }

  /**
   * Seeds this component's editable working copy from a fresh CLI
   * read: each row is a fixed, board-labeled physical pin, so a row is
   * shown for an OPTION_KEYS identity only when its *default* pin is
   * actually occupied by something right now — never for a genuinely
   * empty default pin (e.g. one explicitly cleared to "None" and
   * saved), which gets no row until it's brought back via "+ Add",
   * same as a board that never had anything there.
   *
   * Which identities qualify differs by kind, though:
   *  - A motor/servo/freq/LED (TABLE_OPTION_KEYS) always gets a row
   *    once its default pin is occupied, regardless of *what* occupies
   *    it — including itself (the normal case), or a different
   *    TABLE_OPTION_KEYS feature that's been reassigned there (e.g.
   *    Freq1's pin now holds M2, so Freq1's row still shows, with M2
   *    as its occupant).
   *  - A UART/I2C identity (RX/TX/SDA/SCL) gets an automatic row when
   *    a motor/servo/freq/LED feature has been reassigned onto its
   *    default pin (e.g. M2 moved onto RX2's own default pin, A03 —
   *    RX2's row now shows M2, so M2 isn't left invisible just because
   *    the pin it's actually on belongs to a resource that never gets
   *    a row of its own), OR when the board's own reference design
   *    (see reference_design_labels.js) names it as a specific,
   *    purpose-built connector — AUX, SBUS, TLM, RPM, and the like —
   *    in which case it always gets a row, occupied or not, the same
   *    as a motor/servo header always does. A UART/I2C pin that's
   *    just sitting on its own default with nothing special about it
   *    (an undocumented board, or a generic "Port X" connector this
   *    reference design deliberately leaves unlabelled) stays hidden —
   *    it isn't reassignable through the table anyway (see
   *    getRowSelectableOptions) and would just be clutter; "+ Add"
   *    still reaches it explicitly.
   * @param {import("@/js/remap_fc/hardware_parser.js").HardwareMap} current
   * @param {import("@/js/remap_fc/hardware_parser.js").HardwareMap} defaultHw
   * @param {?string} mcu
   * @param {Set<string>} [reservedDma] - See remap_fc.js's #reservedDmaStreams.
   * @param {Set<string>} [reservedTmr] - See remap_fc.js's #reservedTimers.
   * @param {?string} [dshotBurst] - See remap_fc.js's #dshotBurst.
   * @param {?string} [dshotBitbang] - See remap_fc.js's #dshotBitbang.
   */
  export function setHardware(
    current,
    defaultHw,
    mcu,
    reservedDma = new Set(),
    reservedTmr = new Set(),
    dshotBurst = null,
    dshotBitbang = null,
  ) {
    workingCurrent = { ...current };
    originalCurrent = { ...current };
    defaultHardware = { ...defaultHw };
    mcuType = mcu;
    reservedDmaStreams = reservedDma;
    reservedTimers = reservedTmr;
    dshotBurstSetting = dshotBurst;
    dshotBitbangSetting = dshotBitbang;
    hasRead = true;

    const occupantOf = (pin) =>
      Object.keys(current).find((key) => current[key].pin === pin);

    visibleOptions = OPTION_KEYS.filter((option) => {
      const defaultPin = defaultHw[option]?.pin;
      if (defaultPin === undefined) return false;

      if (
        !TABLE_OPTION_KEYS.includes(option) &&
        namedConnectorPins.has(defaultPin)
      ) {
        return true;
      }

      const occupant = occupantOf(defaultPin);
      if (occupant === undefined) return false;
      return (
        TABLE_OPTION_KEYS.includes(option) ||
        TABLE_OPTION_KEYS.includes(occupant)
      );
    });

    // Rows freshly read from the FC are never "unset" — only ones
    // added afterwards via "+ Add" start in that placeholder state.
    unsetOptions = [];
  }

  /**
   * Called once the pending commands have actually been sent (see
   * remap_fc.js's #doApplySequence): adopts the current working copy
   * as the new baseline, collapsing pendingCommands back to nothing.
   * Doesn't attempt to re-read the FC itself -- a "save" reboots it,
   * so nothing at that point can safely wait for a fresh dump; the
   * table simply keeps showing what was just staged and sent.
   *
   * Also writes reconciled's own just-applied timer/af and dma index
   * into workingCurrent for every feature it resolved (never one still
   * in reconciled.unresolved -- that one's commands were withheld, not
   * sent, so its working state should stay exactly as it was). Without
   * this, workingCurrent's entries would carry no timer/dma of their
   * own forever (nothing else ever sets them -- a resource pick only
   * ever sets a pin, see handleCurrentOptionChange), so the very next
   * reactive pass would see the same "no timer chosen yet" gap it just
   * fixed and immediately propose reallocating and resending the exact
   * same commands again.
   */
  export function markApplied() {
    const next = { ...workingCurrent };
    for (const result of reconciled.allocation) {
      if (reconciled.unresolved.includes(result.feature)) continue;
      const entry = next[result.feature];
      if (!entry) continue;

      next[result.feature] = {
        ...entry,
        timer: result.chosen?.af,
        dma:
          result.dma?.selectedDMAIndex >= 0
            ? String(result.dma.selectedDMAIndex)
            : undefined,
      };
    }

    workingCurrent = next;
    originalCurrent = { ...next };
  }

  export function reset() {
    error = null;
    hasRead = false;
    mcuType = null;
    workingCurrent = {};
    originalCurrent = {};
    defaultHardware = {};
    reservedDmaStreams = new Set();
    reservedTimers = new Set();
    dshotBurstSetting = null;
    dshotBitbangSetting = null;
    visibleOptions = [];
    unsetOptions = [];
    selectedAddOption = "";
    addMenuOpen = false;
    lastChangedOption = null;
  }

  // onClick handles the "Read FC" button: clear any previous run's
  // state before asking the tab controller to start a new one.
  function onClick() {
    reset();
    onRunClick();
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabRemapFC"), "_system");
  }

  // handleAddChange fires when an option is picked from the "+ Add"
  // dropdown: give it a row (if it doesn't already have one), mark it
  // "unset" so it shows the "Set Option" placeholder until the user
  // makes an explicit choice, then close the dropdown back down to
  // just the "+ Add" button.
  /**
   * @param {Event} e
   */
  function handleAddChange(e) {
    const option = e.target.value;
    selectedAddOption = "";
    addMenuOpen = false;
    if (!option) return;

    if (!visibleOptions.includes(option)) {
      visibleOptions = [...visibleOptions, option];
      unsetOptions = [...unsetOptions, option];
    }
  }

  // handleLoadChanges fires when "Load Changes" is pressed: hand the
  // full command list -- the staged diff plus the trailing "save" --
  // to the tab controller, which sends it to the flight controller and
  // saves/reboots to make the change take effect.
  function handleLoadChanges() {
    onLoadChanges?.(commandsToSend);
  }

  // handleClearChanges fires when "Clear Changes" is pressed: discards
  // every edit made since the last successful read/apply by simply
  // re-running setHardware with originalCurrent -- the same as what
  // happens right after an initial read, since originalCurrent already
  // holds exactly that baseline (see setHardware/markApplied).
  function handleClearChanges() {
    setHardware(
      originalCurrent,
      defaultHardware,
      mcuType,
      reservedDmaStreams,
      reservedTimers,
      dshotBurstSetting,
      dshotBitbangSetting,
    );
  }

  // handleCurrentOptionChange fires when a row's "Current Option"
  // dropdown changes: clear whoever currently occupies that row's
  // default pin (a pin can only host one resource), then either
  // assign the picked option to that pin, or — if "None" was chosen —
  // remove the row entirely. That's how a row added by mistake gets
  // undone, without having to allocate it to something first. Either
  // way, the row is no longer "unset" once a choice has been made.
  /**
   * @param {import("@/js/remap_fc/remap_table.js").RemapRow} row
   * @param {Event} e
   */
  function handleCurrentOptionChange(row, e) {
    const chosen = e.target.value;
    const next = { ...workingCurrent };

    const previousOccupant = Object.keys(next).find(
      (key) => next[key].pin === row.defaultPin,
    );
    if (previousOccupant) delete next[previousOccupant];

    if (chosen === NONE_VALUE) {
      visibleOptions = visibleOptions.filter((option) => option !== row.option);
    } else if (chosen) {
      next[chosen] = { pin: row.defaultPin };
      lastChangedOption = chosen;
    }

    unsetOptions = unsetOptions.filter((option) => option !== row.option);
    workingCurrent = next;
  }

  // handleAcceptSuggestion fires when the pin-conflict warning panel's
  // "Accept Suggestion" button is pressed: adopts the selected
  // suggestion's precomputed pin layout wholesale (see
  // pin_conflict_suggestions.js) -- always a "swap" or "move", which
  // gives its feature(s) a freshly resolved pin, so any stale "unset"
  // placeholder state they were carrying is cleared too.
  function handleAcceptSuggestion() {
    if (!selectedSuggestion) return;

    workingCurrent = selectedSuggestion.apply;

    const affected = [
      selectedSuggestion.feature,
      selectedSuggestion.otherFeature,
    ].filter((option) => option !== null);
    unsetOptions = unsetOptions.filter((option) => !affected.includes(option));

    selectedSuggestionIndex = "0";
  }

  // handleResetToSetOption fires when the pin-conflict warning panel's
  // manual-fix button is pressed -- shown instead of a suggestion
  // picker when no swap/move resolves the clash (see
  // pinConflictResult/manualFixTarget). Clears manualFixTarget's pin
  // and marks its *row* -- deliberately never manualFixTarget itself
  // -- as unset, so it shows "Set Option" rather than "None". "None"
  // would risk the exact bug the old "clear" suggestion type had (see
  // pin_conflict_suggestions.js's own file comment): a feature with no
  // row of its own, once cleared, has no dropdown left to ever
  // un-flag it through again, permanently blacklisting it from
  // claimedOptions. The row always has one (it's a fixed part of the
  // table, tied to its own default pin regardless of what currently
  // occupies it), so marking it unset is always safe to undo --
  // picking anything in that row's dropdown clears the flag the same
  // way any other pick does. An explicit button rather than an
  // automatic revert deliberately -- the clash and its reasons stay
  // visible until the user actually confirms this, rather than the
  // panel flashing away before it's even been read.
  function handleResetToSetOption() {
    if (!manualFixTarget) return;

    const affectedRow = tableRows.find(
      (row) => row.currentOption === manualFixTarget,
    );
    if (!affectedRow) return;

    const next = { ...workingCurrent };
    delete next[manualFixTarget];
    workingCurrent = next;
    unsetOptions = unsetOptions.includes(affectedRow.option)
      ? unsetOptions
      : [...unsetOptions, affectedRow.option];
    lastChangedOption = null;
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabRemapFC")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

<Page {header} loading={false}>
  <p class="note">{$i18n.t("remapFcNote")}</p>

  <!-- Before a read, offer the button that triggers one; everything
       else below only has anything to show once the FC's actually
       been read. -->
  {#if !hasRead}
    <button class="btn run-btn" onclick={onClick} disabled={running}>
      {running ? $i18n.t("remapFcRunning") : $i18n.t("remapFcRunButton")}
    </button>
  {/if}

  <!-- Error from the last CLI sequence, if any. -->
  {#if error}
    <div class="error_message">{error}</div>
  {/if}

  {#if hasRead}
    <div class="board-info-card">
      <Section>
        {#snippet header()}
          <div class="header">
            <span class="title"
              >{FC.CONFIG.manufacturerId} {FC.CONFIG.boardName}</span
            >
          </div>
        {/snippet}

        {#if mcuType || FC.CONFIG.boardDesign}
          <table class="info-table">
            <tbody>
              {#if mcuType}
                <tr>
                  <td>{$i18n.t("remapFcMcuLabel")}</td>
                  <td>{mcuType}</td>
                </tr>
              {/if}
              <!-- The board's reference design (e.g. "F7A1"). This
                   comes from FC.CONFIG (populated via MSP at connect
                   time, not parsed from the CLI dump), so it's
                   already known before any read, but this whole card
                   only renders once hasRead is true anyway. -->
              {#if FC.CONFIG.boardDesign}
                <tr>
                  <td>{$i18n.t("remapFcDesignLabel")}</td>
                  <td>{FC.CONFIG.boardDesign}</td>
                </tr>
              {/if}
            </tbody>
          </table>
        {/if}
      </Section>
    </div>

    <!-- Controls the "Calculated config" card further down -- kept up
         here, next to the board info it actually toggles context for,
         rather than inside the card it hides, since a control that's
         only visible once you've already shown the thing it hides
         would be unreachable to turn back off from a glance. -->
    {#if calculatedAllocationTable.length}
      <label class="details-toggle">
        <Switch bind:checked={showCalculatedDetails} />
        <span>{$i18n.t("remapFcShowDetails")}</span>
      </label>
    {/if}

    <div class="table-with-diagram">
      <!-- The generic cased diagram, with the FC's own reported name
           overlaid on top. Not board-specific artwork -- building a
           dedicated diagram per manufacturer doesn't scale, so this
           is deliberately generic (see CASED_GENERIC.svg's own file
           comment). -->
      <div
        class="board-diagram-wrap"
        style="width: {diagramSize}px; height: {diagramSize}px;"
      >
        <img
          class="board-diagram"
          src="/images/remap_fc/CASED_GENERIC.svg"
          alt=""
        />
        <div class="board-diagram-label">
          {FC.CONFIG.manufacturerId}
          {FC.CONFIG.boardName}
        </div>
      </div>

      <!-- setHardware({}, {}, null) is called at the very start of a
           re-read (see remap_fc.js's #doRunSequence) to clear out the
           previous board's table before the new one's data has
           actually arrived back -- that already flips hasRead true
           (this whole section is showing), but leaves tableRows/
           hasRealAddableOptions both empty for the several seconds
           the CLI sequence takes, with nothing else on screen to
           explain why the table's gone. running stays true for that
           entire window (see remap_fc.js), so it's what this keys
           off, rather than the row/addable counts themselves — a
           board that genuinely has no rows to show (not just "not
           read yet") should still just render nothing here, same as
           before. -->
      {#if running}
        <div class="table-loading">
          <div class="spinner"></div>
          <p>{$i18n.t("remapFcLoadingHardware")}</p>
        </div>
      {:else if tableRows.length || hasRealAddableOptions}
        <table class="remap-table">
          <thead>
            <tr>
              <th>{$i18n.t("remapFcTableOption")}</th>
              {#if showCalculatedDetails}
                <th>{$i18n.t("remapFcTableDefaultPin")}</th>
              {/if}
              <th></th>
              <th>{$i18n.t("remapFcTableCurrentOption")}</th>
            </tr>
          </thead>
          <tbody>
            {#each tableRows as row (row.option)}
              {@const unset = unsetOptions.includes(row.option)}
              <tr>
                <td>{displayName(row.option)}</td>
                {#if showCalculatedDetails}
                  <td>{row.defaultPin ?? "—"}</td>
                {/if}
                <td class="arrow">
                  <img
                    class="arrow-cable"
                    src="/images/remap_fc/CABLE_ARROW.svg"
                    alt=""
                  />
                </td>
                <td>
                  <!-- Force a remount whenever the displayed value changes
                     (e.g. because a different row's edit cleared this
                     row's occupant, or this row just got resolved out
                     of the "unset" placeholder state) so the select
                     always reflects it. -->
                  {#key unset ? "unset" : row.currentOption}
                    <Select
                      value={unset ? "" : (row.currentOption ?? NONE_VALUE)}
                      onchange={(e) => handleCurrentOptionChange(row, e)}
                      options={[
                        ...(unset
                          ? [
                              {
                                value: "",
                                label: $i18n.t("remapFcSetOption"),
                              },
                            ]
                          : row.currentOption
                            ? [
                                {
                                  value: row.currentOption,
                                  label: optionLabel(row.currentOption),
                                },
                              ]
                            : []),
                        ...optionsForRow(row).map((option) => ({
                          value: option,
                          label:
                            option === NONE_VALUE
                              ? $i18n.t("remapFcNoneOption")
                              : optionLabel(option),
                        })),
                      ]}
                    />
                  {/key}
                </td>
              </tr>
            {/each}
            {#if hasRealAddableOptions}
              <tr class="add-row">
                <td colspan={showCalculatedDetails ? 4 : 3}>
                  {#if addMenuOpen}
                    <Select
                      bind:value={selectedAddOption}
                      onchange={handleAddChange}
                      size={addMenuSize}
                      options={[
                        { value: "", label: $i18n.t("remapFcAddOption") },
                        ...addablePool.map((addable) => ({
                          value: addable.option,
                          label: displayName(addable.option),
                        })),
                      ]}
                    />
                  {:else}
                    <button
                      class="btn add-btn"
                      onclick={() => (addMenuOpen = true)}
                    >
                      {$i18n.t("remapFcAddOption")}
                    </button>
                  {/if}
                </td>
              </tr>
            {/if}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}

  <!-- Only appears once there's something staged to send: the
       "Load Changes" button applies the diff between what was read
       and the current edits, plus any staged timer/DMA fix (plus a
       trailing "save" to persist it and reboot), and the panel next
       to it lets the user see exactly which commands that means, in
       the exact order they'll be sent, before committing to them. -->
  {#if hasStagedCommands}
    <div class="pending-changes-card">
      <Section label="remapFcChangesHeading">
        <div class="changes-bar">
          <div class="changes-row">
            <button
              class="btn apply-btn"
              onclick={handleLoadChanges}
              disabled={running}
            >
              {running
                ? $i18n.t("remapFcApplying")
                : $i18n.t("remapFcLoadChangesButton")}
            </button>

            <details class="commands-panel">
              <summary
                >{$i18n.t("remapFcPendingCommands", {
                  count: commandsToSend.length,
                })}
              </summary>
              <pre>{commandsToSend.join("\n")}</pre>
            </details>
          </div>

          <button
            class="btn clear-btn"
            onclick={handleClearChanges}
            disabled={running}
          >
            {$i18n.t("remapFcClearChangesButton")}
          </button>
        </div>
      </Section>
    </div>
  {/if}

  <!-- Automatic warning: appears only once the working state's
       current pin assignments have a timer/DMA clash that a full
       reallocation pass genuinely can't resolve on its own (a
       clash a fresh reallocation alone would fix stays silent
       here -- calculatedAllocationTable below already reflects it
       automatically, no button press needed for that either
       anymore). reconciled.clash.reasons explains *why* the
       current pins clash to begin with; calculatedAllocationTable
       in the always-visible panel below shows what a reallocation
       attempt produces regardless (including which feature(s) it
       still couldn't resolve), so there's no need to repeat that
       table here too -- and pinConflictResult.suggestions offers a
       pin-level fix instead -- swapping/moving one of those
       features onto a different pin so a fresh reallocation *can*
       resolve everything -- when one was found; see the
       suggestion-row below for what shows instead when it
       wasn't. -->
  {#if pinConflictResult.unresolvedFeatures.length}
    <Section>
      {#snippet header()}
        <div class="header">
          <span class="title warning-title"
            >{$i18n.t("remapFcAllocationInvalidHeading")}</span
          >
        </div>
      {/snippet}

      <p class="allocation-warning">
        {$i18n.t("remapFcAllocationInvalidWarning", {
          reasons: reconciled.clash.reasons.join("; "),
        })}
      </p>

      <!-- The pin-level fix itself, when the search actually found
           one: a single suggestion shows as plain text, more than
           one gets a picker so the user chooses which to apply --
           either way, "Accept Suggestion" adopts
           selectedSuggestion.apply wholesale (see
           handleAcceptSuggestion). When no single swap/move
           resolves everything, there's nothing to offer as a
           one-click fix -- rather than guessing at some other
           feature to touch on the user's behalf, this points back
           at whichever option they most recently placed
           (lastChangedOption), falling back to naming one of the
           unresolved features itself if nothing's been touched
           yet this session (e.g. the clash was already there on
           read). -->
      {#if pinConflictResult.suggestions.length}
        <div class="suggestion-row">
          {#if pinConflictResult.suggestions.length > 1}
            <Select
              bind:value={selectedSuggestionIndex}
              options={pinConflictResult.suggestions.map(
                (suggestion, index) => ({
                  value: String(index),
                  label: suggestionLabel(suggestion),
                }),
              )}
            />
          {:else if selectedSuggestion}
            <span>{suggestionLabel(selectedSuggestion)}</span>
          {/if}
          <button
            class="btn accept-suggestion-btn"
            onclick={handleAcceptSuggestion}
          >
            {$i18n.t("remapFcAcceptSuggestion")}
          </button>
        </div>
      {:else}
        <p class="allocation-warning suggestion-manual-fix">
          {$i18n.t("remapFcSuggestionManualFix", {
            feature: optionLabel(manualFixTarget),
          })}
        </p>
        <div class="suggestion-row">
          <button
            class="btn accept-suggestion-btn"
            onclick={handleResetToSetOption}
          >
            {$i18n.t("remapFcResetToSetOption")}
          </button>
        </div>
      {/if}
    </Section>
  {/if}

  <!-- calculatedAllocationTable is reconciled's own always-current
       result -- what a from-scratch allocation pass computes, or the
       working state's own current timer/DMA unchanged if nothing
       needed fixing. A genuine problem (unresolvedFeatures) always
       stays visible regardless of the toggle above (see
       .details-toggle); the card itself -- header included -- is
       implementation detail, so the whole thing hides behind "Show
       details" rather than just the table inside it. -->
  {#if calculatedAllocationTable.length}
    {#if unresolvedFeatures.length}
      <p class="allocation-warning">
        {$i18n.t("remapFcAllocationUnresolved", {
          features: unresolvedFeatures.join(", "),
        })}
      </p>
    {/if}

    {#if showCalculatedDetails}
      <div class="calculated-config-card">
        <Section label="remapFcAllocationCalculatedHeading">
          <table class="allocation-table">
            <thead>
              <tr>
                <th>{$i18n.t("remapFcAllocationFeature")}</th>
                <th>{$i18n.t("remapFcAllocationPin")}</th>
                <th>{$i18n.t("remapFcAllocationTimer")}</th>
                <th>{$i18n.t("remapFcAllocationDma")}</th>
              </tr>
            </thead>
            <tbody>
              {#each calculatedAllocationTable as row (row.feature)}
                <tr class:unresolved={row.unresolved}>
                  <td>{row.feature}</td>
                  <td>{row.pin}</td>
                  <td>
                    <div>{row.timerCommand}</div>
                    <div class="allocation-resolved">{row.timer}</div>
                  </td>
                  <td class:dma-unmanaged={!row.dmaManaged}>
                    <div>{row.dmaCommand}</div>
                    <div class="allocation-resolved">{row.dma}</div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </Section>
      </div>
    {/if}
  {/if}
</Page>

<style lang="scss">
  .note {
    color: var(--color-text);
    opacity: 0.8;
    margin-bottom: 4px;
  }

  .run-btn {
    @extend %button;
    align-self: flex-start;
  }

  // Custom Section headers (board-info card, live-warning card):
  // matches Section.svelte/Status.svelte's own header/title styling,
  // since supplying a header snippet bypasses Section's default one
  // entirely.
  .header {
    @extend %section-header;
    padding-right: 8px;
  }

  .title {
    padding-left: 8px;
    font-weight: 600;
  }

  .warning-title {
    color: var(--color-status-bad);
  }

  // Plain label/value rows, matching Status.svelte's own info-table
  // convention.
  .info-table {
    width: 100%;

    td {
      padding: 3px 0;
      font-size: 0.8rem;

      &:last-child {
        text-align: right;
        font-weight: 600;
      }
    }
  }

  // Sized to hug its own short content, matching Status.svelte's
  // compact info cards, rather than stretching the full page width.
  // margin-bottom separates it from .table-with-diagram right below --
  // a plain div with no top spacing of its own, so without this the
  // remap table's header row sits almost flush against this card.
  .board-info-card {
    max-width: 320px;
    margin-bottom: 24px;
  }

  // Wider than .board-info-card since the table has four columns, but
  // still capped rather than spanning the full page.
  .calculated-config-card,
  .pending-changes-card {
    max-width: 560px;
  }

  .details-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    width: fit-content;
    font-size: 0.85rem;
    color: var(--color-text);
    margin-bottom: 16px;
  }

  .allocation-warning {
    color: var(--color-status-bad);
  }

  // The suggestion picker (a single suggestion shows as plain text
  // instead -- see the template) plus "Accept Suggestion", at the
  // bottom of the pin-conflict warning panel.
  .suggestion-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    flex-wrap: wrap;
  }

  // Shown instead of .suggestion-row when the search found no
  // swap/move that resolves everything -- .allocation-warning already
  // gives it the same red, attention-grabbing colour as the reasons
  // text above it; this just adds the same top spacing .suggestion-row
  // has, so the two are visually interchangeable depending on which
  // one applies.
  .suggestion-manual-fix {
    margin: 10px 0 0;
  }

  .accept-suggestion-btn {
    @extend %button;
  }

  .allocation-table {
    width: 100%;
    border-collapse: collapse;

    th,
    td {
      padding: 4px 12px;
      text-align: left;
      border-bottom: 1px solid var(--color-border);
      vertical-align: top;
    }

    th {
      opacity: 0.8;
    }

    // Flags a row left untouched because nothing could be resolved
    // for it, rather than one that was actually (re)allocated.
    tr.unresolved td {
      color: var(--color-status-bad);
    }

    // Flags a DMA cell shown for reference only -- a servo/frequency
    // input's chosen timer happens to define a DMA option, but this
    // tool never claims or sends it, since firmware never actually
    // uses DMA for either regardless (see feature_classifier.js's
    // featureNeedsDma). Struck through and faded so it reads as inert
    // rather than something that will actually happen.
    td.dma-unmanaged {
      opacity: 0.5;
      text-decoration: line-through;
    }
  }

  .allocation-resolved {
    opacity: 0.7;
    font-size: 0.9em;
  }

  // "Load Changes" plus its command-preview panel, stacked above the
  // separate "Clear Changes" row.
  .changes-bar {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .changes-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .apply-btn,
  .clear-btn {
    @extend %button;
    align-self: flex-start;
  }

  .commands-panel {
    color: var(--color-text);

    summary {
      cursor: pointer;
      opacity: 0.8;
    }

    pre {
      margin: 6px 0 0;
      padding: 8px 12px;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      white-space: pre-wrap;
    }
  }

  // Header help button, matching every other tab's <Page> header.
  .grow {
    flex-grow: 1;
  }

  .help-btn {
    @extend %button;
    padding: 4px 8px;
    min-width: 60px;
  }

  // Lays the board diagram out beside the remap table on wide
  // viewports, and stacks them (diagram above table) once there's not
  // enough room for both side by side.
  .table-with-diagram {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0;
  }

  // Positions the board name overlay (see .board-diagram-label)
  // relative to the diagram underneath it. Deliberately no CSS sizing
  // here at all -- width/height come from the inline style set from
  // diagramSize (see the ResizeObserver effect in <script>), which
  // measures the table's own rendered height so the diagram grows
  // alongside it as rows are added, clamped there to a sensible
  // min/max. This app's own runtime doesn't support the CSS
  // aspect-ratio property (it silently resolves to a height of 0), so
  // this is the reliable alternative, not a stylistic choice.
  .board-diagram-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .board-diagram {
    display: block;
    width: 100%;
    height: 100%;
  }

  // The FC's own reported name, overlaid on the generic diagram's
  // shared label zone (see CASED_GENERIC.svg/GENERIC.svg's own file
  // comments for that zone's coordinates -- kept identical between
  // the two so switching which image sits underneath never moves the
  // text). Never shown over GENERIC.svg in practice, since there's no
  // name to show before the FC's been read, but the position is
  // shared regardless.
  .board-diagram-label {
    position: absolute;
    left: 26.6%;
    right: 26.6%;
    top: 26.25%;
    bottom: 63.75%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #f2f4f6;
    font-weight: 700;
    font-size: 13px;
    line-height: 1.3;
    overflow-wrap: break-word;
    pointer-events: none;
  }

  // Shown in place of the table while a read is still in flight --
  // matches Page.svelte's own loading spinner (same image asset), just
  // smaller and inline rather than filling the whole tab.
  .table-loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    color: var(--color-text);
    opacity: 0.8;
  }

  .table-loading .spinner {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    background-image: url("/images/loading-spin.svg");
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
  }

  // Comparison table: option name, default pin, arrow, current option.
  .remap-table {
    border-collapse: collapse;

    th,
    td {
      padding: 4px 12px;
      text-align: left;
      border-bottom: 1px solid var(--color-border);
    }

    th {
      color: var(--color-text);
      opacity: 0.8;
    }

    .arrow {
      padding-left: 4px;
      padding-right: 4px;
    }

    .arrow-cable {
      display: block;
      width: 38px;
      height: auto;
      opacity: 0.85;
    }

    .add-row td {
      border-bottom: none;
      padding-top: 8px;
    }

    .add-btn {
      @extend %button;
    }

    // The "Current Option" dropdown otherwise sizes itself to each
    // row's own current label (a native <select>'s default sizing),
    // so a short label like "SBUS" produces a narrower control than a
    // longer one like "Frequency 1" sitting right above/below it --
    // a fixed width keeps every row's dropdown the same size
    // regardless of its own current label. :global(), since Select.svelte
    // renders the actual <select> itself, not this file.
    tr:not(.add-row) td:last-child :global(select) {
      width: 160px;
    }
  }

  .error_message {
    color: var(--color-status-bad);
  }
</style>
