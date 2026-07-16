<script>
  import wNumb from "wnumb";
  import { slide } from "svelte/transition";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";

  import Section from "@/components/Section.svelte";
  import Switch from "@/components/Switch.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Slider from "@/components/Slider.svelte";

  import {
    overridePercentToRaw,
    overrideRawToPercent,
    OVERRIDE_PERCENT_MIN,
    OVERRIDE_PERCENT_MAX,
  } from "./util.js";

  // Same three stabilized axes as AxisConfig -- these are the only mixer
  // inputs that drive control surfaces, so they're the only ones exposed
  // for override.
  const OVERRIDE_AXES = [1, 2, 3];

  const sliderOpts = {
    range: { min: OVERRIDE_PERCENT_MIN, max: OVERRIDE_PERCENT_MAX },
    start: 0,
    step: 1,
    behaviour: "snap-drag",
    pips: {
      mode: "values",
      values: [-100, -50, 0, 50, 100],
      density: 100 / ((OVERRIDE_PERCENT_MAX - OVERRIDE_PERCENT_MIN) / 25),
      stepped: true,
      format: wNumb({ decimals: 0 }),
    },
  };

  function isEnabled(index) {
    return Mixer.overrideEnabled(FC.MIXER_OVERRIDE[index]);
  }

  // Forces a fixed value into a stabilized axis's mixer input, while the
  // aircraft is disarmed (the FC ignores MIXER_OVERRIDE while armed, see
  // mixerSetInput() in flight/mixer.c). Writes live on every change --
  // meant to be paired with Axis Gain above: enable an axis, command a
  // known %, measure the resulting surface throw, then adjust that axis's
  // gain to match.
  function setEnabled(index, enabled) {
    FC.MIXER_OVERRIDE[index] = enabled ? 0 : Mixer.OVERRIDE_OFF;
    mspHelper.sendMixerOverride(index);
  }

  function percent(index) {
    return isEnabled(index)
      ? overrideRawToPercent(FC.MIXER_OVERRIDE[index])
      : 0;
  }

  function setPercent(index, value) {
    FC.MIXER_OVERRIDE[index] = overridePercentToRaw(value);
    mspHelper.sendMixerOverride(index);
  }

  let anyEnabled = $derived(OVERRIDE_AXES.some(isEnabled));

  function setMasterEnabled(enabled) {
    OVERRIDE_AXES.forEach((index) => setEnabled(index, enabled));
  }
</script>

<Section label="mixerOverrideTitle">
  <div class="master-row">
    <Switch bind:checked={() => anyEnabled, (v) => setMasterEnabled(v)} />
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <span class="label">{@html $i18n.t("mixerEnableOverrideLabel")}</span>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <span class="description">{@html $i18n.t("mixerEnableOverrideText")}</span>
  </div>

  {#if anyEnabled}
    <div class="rows" transition:slide>
      <div class="header-row">
        <span>{$i18n.t("mixerOverrideAxis")}</span>
        <span>{$i18n.t("mixerOverrideEnable")}</span>
        <span>{$i18n.t("mixerOverrideValue")}</span>
        <span></span>
      </div>

      {#each OVERRIDE_AXES as index (index)}
        <div class="axis-row">
          <span class="col-axis">{$i18n.t(Mixer.inputNames[index])}</span>
          <span class="col-enable">
            <Switch
              bind:checked={() => isEnabled(index), (v) => setEnabled(index, v)}
            />
          </span>
          <span class="col-value">
            <NumberInput
              min={OVERRIDE_PERCENT_MIN}
              max={OVERRIDE_PERCENT_MAX}
              step="1"
              disabled={!isEnabled(index)}
              bind:value={() => percent(index), (v) => setPercent(index, v)}
            />
          </span>
          <div class="col-slider" class:disabled={!isEnabled(index)}>
            <Slider
              opts={sliderOpts}
              changeOnSlide={false}
              bind:value={() => percent(index), (v) => setPercent(index, v)}
            />
          </div>
        </div>
      {/each}
    </div>
  {/if}
</Section>

<style lang="scss">
  .master-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .label {
    font-weight: 600;
  }

  .description {
    color: var(--color-text-soft);
    font-size: 0.8rem;
  }

  .header-row,
  .axis-row {
    display: grid;
    grid-template-columns: 90px 65px 90px minmax(220px, 1fr);
    align-items: center;
    column-gap: 12px;
  }

  .header-row {
    padding: 4px 10px;
    margin-top: 10px;
    font-weight: 600;
    font-size: 0.75rem;

    color: var(--color-text-soft);
    background-color: var(--color-surface-float, var(--color-surface));
    border-bottom: 1px solid var(--color-border);
  }

  .axis-row {
    align-items: start;
    padding: 10px 10px 40px;
    border-bottom: 1px solid var(--color-border);
  }

  .col-axis {
    padding-top: 4px;
    font-weight: 600;
  }

  .col-enable {
    padding-top: 4px;
    text-align: center;
  }

  .col-slider {
    padding: 8px 20px 0;

    &.disabled {
      opacity: 0.5;
      pointer-events: none;
    }
  }
</style>
