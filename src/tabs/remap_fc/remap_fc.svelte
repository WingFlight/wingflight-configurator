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
  import { isMcuSupported } from "@/js/remap_fc/timer_dma_lookup.js";
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

  // Starts as the bundled copy, then replaces itself with the latest
  // version fetched from GitHub (see reference_design_source.js), so
  // a newly documented board doesn't need a new release.
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
  // Whether a read has completed — flips the pre-read intro/button
  // over to the board info card and table.
  let hasRead = $state(false);
  // MCU family (e.g. "STM32F7X2"), matching MCU-all.json's top-level
  // keys.
  let mcuType = $state(null);
  // motor_pwm_protocol as read (e.g. "DSHOT600") -- reassigning a
  // pin's timer/DMA resets it to PWM, so it's restored via
  // commandsToSend. Set by remap_fc.js via setCurrentMotorProtocol().
  let currentMotorProtocol = $state(null);
  // Editable working copy of the current hardware map, staged only
  // until "Load Changes" is pressed.
  /** @type {import("@/js/remap_fc/hardware_parser.js").HardwareMap} */
  let workingCurrent = $state({});
  // Baseline as last read/applied -- workingCurrent is diffed against
  // this to find what actually changed.
  /** @type {import("@/js/remap_fc/hardware_parser.js").HardwareMap} */
  let originalCurrent = $state({});
  // Read-only reference for each option's default pin; never changes
  // after a read.
  /** @type {import("@/js/remap_fc/hardware_parser.js").HardwareMap} */
  let defaultHardware = $state({});
  // DMA streams claimed outside this tool's control (SPI, ADC, ...),
  // so reallocation never proposes stealing them.
  /** @type {Set<string>} */
  let reservedDmaStreams = $state(new Set());
  // Same idea for timer+channel claims (the gyro's clock/sync, ...).
  /** @type {Set<string>} */
  let reservedTimers = $state(new Set());
  // Option keys with a row in the table, seeded on read and grown via
  // "+ Add". Picking "None" removes the row again.
  /** @type {string[]} */
  let visibleOptions = $state([]);
  // Options whose row shows the "Set Option" placeholder instead of a
  // resolved value.
  /** @type {string[]} */
  let unsetOptions = $state([]);
  // Bound to the "+ Add" dropdown; reset to the placeholder after
  // each selection.
  let selectedAddOption = $state("");
  // Whether "+ Add" is showing its dropdown rather than the button
  // that reveals it.
  let addMenuOpen = $state(false);
  // Option most recently placed via a row's dropdown -- used by the
  // pin-conflict panel to point back at the user's last edit.
  let lastChangedOption = $state(null);
  // Whether the "Calculated config" card is expanded -- collapsed by
  // default, since most users never need it.
  let showCalculatedDetails = $state(false);

  // Whether MCU-all.json has real timer/DMA data for this board's
  // MCU -- false means pin remapping can't be safely calculated, so
  // the tool shows a warning instead of opening (see the template).
  let mcuSupported = $derived(isMcuSupported(mcuAllData, mcuType));

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

  // Diagram height, computed from the table's row count rather than
  // measured from the DOM (which would also catch the "+ Add"
  // dropdown temporarily inflating it), and clamped to a sensible
  // range. This app's runtime doesn't support CSS aspect-ratio, so
  // this is the reliable alternative.
  const DIAGRAM_BASE_SIZE = 24;
  const DIAGRAM_ROW_SIZE = 28;
  let diagramHeight = $derived(
    Math.min(
      480,
      Math.max(160, DIAGRAM_BASE_SIZE + tableRows.length * DIAGRAM_ROW_SIZE),
    ),
  );
  // Width derived from the diagram's own square shape (see the
  // inline <svg>'s viewBox below -- it's cropped to a square on the
  // board's right side, right edge aligned with the board's own
  // right edge, deliberately excluding the USB-C connector's whole
  // left-side territory so no manufacturer's connector position or
  // orientation ever needs to be accounted for here), so the artwork
  // fills the wrapper edge to edge as it grows.
  const DIAGRAM_ASPECT_RATIO = 1;
  let diagramWidth = $derived(diagramHeight * DIAGRAM_ASPECT_RATIO);

  // The board's own printed brand name -- distinct from
  // manufacturers.js's own `name` (the parent RC-radio manufacturer,
  // e.g. "FrSky"), this is what's actually silkscreened on the board
  // itself (e.g. "Vantac"). Falls back to FC.CONFIG's own reported
  // manufacturerId when a board has no dedicated diagram.
  const MANUFACTURER_BOARD_NAMES = {
    RDMS: "RadioMaster",
    FRSK: "Vantac",
    GSKY: "Goosky",
    FDRC: "FlyDragon",
    FWRF: "FlyWing",
    MTKS: "Matek",
  };
  let boardBrandName = $derived(
    MANUFACTURER_BOARD_NAMES[FC.CONFIG.manufacturerId] ??
      FC.CONFIG.manufacturerId,
  );

  // The board's own printed branding artwork -- one <MANUFACTURER>_
  // BRAND.svg file per manufacturer (see src/images/remap_fc/), each
  // laid over the diagram at a fixed width (see BRAND_IMAGE_WIDTH)
  // with its own aspect ratio setting the height, so every image can
  // have a different natural shape without needing per-manufacturer
  // layout code. A manufacturer with no entry here just shows the
  // plain generic body.
  const MANUFACTURER_BRAND_IMAGES = {
    RDMS: { file: "RADIOMASTER_BRAND.svg", aspect: 282 / 75 },
    FRSK: { file: "VANTAC_BRAND.svg", aspect: 1377 / 596 },
    GSKY: { file: "GOOSKY_BRAND.svg", aspect: 1427 / 135 },
    FDRC: { file: "FLYDRAGON_BRAND.svg", aspect: 500 / 360 },
    FWRF: { file: "FLYWING_BRAND.svg", aspect: 613 / 171 },
    MTKS: { file: "MATEKSYS_BRAND.svg", aspect: 300 / 70 },
  };
  const BRAND_IMAGE_X = 590;
  const BRAND_IMAGE_Y = 109; // 55 + 10% of the board's own 540-tall height
  const BRAND_IMAGE_WIDTH = 400;
  let boardBrandImage = $derived(
    MANUFACTURER_BRAND_IMAGES[FC.CONFIG.manufacturerId],
  );

  // The board's own model text, shown under the brand image -- e.g.
  // "VANTAC_RF007" becomes just "RF007" (the brand image already
  // shows "VANTAC"), stripping the leading "<brand>_" case
  // insensitively. A board name that doesn't start with the brand
  // (e.g. "NEXUS_XR") is shown exactly as reported, unstripped.
  let boardModelName = $derived.by(() => {
    const raw = FC.CONFIG.boardName ?? "";
    const prefix = `${boardBrandName}_`;
    return raw.slice(0, prefix.length).toUpperCase() === prefix.toUpperCase()
      ? raw.slice(prefix.length)
      : raw;
  });

  // The model text is drawn at a fixed base font size, then scaled
  // (via boardModelTextScale, applied as a <g> transform around it)
  // so its rendered width always matches MODEL_TEXT_TARGET_WIDTH --
  // short names like "RF007" get scaled up, long ones scaled down,
  // rather than every name just rendering at whatever width its own
  // character count happens to produce. SVG has no CSS-style
  // auto-fit for text, so this measures the actual rendered width via
  // getComputedTextLength() and recomputes the scale whenever the
  // name changes.
  const MODEL_TEXT_TARGET_WIDTH = BRAND_IMAGE_WIDTH;
  let modelTextEl = $state(null);
  let boardModelTextScale = $state(1);
  $effect(() => {
    boardModelName; // re-measure whenever the displayed name changes
    if (modelTextEl) {
      const width = modelTextEl.getComputedTextLength();
      boardModelTextScale = width > 0 ? MODEL_TEXT_TARGET_WIDTH / width : 1;
    }
  });

  // A board reporting no reference design at all, or the generic
  // "BTFL" placeholder Rotorflight uses for an unrecognised
  // Betaflight target, isn't a real cased board -- it's shown as a
  // bare, uncased PCB (see GENERIC.svg) instead of the cased shape
  // below, matching the same condition remap_fc.js already uses to
  // decide whether to fetch richer Betaflight-target defaults.
  let isGenericBoard = $derived(
    !FC.CONFIG.boardDesign || FC.CONFIG.boardDesign === "BTFL",
  );

  // Body/bezel colours for the board diagram -- grey is the generic
  // fallback; manufacturers with a real reference diagram get their
  // own real case colours instead.
  const MANUFACTURER_BOARD_COLORS = {
    RDMS: { bezel: "#c9d0d6", body: "#2f6f96" },
    FDRC: { bezel: "#c9d0d6", body: "#a13d3d" },
    GSKY: { bezel: "#c9d0d6", body: "#6f4a91" },
    FRSK: { bezel: "#2b2d31", body: "#101113" },
  };
  let boardBezelColor = $derived(
    MANUFACTURER_BOARD_COLORS[FC.CONFIG.manufacturerId]?.bezel ?? "#9ba3ac",
  );
  let boardBodyColor = $derived(
    MANUFACTURER_BOARD_COLORS[FC.CONFIG.manufacturerId]?.body ?? "#4b5561",
  );

  // Pin -> board's own silkscreen name (e.g. "ESC", "TAIL") from the
  // matching reference design; empty for an undocumented board.
  let referenceLabels = $derived(
    buildReferenceLabels(referenceDesigns, FC.CONFIG.boardDesign),
  );

  // Pins wired to fixed onboard sensors (baro, gyro, ...) -- excluded
  // from "+ Add" so they can't be reassigned.
  let reservedPins = $derived(
    buildReservedPins(referenceDesigns, FC.CONFIG.boardDesign),
  );

  // Pins the reference design names as a specific connector (AUX,
  // SBUS, TLM, RPM, ...) rather than a generic port.
  let namedConnectorPins = $derived(
    buildNamedConnectorPins(referenceDesigns, FC.CONFIG.boardDesign),
  );

  // Option keys behind those named connectors (e.g. "RX2" for "TLM"),
  // fed into getRowSelectableOptions so they stay pickable by name.
  // Excludes TABLE_OPTION_KEYS to avoid offering a key twice (e.g.
  // "TAIL" can be S4's own default pin).
  let namedConnectorOptionKeys = $derived(
    Object.keys(defaultHardware).filter(
      (option) =>
        !TABLE_OPTION_KEYS.includes(option) &&
        namedConnectorPins.has(defaultHardware[option]?.pin),
    ),
  );

  // Labels that read misleadingly as displayName's plain fallback
  // (e.g. "Motor 2" is really a second ESC output) -- applied by
  // optionLabel only once a reference design actually matched, so an
  // undocumented board never gets these guessed at.
  const DISPLAY_LABEL_OVERRIDES = {
    TAIL: "Servo 4",
    "Motor 2": "ESC 2",
  };

  // Board's own name for a port (e.g. "ESC", "TAIL") from its
  // reference design, falling back to expandOptionName's spelled-out
  // CLI name. For the physical port itself -- never overridden, since
  // that identity can't change (see optionLabel for the function
  // being picked instead).
  function displayName(option) {
    const pin = defaultHardware[option]?.pin;
    return (
      (pin !== undefined && referenceLabels[pin]) || expandOptionName(option)
    );
  }

  // Label for a value being picked as some port's Current Option --
  // displayName with DISPLAY_LABEL_OVERRIDES applied, only once a
  // reference design matched (referenceLabels is {} otherwise).
  function optionLabel(option) {
    const name = displayName(option);
    const hasReferenceDesign = Object.keys(referenceLabels).length > 0;
    return hasReferenceDesign ? (DISPLAY_LABEL_OVERRIDES[name] ?? name) : name;
  }

  // Human-readable label for a pin-conflict suggestion, using this
  // board's own reference-design labels (pin_conflict_suggestions.js
  // only knows raw CLI keys like "M1").
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

  // Options claimed by some row's Current Option right now. Also
  // unions in any TABLE_OPTION_KEYS member present directly in
  // workingCurrent, since a row's own join can't discover an occupant
  // whose own default hardware sets no pin (e.g. an LED strip some
  // boards don't wire by default) -- without this it would wrongly
  // show back up as free.
  let claimedOptions = $derived([
    ...new Set([
      ...tableRows
        .map((row) => row.currentOption)
        .filter((option) => option !== null),
      ...TABLE_OPTION_KEYS.filter((option) => option in workingCurrent),
    ]),
  ]);

  // Everything still addable via "+ Add" -- every default option not
  // already shown a row, minus reservedPins.
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

  // Pool for a row's own Current Option dropdown. Excludes the row's
  // own current pick from claimedOptions first, so a candidate that's
  // only eligible because of it isn't offered (M3 needs M2 configured
  // -- offering M3 while M2 is what this row holds would let picking
  // it break that invariant). Otherwise excludes only options
  // genuinely claimed elsewhere (not merely "unset" in another row),
  // and includes namedConnectorOptionKeys so named connectors (AUX,
  // SBUS, TLM, ...) stay pickable by name.
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

  // `resource` commands needed to reach workingCurrent from
  // originalCurrent, recomputed on every edit.
  let pendingCommands = $derived(
    buildChangeCommands(originalCurrent, workingCurrent),
  );
  let hasPendingChanges = $derived(pendingCommands.length > 0);

  // Always-current timer/DMA reallocation pass over the working
  // state, recomputed on every edit rather than needing a separate
  // "Allocate" step (see markApplied for how re-sending is avoided).
  // Empty/no-clash before the FC's been read.
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

  // Candidate pin swaps/moves that would let reallocation resolve
  // everything, plus which features are still genuinely unresolved
  // (see pin_conflict_suggestions.js for the search). suggestions can
  // still be empty with unresolvedFeatures non-empty, when no single
  // swap/move fixes it.
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

  // Bound to the suggestion picker as a string (native <select> values
  // are always strings); clamped in case the list shrinks.
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

  // Every managed motor output is assumed to run plain DMA-driven
  // DSHOT (see feature_classifier.js's featureNeedsDma), so these are
  // forced alongside every staged change.
  const DSHOT_SETTING_COMMANDS = [
    "set dshot_burst = OFF",
    "set dshot_bitbang = OFF",
  ];

  // Restores motor_pwm_protocol after timer/DMA commands reset it to
  // PWM; empty if nothing changed or the read couldn't determine it.
  let currentMotorProtocolCommand = $derived(
    currentMotorProtocol && timerDmaCommands.length > 0
      ? [`set motor_pwm_protocol = ${currentMotorProtocol}`]
      : [],
  );

  // What "Load Changes" sends and the preview panel shows -- the
  // single place "save" gets appended.
  let commandsToSend = $derived([
    ...DSHOT_SETTING_COMMANDS,
    ...pendingCommands,
    ...timerDmaCommands,
    ...currentMotorProtocolCommand,
    "save",
  ]);

  // --- Functions below are called from remap_fc.js on the mounted
  // instance (e.g. `component.setRunning(true)`), the same way
  // Failsafe.svelte exposes onSave/onRevert/isDirty. ---

  export function setRunning(value) {
    running = value;
  }

  export function setCurrentMotorProtocol(value) {
    currentMotorProtocol = value;
  }

  export function setError(message) {
    error = message;
  }

  /**
   * Seeds the editable working copy from a fresh CLI read. A row shows
   * for a TABLE_OPTION_KEYS identity whenever its default pin is
   * occupied; a UART/I2C identity only gets an automatic row when
   * reassigned onto, or named as a connector by, the reference design.
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

    // No special-casing for a beyond-capacity key (e.g. "M5") -- it
    // behaves like any other option, shown when occupied and offered
    // via "+ Add" otherwise; TABLE_OPTION_KEYS already keeps it from
    // ever being picked as a value.
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
   * Adopts the working copy as the new baseline once staged commands
   * are actually sent (see remap_fc.js's #doApplySequence), and writes
   * back reconciled's resolved timer/dma for every feature it
   * resolved, so the next reactive pass doesn't propose resending the
   * same commands.
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
    currentMotorProtocol = null;
    workingCurrent = {};
    originalCurrent = {};
    defaultHardware = {};
    reservedDmaStreams = new Set();
    reservedTimers = new Set();
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
    );
  }

  // Fires when a row's Current Option changes: frees whoever occupied
  // that pin, then assigns the pick (or removes the row on "None").
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

  // Adopts the selected suggestion's precomputed pin layout wholesale,
  // clearing any stale "unset" state its feature(s) carried.
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

  // handleResetToSetOption fires from the pin-conflict panel's
  // manual-fix button (shown when no suggestion resolves the clash):
  // clears the target's pin and marks its row unset -- not "None",
  // which would blacklist a row-less feature from claimedOptions
  // permanently. Explicit button rather than an automatic revert, so
  // the clash stays visible until confirmed.
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
  <!-- Before a read, offer the button that triggers one, plus a short
       explanation of what the tab actually does -- everything else
       below only has anything to show once the FC's actually been
       read, so there'd otherwise be nothing on screen to explain the
       tab to someone opening it for the first time. -->
  {#if !hasRead}
    <div class="intro-card">
      <Section label="remapFcIntroHeading">
        <div class="intro-content">
          <p>{$i18n.t("remapFcIntroDescription")}</p>
          <img
            class="intro-illustration"
            src="/images/remap_fc/REMAP_ILLUSTRATION.svg"
            alt=""
          />
        </div>
        <button class="btn run-btn" onclick={onClick} disabled={running}>
          {running ? $i18n.t("remapFcRunning") : $i18n.t("remapFcRunButton")}
        </button>
      </Section>
    </div>
  {/if}

  <!-- Error from the last CLI sequence, if any. -->
  {#if error}
    <div class="error_message">{error}</div>
  {/if}

  {#if hasRead}
    {#if mcuSupported}
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
        <!-- Two fallback diagrams: a bare, uncased PCB (GENERIC.svg)
           for a board reporting no real reference design at all (see
           isGenericBoard), or a cased case shape for every other
           board -- not board-specific artwork, building/fetching a
           dedicated diagram per manufacturer doesn't scale. Outer/
           inner body shape matches flydragon.svg's own outline (a
           plain rounded rect, rx 20/14), in grey as the fallback
           colour a board with no dedicated diagram of its own gets
           (see boardBezelColor/boardBodyColor for manufacturers with
           their own real case colours). The FC's own reported name
           sits above the diagram, not overlaid on it. -->
        <div class="board-diagram-column">
          <div class="board-diagram-caption">
            {boardBrandName}
            {FC.CONFIG.boardName}
          </div>
          <div
            class="board-diagram-wrap"
            style="width: {diagramWidth}px; height: {diagramHeight}px;"
          >
            <svg
              class="board-diagram"
              viewBox="530 10 540 540"
              xmlns="http://www.w3.org/2000/svg"
            >
              {#if isGenericBoard}
                <image
                  href="/images/remap_fc/GENERIC.svg"
                  x="530"
                  y="10"
                  width="540"
                  height="540"
                  preserveAspectRatio="xMidYMid meet"
                />
              {:else}
                <rect
                  x="30"
                  y="10"
                  width="1040"
                  height="540"
                  rx="20"
                  fill={boardBezelColor}
                />
                <rect
                  x="56"
                  y="36"
                  width="988"
                  height="488"
                  rx="14"
                  fill={boardBodyColor}
                />
                <!-- Manufacturer branding: a single <MANUFACTURER>_BRAND.svg
                 image (see boardBrandImage/MANUFACTURER_BRAND_IMAGES)
                 laid over the board for whichever manufacturer is
                 connected, scaled to one fixed width with height
                 following that image's own aspect ratio. A new
                 manufacturer only ever needs its own image file dropped
                 in plus one line added to MANUFACTURER_BRAND_IMAGES. -->
                {#if boardBrandImage}
                  <image
                    href="/images/remap_fc/{boardBrandImage.file}"
                    x={BRAND_IMAGE_X}
                    y={BRAND_IMAGE_Y}
                    width={BRAND_IMAGE_WIDTH}
                    height={BRAND_IMAGE_WIDTH / boardBrandImage.aspect}
                    preserveAspectRatio="xMinYMin meet"
                  />
                  <g
                    transform="translate({BRAND_IMAGE_X} 440) scale({boardModelTextScale})"
                  >
                    <text
                      bind:this={modelTextEl}
                      x="0"
                      y="0"
                      font-family="Arial, sans-serif"
                      font-weight="900"
                      font-size="70"
                      letter-spacing="1"
                      fill="#ffffff">{boardModelName}</text
                    >
                  </g>
                {/if}
              {/if}
            </svg>
          </div>
        </div>

        <!-- A re-read clears the table for several seconds while the
           CLI sequence runs -- key off running rather than the row
           counts, so a board with genuinely no rows still renders
           nothing here. -->
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
    {:else}
      <div class="mcu-unsupported-card">
        <Section>
          {#snippet header()}
            <div class="header">
              <span class="title warning-title"
                >{$i18n.t("remapFcMcuUnsupportedHeading")}</span
              >
            </div>
          {/snippet}
          <p class="allocation-warning">
            {mcuType
              ? $i18n.t("remapFcMcuUnsupportedMessage", { mcu: mcuType })
              : $i18n.t("remapFcMcuUnknownMessage")}
          </p>
        </Section>
      </div>
    {/if}
  {/if}

  <!-- Shown once the current pin assignment has a timer/DMA clash
       reallocation alone can't resolve -- above Pending Changes,
       since "Load Changes" is blocked while this is up. -->
  {#if mcuSupported && pinConflictResult.unresolvedFeatures.length}
    <div class="pin-conflict-card">
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

        <!-- Accept Suggestion adopts selectedSuggestion.apply wholesale
             (see handleAcceptSuggestion). No suggestion found means
             the manual-fix message/button shows instead. -->
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
    </div>
  {/if}

  <!-- "Load Changes" sends the staged diff (resource + timer/DMA +
       save); the panel next to it previews the exact commands. -->
  {#if hasStagedCommands}
    <div class="pending-changes-card">
      <Section label="remapFcChangesHeading">
        <div class="changes-bar">
          <div class="changes-row">
            <button
              class="btn apply-btn"
              onclick={handleLoadChanges}
              disabled={running ||
                pinConflictResult.unresolvedFeatures.length > 0}
              title={pinConflictResult.unresolvedFeatures.length > 0
                ? $i18n.t("remapFcLoadChangesBlocked")
                : ""}
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

  <!-- A genuine problem (unresolvedFeatures) always stays visible
       regardless of "Show details" -- only the table itself hides
       behind the toggle. -->
  {#if mcuSupported && calculatedAllocationTable.length}
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
                    {#if row.timerOptions.length}
                      <ul class="timer-options">
                        {#each row.timerOptions as option (option.af)}
                          <li class:chosen={option.chosen}>{option.label}</li>
                        {/each}
                      </ul>
                    {:else}
                      -
                    {/if}
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
  .run-btn {
    @extend %button;
    align-self: flex-start;
    margin: 16px 16px 24px 16px;
    padding: 0 24px;
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

  // Hugs its own short content, matching Status.svelte's compact
  // info cards; margin-bottom separates it from the table below.
  .board-info-card {
    max-width: 320px;
    margin-bottom: 24px;
  }

  // Wider than .board-info-card since the table has four columns, but
  // still capped rather than spanning the full page.
  .calculated-config-card,
  .pending-changes-card,
  .pin-conflict-card,
  .mcu-unsupported-card {
    max-width: 560px;
  }

  .intro-card {
    max-width: 700px;
  }

  .intro-content {
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
    padding-left: 16px; // lines up with .run-btn's own left margin below

    p {
      flex: 1 1 280px;
      margin: 0;
      color: var(--color-text);
      opacity: 0.85;
      line-height: 1.5;
    }
  }

  .intro-illustration {
    flex: 0 0 auto;
    width: 340px;
    height: auto;
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

  // Shown instead of .suggestion-row when no swap/move resolves the
  // clash -- same top spacing, so the two are interchangeable.
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

    // A DMA cell shown for reference only (servo/freq inputs never
    // actually use DMA -- see featureNeedsDma); struck through so it
    // reads as inert.
    td.dma-unmanaged {
      opacity: 0.5;
      text-decoration: line-through;
    }
  }

  .allocation-resolved {
    opacity: 0.7;
    font-size: 0.9em;
  }

  // Every timer option this pin actually supports, not just the one
  // in use -- the chosen one stands out at full weight/opacity, the
  // rest are dimmed rather than removed entirely, so it's still
  // obvious what else was available.
  .timer-options {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      font-size: 0.85em;
      white-space: nowrap;
      opacity: 0.45;
    }

    li.chosen {
      font-weight: 600;
      opacity: 1;
    }
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

  .board-diagram-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    margin-left: 24px;
  }

  .board-diagram-caption {
    font-weight: 700;
    font-size: 13px;
    color: var(--color-text);
    text-align: center;
  }

  // No CSS sizing here -- width/height come from diagramWidth/
  // diagramHeight (see <script>), since this app's runtime doesn't
  // support CSS aspect-ratio.
  .board-diagram-wrap {
    position: relative;
  }

  .board-diagram {
    display: block;
    width: 100%;
    height: 100%;
  }

  // Shown in place of the table while a read is in flight -- matches
  // Page.svelte's own loading spinner, smaller and inline.
  .table-loading {
    display: flex;
    align-items: center;
    gap: 10px;
    align-self: stretch;
    // Lines up with .remap-table's own th/td padding.
    padding-left: 12px;
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
      width: 57px;
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

    // Fixed width keeps every row's dropdown the same size regardless
    // of its own label length. :global(), since Select.svelte renders
    // the actual <select> itself.
    tr:not(.add-row) td:last-child :global(select) {
      width: 104px;
    }
  }

  .error_message {
    color: var(--color-status-bad);
  }
</style>
