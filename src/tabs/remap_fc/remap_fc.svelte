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
  import Select from "@/components/Select.svelte";
  import {
    OPTION_KEYS,
    TABLE_OPTION_KEYS,
    buildChangeCommands,
    buildRowsForOptions,
    getAddableOptions,
    getRowSelectableOptions,
  } from "@/js/remap_fc/remap_table.js";
  import { reconcileTimersAndDma } from "@/js/remap_fc/timer_dma_reconciler.js";
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
  // Whether a read has completed at least once — once true, the toolbar
  // shows the connected board's identity instead of the "Read FC"
  // button, since there's no longer anything for that button to do.
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
  // so "Allocate Timers/DMA" never proposes stealing one of these.
  /** @type {Set<string>} */
  let reservedDmaStreams = $state(new Set());
  // Same idea for full timer+channel claims outside this tool's
  // control -- the gyro's clock/sync signal, etc.
  /** @type {Set<string>} */
  let reservedTimers = $state(new Set());
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

  // The name to actually show for an option key, anywhere one appears
  // -- a row's own identity, a "+ Add" choice, or a value picked in
  // some row's Current Option dropdown. Substitutes the reference
  // design's own name for the option's default pin (e.g. "ESC" for
  // "M1") when this board's reference design documents one, since
  // that's the label the user actually has printed on the board;
  // otherwise falls back to expandOptionName's spelled-out CLI name
  // (e.g. "Servo 1" for "S1") rather than the bare shorthand, so an
  // undocumented board still reads well. Always resolved via the
  // option's *own* default pin, regardless of where it's currently
  // sitting -- an option's identity, and so its reference label,
  // doesn't change just because it's been reassigned elsewhere.
  // Two labels optionLabel shows that would otherwise read misleadingly
  // for how this board's outputs are actually used in practice, even
  // though the FC's own reference design / CLI naming is unchanged:
  // "TAIL" (a reference design usage name) is wired to a servo output,
  // and "Motor 2" (expandOptionName's fallback for M2) is actually a
  // second ESC output. Only applied by optionLabel, never by
  // displayName itself -- the "FC Pin" column still needs to show the
  // board's own physical connector name ("TAIL") unchanged, since
  // that's what's actually printed on the board and can't change.
  const DISPLAY_LABEL_OVERRIDES = {
    TAIL: "Servo 4",
    "Motor 2": "ESC 2",
  };

  // The board's own name for an option's default pin (e.g. "ESC" for
  // "M1", "TAIL" for "S4") when this board's reference design
  // documents one, since that's the label the user actually has
  // printed on the board; otherwise falls back to expandOptionName's
  // spelled-out CLI name (e.g. "Servo 1" for "S1"). Used to identify a
  // row by its own fixed default pin -- never overridden, since that
  // identity is the board's own physical connector name.
  function displayName(option) {
    const pin = defaultHardware[option]?.pin;
    return (
      (pin !== undefined && referenceLabels[pin]) || expandOptionName(option)
    );
  }

  // The name to show for an option wherever it appears as a
  // *selectable* value -- a "+ Add" choice, or a value picked in some
  // row's Current Option dropdown. Same as displayName, but with
  // DISPLAY_LABEL_OVERRIDES applied on top, since an option picked
  // from a list reads better by its logical servo/ESC slot than by
  // whichever other connector's name its default pin happens to share.
  function optionLabel(option) {
    return DISPLAY_LABEL_OVERRIDES[displayName(option)] || displayName(option);
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

  // Everything "+ Add" should treat as unavailable: options claimed by
  // a resolved row, plus options already sitting in an unresolved
  // "unset" row — a freshly-added row doesn't occupy a pin yet, so it
  // wouldn't show up in claimedOptions on its own, but it already has
  // a row and shouldn't be offered a second time.
  let unavailableOptions = $derived([...claimedOptions, ...unsetOptions]);

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
  // Otherwise excludes options genuinely unavailable elsewhere —
  // claimed by a resolved row, or sitting in another row's unresolved
  // "unset" state (see unavailableOptions) — so one row's edit can't
  // steal an option another row is still mid-pick on, except the row's
  // own option, which must stay selectable so a row can be set back to
  // its own default pin.
  //
  // Deliberately uses unavailableOptions rather than visibleOptions: an
  // option can have its own row (visibleOptions) while having gone
  // "homeless" — e.g. M1's row still exists, but a different row's edit
  // moved M1 off its own default pin, so M1 itself is no longer any
  // row's Current Option — and a homeless option must stay pickable
  // elsewhere, exactly like it does in the "+ Add" pool (see
  // getAddableOptions), or there'd be no way to place it anywhere but
  // back onto its own original pin.
  /**
   * @param {import("@/js/remap_fc/remap_table.js").RemapRow} row
   */
  function optionsForRow(row) {
    const claimedIfPicked = row.currentOption
      ? claimedOptions.filter((option) => option !== row.currentOption)
      : claimedOptions;

    return [NONE_VALUE, ...getRowSelectableOptions(claimedIfPicked)].filter(
      (option) =>
        option !== row.currentOption &&
        (option === NONE_VALUE ||
          option === row.option ||
          !unavailableOptions.includes(option)),
    );
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

  // The `timer`/`dma pin` commands needed to clear up a timer or DMA
  // clash in the working state -- unlike pendingCommands, this isn't
  // recomputed live on every edit: it's a snapshot taken only when
  // "Allocate Timers/DMA" is pressed (see handleAllocateTimersDma),
  // since reallocation should be a deliberate, reviewable step rather
  // than something that silently recalculates (and so could silently
  // go stale) in the background as the table is edited.
  let timerDmaCommands = $state([]);

  // One row per feature describing its timer/DMA outcome from the
  // last "Allocate Timers/DMA" run -- what a from-scratch allocation
  // pass computes, or the working state's own current timer/DMA
  // unchanged if nothing needed fixing -- plus the names of any
  // features that couldn't be resolved at all. Populated alongside
  // timerDmaCommands by handleAllocateTimersDma, and cleared the same
  // way.
  let calculatedAllocationTable = $state([]);
  let unresolvedFeatures = $state([]);

  // Whether there's anything staged to actually send -- resource
  // changes, timer/DMA changes, or both. Drives the "Load Changes"
  // button/preview panel, which needs to appear even when the only
  // thing staged is a timer/DMA fix with no resource edits alongside it.
  let hasStagedCommands = $derived(
    hasPendingChanges || timerDmaCommands.length > 0,
  );

  // What "Load Changes" actually sends, and what the preview panel
  // shows -- the two must always match exactly, so this is the single
  // place "save" gets appended. `resource`/`timer`/`dma pin` commands
  // only change the in-memory config; `save` is what persists them and
  // reboots the flight controller so the new pin/timer/DMA assignments
  // actually take effect. Timer/DMA commands go out after every
  // `resource` command, since a pin's final timer options can depend
  // on which feature ends up on it.
  let commandsToSend = $derived([
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
   */
  export function setHardware(
    current,
    defaultHw,
    mcu,
    reservedDma = new Set(),
    reservedTmr = new Set(),
  ) {
    workingCurrent = { ...current };
    originalCurrent = { ...current };
    defaultHardware = { ...defaultHw };
    mcuType = mcu;
    reservedDmaStreams = reservedDma;
    reservedTimers = reservedTmr;
    hasRead = true;

    const occupantOf = (pin) =>
      Object.keys(current).find((key) => current[key].pin === pin);
    const namedConnectorPins = buildNamedConnectorPins(
      referenceDesigns,
      FC.CONFIG.boardDesign,
    );

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
   */
  export function markApplied() {
    originalCurrent = { ...workingCurrent };
    timerDmaCommands = [];
    calculatedAllocationTable = [];
    unresolvedFeatures = [];
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
    visibleOptions = [];
    unsetOptions = [];
    selectedAddOption = "";
    addMenuOpen = false;
    timerDmaCommands = [];
    calculatedAllocationTable = [];
    unresolvedFeatures = [];
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

  // handleAllocateTimersDma fires when "Allocate Timers/DMA" is
  // pressed: checks the working state's final feature/pin layout for a
  // timer or DMA clash and, only if one exists, reallocates everything
  // and stages the resulting `timer`/`dma pin` commands into the same
  // preview/"Load Changes" flow the resource commands use -- or clears
  // any previously staged ones back out if nothing needs fixing now.
  function handleAllocateTimersDma() {
    const result = reconcileTimersAndDma(
      workingCurrent,
      mcuType,
      mcuAllData,
      reservedDmaStreams,
      reservedTimers,
    );
    timerDmaCommands = result.commands;
    calculatedAllocationTable = result.calculatedTable;
    unresolvedFeatures = result.unresolved;
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
    }

    unsetOptions = unsetOptions.filter((option) => option !== row.option);
    workingCurrent = next;
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
  <div class="content">
    <p class="note">{$i18n.t("remapFcNote")}</p>

    <div class="toolbar">
      <!-- Before a read, offer the button that triggers one; once read,
           there's nothing left for it to do, so show the connected
           board's identity in its place instead. -->
      {#if hasRead}
        <div class="board-badge">
          <strong>{FC.CONFIG.manufacturerId}</strong>&nbsp;&nbsp;&nbsp;<strong
            >{FC.CONFIG.boardName}</strong
          >
        </div>
      {:else}
        <button class="btn run-btn" onclick={onClick} disabled={running}>
          {running ? $i18n.t("remapFcRunning") : $i18n.t("remapFcRunButton")}
        </button>
      {/if}

      <!-- The flight controller's MCU family, once known. -->
      {#if mcuType}
        <div class="mcu-badge">
          {$i18n.t("remapFcMcuLabel")}&nbsp;<strong>{mcuType}</strong>
        </div>
      {/if}

      <!-- The board's reference design (e.g. "F7A1"), once read. This
           comes from FC.CONFIG (populated via MSP at connect time, not
           parsed from the CLI dump), so it's already known before any
           read -- gated on hasRead so it only appears once the FC has
           actually been read here, matching mcuType/the board badge
           rather than jumping ahead of them. -->
      {#if hasRead && FC.CONFIG.boardDesign}
        <div class="mcu-badge">
          {$i18n.t("remapFcDesignLabel")}&nbsp;<strong
            >{FC.CONFIG.boardDesign}</strong
          >
        </div>
      {/if}

      <!-- Checks the working state for a timer/DMA clash and stages
           the fix (see handleAllocateTimersDma) -- deliberately its
           own button rather than something "Load Changes" does
           automatically, so reallocation is a step the user asks for
           and can review, not a silent side effect of applying a
           resource change. Available any time there's something read
           to check, independent of whether any resource edit is
           pending -- a clash can exist in what was actually read off
           the board, with no table edits involved at all. -->
      {#if hasRead}
        <button
          class="btn allocate-btn"
          onclick={handleAllocateTimersDma}
          disabled={running}
        >
          {$i18n.t("remapFcAllocateButton")}
        </button>
      {/if}
    </div>

    <!-- Only appears once there's something staged to send: the
         "Load Changes" button applies the diff between what was read
         and the current edits, plus any staged timer/DMA fix (plus a
         trailing "save" to persist it and reboot), and the panel next
         to it lets the user see exactly which commands that means, in
         the exact order they'll be sent, before committing to them. -->
    {#if hasStagedCommands}
      <div class="changes-bar">
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
    {/if}

    <!-- Error from the last CLI sequence, if any. -->
    {#if error}
      <div class="error_message">{error}</div>
    {/if}

    <!-- The current-vs-default pin remap table, in fixed option order,
         plus a trailing "+ Add" row for options not yet given a row.
         Keep the table (and with it, "+ Add") visible even once every
         row has been cleared to "None" — otherwise there'd be no way
         to bring any row back. -->
    {#if tableRows.length || hasRealAddableOptions}
      <table class="remap-table">
        <thead>
          <tr>
            <th>{$i18n.t("remapFcTableOption")}</th>
            <th>{$i18n.t("remapFcTableDefaultPin")}</th>
            <th></th>
            <th>{$i18n.t("remapFcTableCurrentOption")}</th>
          </tr>
        </thead>
        <tbody>
          {#each tableRows as row (row.option)}
            {@const unset = unsetOptions.includes(row.option)}
            <tr>
              <td>{displayName(row.option)}</td>
              <td>{row.defaultPin ?? "—"}</td>
              <td class="arrow">→</td>
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
                        ? [{ value: "", label: $i18n.t("remapFcSetOption") }]
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
              <td colspan="4">
                {#if addMenuOpen}
                  <Select
                    bind:value={selectedAddOption}
                    onchange={handleAddChange}
                    size={addMenuSize}
                    options={[
                      { value: "", label: $i18n.t("remapFcAddOption") },
                      ...addablePool.map((addable) => ({
                        value: addable.option,
                        label: optionLabel(addable.option),
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

    <!-- Appears once "Allocate Timers/DMA" has actually been run:
         calculatedAllocationTable -- what a from-scratch allocation
         pass computes, or the working state's own current timer/DMA
         unchanged if nothing needed fixing. Always visible once
         populated; no expand/collapse. -->
    {#if calculatedAllocationTable.length}
      {#if unresolvedFeatures.length}
        <p class="allocation-warning">
          {$i18n.t("remapFcAllocationUnresolved", {
            features: unresolvedFeatures.join(", "),
          })}
        </p>
      {/if}

      <div class="allocation-column">
        <h2>{$i18n.t("remapFcAllocationCalculatedHeading")}</h2>
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
                <td>
                  <div>{row.dmaCommand}</div>
                  <div class="allocation-resolved">{row.dma}</div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</Page>

<style lang="scss">
  .content {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }

  .note {
    color: var(--textColor);
    opacity: 0.8;
  }

  // Run button (or, once read, the board-identity badge) plus the MCU
  // badge, side by side.
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .run-btn {
    @extend %button;
    align-self: flex-start;
  }

  .mcu-badge,
  .board-badge {
    padding: 6px 12px;
    border: 1px solid var(--subtleAccent);
    border-radius: 4px;
    color: var(--textColor);
  }

  .allocate-btn {
    @extend %button;
    align-self: flex-start;
  }

  // "Allocate Timers/DMA" results: a warning for anything left
  // unresolved, then the working state's current timer/DMA and a
  // from-scratch calculation side by side for comparison. Bordered,
  // basic layout for now -- styling to be refined later.
  .allocation-warning {
    color: #d9534f;
  }

  .allocation-column {
    padding: 8px 12px;
    border: 1px solid var(--subtleAccent);
    border-radius: 4px;
    color: var(--textColor);
    overflow-x: auto;

    h2 {
      margin: 0 0 6px;
      font-size: 1em;
      opacity: 0.8;
    }
  }

  .allocation-table {
    border-collapse: collapse;

    th,
    td {
      padding: 4px 12px;
      text-align: left;
      border-bottom: 1px solid var(--subtleAccent);
      vertical-align: top;
    }

    th {
      opacity: 0.8;
    }

    // Flags a row left untouched because nothing could be resolved
    // for it, rather than one that was actually (re)allocated.
    tr.unresolved td {
      color: #d9534f;
    }
  }

  .allocation-resolved {
    opacity: 0.7;
    font-size: 0.9em;
  }

  // "Load Changes" button plus its command-preview panel.
  .changes-bar {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .apply-btn {
    @extend %button;
    align-self: flex-start;
  }

  .commands-panel {
    color: var(--textColor);

    summary {
      cursor: pointer;
      opacity: 0.8;
    }

    pre {
      margin: 6px 0 0;
      padding: 8px 12px;
      border: 1px solid var(--subtleAccent);
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

  // Comparison table: option name, default pin, arrow, current option.
  .remap-table {
    border-collapse: collapse;

    th,
    td {
      padding: 4px 12px;
      text-align: left;
      border-bottom: 1px solid var(--subtleAccent);
    }

    th {
      color: var(--textColor);
      opacity: 0.8;
    }

    .arrow {
      opacity: 0.6;
    }

    .add-row td {
      border-bottom: none;
      padding-top: 8px;
    }

    .add-btn {
      @extend %button;
    }
  }

  .error_message {
    color: #d9534f;
  }
</style>
