<script>
  import { onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { getTabHelpURL } from "@/js/help";
  import { MixerCurve } from "@/js/MixerCurve.js";
  import { GainCurve } from "@/js/GainCurve.js";

  import Page from "@/components/Page.svelte";
  import Section from "@/components/Section.svelte";
  import Select from "@/components/Select.svelte";

  import CurvePlot from "./CurvePlot.svelte";

  // One entry per curve pool this tab can edit. Each category owns its own
  // model (point/range semantics) and its FC-backed storage array - the
  // rendering/interaction code is otherwise category-agnostic.
  const CATEGORIES = {
    mixer: {
      model: MixerCurve,
      titleKey: "curvesTitle",
      helpKey: "curveCategoryHelpMixer",
      explainKey: "curveExplainMixer",
      tabKey: "curveCategoryMixer",
      xMin: MixerCurve.CURVE_MIN,
      xMax: MixerCurve.CURVE_MAX,
      yMin: MixerCurve.CURVE_MIN,
      yMax: MixerCurve.CURVE_MAX,
      xAxisValue: 0,
      yAxisValue: 0,
    },
    gain: {
      model: GainCurve,
      titleKey: "curvesTitleGain",
      helpKey: "curveCategoryHelpGain",
      explainKey: "curveExplainGain",
      tabKey: "curveCategoryGain",
      xMin: GainCurve.X_MIN,
      xMax: GainCurve.X_MAX,
      yMin: GainCurve.Y_MIN,
      yMax: GainCurve.Y_MAX,
      xAxisValue: 0,
      yAxisValue: GainCurve.NEUTRAL,
    },
  };

  function getArray(key) {
    return key === "mixer" ? FC.MIXER_CURVES : FC.GAIN_CURVES;
  }

  function sendAll(key, callback) {
    if (key === "mixer") mspHelper.sendMixerCurves(callback);
    else mspHelper.sendGainCurves(callback);
  }

  let loading = $state(true);
  let selectedCategory = $state("mixer");
  let selectedCurveIndex = $state(0);
  let dirty = $state({ mixer: false, gain: false });
  let initialCurves;

  let category = $derived(CATEGORIES[selectedCategory]);
  let curve = $derived(getArray(selectedCategory)[selectedCurveIndex]);
  let anyDirty = $derived(dirty.mixer || dirty.gain);
  let showToolbar = $derived(!loading && anyDirty);

  let curveOptions = $derived(
    Array.from({ length: category.model.CURVE_COUNT }, (_, i) => ({
      value: i,
      label: $i18n.t("mixerCurveLabel", { 1: i + 1 }),
    })),
  );

  let pointCountOptions = $derived(
    Array.from({ length: category.model.POINT_COUNT - 1 }, (_, i) => i + 2).map(
      (n) => ({ value: n, label: String(n) }),
    ),
  );

  function selectCategory(key) {
    if (selectedCategory === key) return;
    selectedCategory = key;
    selectedCurveIndex = 0;
  }

  function markDirty() {
    dirty[selectedCategory] = true;
  }

  function onReset() {
    getArray(selectedCategory)[selectedCurveIndex] = category.model.nullCurve();
    markDirty();
  }

  function onAddPoint() {
    if (category.model.addPointAtLargestGap(curve)) markDirty();
  }

  function onPointCountChange(count) {
    category.model.setPointCount(curve, count);
    markDirty();
  }

  function onDeletePoint(index) {
    if (category.model.removePoint(curve, index)) markDirty();
  }

  function onPointFieldChange(index, x, y) {
    const clamped = category.model.clampPoint(curve, index, x, y);
    Object.assign(curve.points[index], clamped);
    markDirty();
  }

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_MIXER_CURVES);
    await MSP.promise(MSPCodes.MSP_GAIN_CURVES);

    for (const key of Object.keys(CATEGORIES)) {
      const arr = getArray(key);
      const model = CATEGORIES[key].model;
      while (arr.length < model.CURVE_COUNT) {
        arr.push(model.nullCurve());
      }
    }

    initialCurves = {
      mixer: MixerCurve.cloneCurves($state.snapshot(FC.MIXER_CURVES)),
      gain: GainCurve.cloneCurves($state.snapshot(FC.GAIN_CURVES)),
    };
    loading = false;
  });

  export async function onSave() {
    for (const key of Object.keys(CATEGORIES)) {
      if (dirty[key]) {
        await new Promise((resolve) => sendAll(key, resolve));
      }
    }
    await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
    GUI.log($i18n.t("eepromSaved"));

    initialCurves = {
      mixer: MixerCurve.cloneCurves($state.snapshot(FC.MIXER_CURVES)),
      gain: GainCurve.cloneCurves($state.snapshot(FC.GAIN_CURVES)),
    };
    dirty = { mixer: false, gain: false };
  }

  export async function onRevert() {
    FC.MIXER_CURVES = MixerCurve.cloneCurves(initialCurves.mixer);
    FC.GAIN_CURVES = GainCurve.cloneCurves(initialCurves.gain);
    dirty = { mixer: false, gain: false };
  }

  export function isDirty() {
    return anyDirty;
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabCurves"), "_system");
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabCurves")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

{#snippet toolbar()}
  <button class="btn" onclick={onRevert}>{$i18n.t("buttonRevert")}</button>
  <button class="btn" onclick={onSave}>{$i18n.t("buttonSave")}</button>
{/snippet}

<Page {header} {loading} toolbar={showToolbar && toolbar}>
  <div class="category-tabs">
    {#each Object.keys(CATEGORIES) as key (key)}
      <button
        class={["category-tab", key === selectedCategory && "active"]}
        onclick={() => selectCategory(key)}
      >
        {$i18n.t(CATEGORIES[key].tabKey)}
      </button>
    {/each}
  </div>
  <p class="category-help">{$i18n.t(category.helpKey)}</p>

  <Section>
    {#snippet header()}
      <div class="section-header">
        <span class="title">{$i18n.t(category.titleKey)}</span>
      </div>
    {/snippet}

    <div class="toolbar-row">
      <Select bind:value={selectedCurveIndex} options={curveOptions} />
      <button class="btn" onclick={onReset}>{$i18n.t("curveReset")}</button>
    </div>
    <p class="hint">{$i18n.t("curveEditorHint")}</p>

    <div class="editor-row">
      <div class="plot-wrapper">
        <CurvePlot
          {curve}
          model={category.model}
          xMin={category.xMin}
          xMax={category.xMax}
          yMin={category.yMin}
          yMax={category.yMax}
          xAxisValue={category.xAxisValue}
          yAxisValue={category.yAxisValue}
          onEdit={markDirty}
        />
      </div>

      <p class="explain">{$i18n.t(category.explainKey)}</p>

      <div class="point-list">
        <table class="point-table">
          <thead>
            <tr>
              <th>{$i18n.t("curvePointIndex")}</th>
              <th>{$i18n.t("curvePointX")}</th>
              <th>{$i18n.t("curvePointY")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each curve.points.slice(0, curve.count) as point, index (index)}
              {@const isEndpoint = index === 0 || index === curve.count - 1}
              <tr>
                <td class="point-index">{index + 1}</td>
                <td>
                  <input
                    type="number"
                    min={category.xMin}
                    max={category.xMax}
                    step="10"
                    disabled={isEndpoint}
                    title={isEndpoint
                      ? $i18n.t("curveEndpointXLocked")
                      : undefined}
                    bind:value={
                      () => point.x,
                      (v) => onPointFieldChange(index, v, point.y)
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={category.yMin}
                    max={category.yMax}
                    step="10"
                    bind:value={
                      () => point.y,
                      (v) => onPointFieldChange(index, point.x, v)
                    }
                  />
                </td>
                <td>
                  <button
                    class="delete"
                    onclick={() => onDeletePoint(index)}
                    disabled={isEndpoint}
                    title={isEndpoint
                      ? $i18n.t("curveEndpointNoDelete")
                      : undefined}
                    aria-label="Delete point"
                  >
                    <span class="fas fa-times"></span>
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>

        <div class="point-list-toolbar">
          <button class="btn" onclick={onAddPoint}>
            {$i18n.t("curveAddPoint")}
          </button>
          <span class="point-count-group">
            <span class="point-count-label">{$i18n.t("curvePointCount")}</span>
            <Select
              value={curve.count}
              options={pointCountOptions}
              onchange={(e) => onPointCountChange(Number(e.target.value))}
            />
          </span>
        </div>
      </div>
    </div>
  </Section>
</Page>

<style lang="scss">
  h1 {
    font-weight: 600;
  }

  .btn {
    @extend %button;
  }

  .help-btn {
    padding: 4px 8px;
    min-width: 60px;
  }

  .grow {
    flex-grow: 1;
  }

  .category-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-top: var(--section-gap);
    margin-bottom: var(--section-gap);
  }

  .category-tab {
    @extend %button;
    padding: 0 14px;

    &.active {
      color: var(--color-text-inverse, #000);
      background-color: var(--color-accent, var(--accent));
    }
  }

  .category-help {
    margin: 0 0 var(--section-gap);
    font-size: 0.75rem;
    color: var(--color-text-soft);
  }

  .section-header {
    @extend %section-header;
    padding-right: 8px;
  }

  .title {
    padding-left: 8px;
    font-weight: 600;
  }

  .toolbar-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .hint {
    margin: 6px 0 0;
    font-size: 0.7rem;
    color: var(--color-text-soft);
  }

  .editor-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .plot-wrapper {
    width: 100%;
    max-width: 434px;
    aspect-ratio: 434 / 416;
    flex: 1 1 320px;
  }

  .explain {
    flex: 1 1 200px;
    min-width: 180px;
    max-width: 320px;
    box-sizing: border-box;
    margin: 0;
    padding: 10px 12px;
    background-color: var(--color-surface-float, var(--color-surface));
    border: 1px solid var(--color-border);
    border-radius: 3px;
    color: var(--color-text-soft);
    font-size: 0.7rem;
    line-height: 1.5;
    white-space: pre-line;
  }

  .point-list {
    flex: 1 1 auto;
    min-width: 240px;
    max-width: 360px;
  }

  .point-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;

    th {
      text-align: left;
      font-weight: 600;
      font-size: 0.75rem;
      padding: 4px 6px;
      border-bottom: 1px solid var(--color-border);
    }

    td {
      padding: 3px 6px;
      border-bottom: 1px solid var(--color-border-soft);
      vertical-align: middle;
    }

    input[type="number"] {
      width: 100%;
    }
  }

  .point-index {
    width: 1.8em;
    color: var(--color-text-soft);
  }

  .delete {
    background: none;
    border: none;
    padding: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    color: var(--color-text-soft);

    @media (hover: hover) {
      &:hover {
        color: var(--color-text);
      }
    }
  }

  .point-list-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .point-count-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .point-count-label {
    font-size: 0.7rem;
    color: var(--color-text-soft);
  }
</style>
