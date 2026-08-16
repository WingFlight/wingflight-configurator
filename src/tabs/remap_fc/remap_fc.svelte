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
  import Page from "@/components/Page.svelte";
  import Select from "@/components/Select.svelte";
  import {
    OPTION_KEYS,
    TABLE_OPTION_KEYS,
    buildRowsForOptions,
    getAddableOptions,
    getRowSelectableOptions,
  } from "@/js/remap_fc/remap_table.js";

  // Sentinel dropdown value meaning "nothing assigned to this pin" —
  // distinct from the empty placeholder value used by the "+ Add" row.
  const NONE_VALUE = "__none__";

  /**
   * @typedef {Object} Props
   * @property {() => void} onRunClick - Called when the run button is pressed.
   * @property {(option: string) => void} onAddOption - Called when an option is picked from the "+ Add" dropdown.
   */
  /** @type {Props} */
  const { onRunClick, onAddOption } = $props();

  // --- Local UI state, all driven by remap_fc.js via the exported
  // setters below (this component never fetches anything itself). ---
  let running = $state(false);
  let error = $state(null);
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
  // defaultHardware is the read-only reference for each option's
  // default pin; it never changes after a "Read FC" run.
  /** @type {import("@/js/remap_fc/hardware_parser.js").HardwareMap} */
  let defaultHardware = $state({});
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

  // The option keys currently claimed as some row's Current Option —
  // including a row showing itself, unchanged. Anything in this set is
  // spoken for and shouldn't be offered anywhere else.
  let claimedOptions = $derived(
    tableRows
      .map((row) => row.currentOption)
      .filter((option) => option !== null),
  );

  // Everything "+ Add" should treat as unavailable: options claimed by
  // a resolved row, plus options already sitting in an unresolved
  // "unset" row — a freshly-added row doesn't occupy a pin yet, so it
  // wouldn't show up in claimedOptions on its own, but it already has
  // a row and shouldn't be offered a second time.
  let unavailableOptions = $derived([...claimedOptions, ...unsetOptions]);

  // Options that count as "configured" for the M/S/Freq filling-order
  // rule: claimed (occupying a pin), or simply having a row of its own
  // at all — even an unresolved "Set Option" one. Without the latter,
  // e.g. removing S2-S4 and leaving S1 as an unresolved row would make
  // S2 ineligible again, since S1 wouldn't be "claimed" yet.
  let configuredOptions = $derived([
    ...new Set([...claimedOptions, ...visibleOptions]),
  ]);

  // The full pool for the "+ Add" row: a "None" choice, plus every
  // default-structure option that isn't already spoken for — including
  // ones that are currently assigned but never get an automatic row
  // (UART/I2C resources), which still show up here so they can be
  // brought into view (handleAddChange guards against re-adding an
  // option that already has a row, so this can't create a duplicate
  // when picked).
  let addablePool = $derived([
    { option: NONE_VALUE, defaultPin: null },
    ...getAddableOptions(
      defaultHardware,
      unavailableOptions,
      configuredOptions,
      visibleOptions,
    ),
  ]);

  // Whether there's anything real left to add (i.e. more than just
  // the "None" sentinel) — used to hide the "+ Add" row once nothing
  // remains.
  let hasRealAddableOptions = $derived(
    addablePool.some((addable) => addable.option !== NONE_VALUE),
  );

  // How many rows the "+ Add" listbox shows at once while open: every
  // choice plus the placeholder, capped so it can't grow unreasonably
  // tall when there's a lot to pick from.
  let addMenuSize = $derived(Math.min(addablePool.length + 1, 10));

  // The base pool for per-row "Current Option" dropdowns. This is
  // deliberately separate from addablePool: "+ Add" only offers what
  // this specific board's default structure reports, but a row's
  // Current Option comes from the FC's fixed set of options regardless
  // of defaultHardware, only excluding what's genuinely claimed (a row
  // must always be able to pick its own option, even while its own row
  // is still "unset", so this uses claimedOptions rather than
  // unavailableOptions).
  let rowSelectablePool = $derived([
    NONE_VALUE,
    ...getRowSelectableOptions(claimedOptions),
  ]);

  // The pool offered by a given row's own "Current Option" dropdown:
  // excludes options that already have their own row elsewhere in the
  // table, so one row's edit can't "steal" another row's identity —
  // except the row's own option, which must stay selectable so a row
  // can be set back to its own default pin.
  /**
   * @param {import("@/js/remap_fc/remap_table.js").RemapRow} row
   */
  function optionsForRow(row) {
    return rowSelectablePool.filter(
      (option) =>
        option === NONE_VALUE ||
        option === row.option ||
        !visibleOptions.includes(option),
    );
  }

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
   * read: the visible rows start as whatever's currently assigned,
   * restricted to TABLE_OPTION_KEYS so UART/I2C resources don't show
   * up automatically just because they're wired — those are only
   * ever added explicitly via "+ Add".
   * @param {import("@/js/remap_fc/hardware_parser.js").HardwareMap} current
   * @param {import("@/js/remap_fc/hardware_parser.js").HardwareMap} defaultHw
   * @param {?string} mcu
   */
  export function setHardware(current, defaultHw, mcu) {
    workingCurrent = { ...current };
    defaultHardware = { ...defaultHw };
    mcuType = mcu;
    visibleOptions = TABLE_OPTION_KEYS.filter((option) => option in current);
    // Rows freshly read from the FC are never "unset" — only ones
    // added afterwards via "+ Add" start in that placeholder state.
    unsetOptions = [];
  }

  export function reset() {
    error = null;
    mcuType = null;
    workingCurrent = {};
    defaultHardware = {};
    visibleOptions = [];
    unsetOptions = [];
    selectedAddOption = "";
    addMenuOpen = false;
  }

  // onClick handles the "Read FC" button: clear any previous run's
  // state before asking the tab controller to start a new one.
  function onClick() {
    reset();
    onRunClick();
  }

  // handleAddChange fires when an option is picked from the "+ Add"
  // dropdown: give it a row (if it doesn't already have one), mark it
  // "unset" so it shows the "Set Option" placeholder until the user
  // makes an explicit choice, then close the dropdown back down to
  // just the "+ Add" button. "None" is shown here too (so it always
  // looks the same as every other dropdown), but there's nothing to
  // add for it, so it's ignored — the dropdown still closes either way.
  /**
   * @param {Event} e
   */
  function handleAddChange(e) {
    const option = e.target.value;
    selectedAddOption = "";
    addMenuOpen = false;
    if (!option || option === NONE_VALUE) return;

    if (!visibleOptions.includes(option)) {
      visibleOptions = [...visibleOptions, option];
      unsetOptions = [...unsetOptions, option];
    }
    onAddOption?.(option);
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
{/snippet}

<Page {header} loading={false}>
  <div class="content">
    <p class="note">{$i18n.t("remapFcNote")}</p>

    <div class="toolbar">
      <button class="btn run-btn" onclick={onClick} disabled={running}>
        {running ? $i18n.t("remapFcRunning") : $i18n.t("remapFcRunButton")}
      </button>

      <!-- The flight controller's MCU family, once known. -->
      {#if mcuType}
        <div class="mcu-badge">
          {$i18n.t("remapFcMcuLabel")}&nbsp;<strong>{mcuType}</strong>
        </div>
      {/if}
    </div>

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
              <td>{row.option}</td>
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
                                label: row.currentOption,
                              },
                            ]
                          : []),
                      ...optionsForRow(row).map((option) => ({
                        value: option,
                        label:
                          option === NONE_VALUE
                            ? $i18n.t("remapFcNoneOption")
                            : option,
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
                        label:
                          addable.option === NONE_VALUE
                            ? $i18n.t("remapFcNoneOption")
                            : addable.option,
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

  // Run button plus the MCU badge, side by side.
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .run-btn {
    @extend %button;
    align-self: flex-start;
  }

  .mcu-badge {
    padding: 6px 12px;
    border: 1px solid var(--subtleAccent);
    border-radius: 4px;
    color: var(--textColor);
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
