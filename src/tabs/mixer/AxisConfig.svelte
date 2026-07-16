<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import Section from "@/components/Section.svelte";
  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Select from "@/components/Select.svelte";

  import {
    rateToPercent,
    percentToRate,
    AXIS_GAIN_MIN,
    AXIS_GAIN_MAX,
  } from "./util.js";

  // Indices into FC.MIXER_INPUTS for the three stabilized axes -- matches the
  // firmware's MIXER_IN_STABILIZED_ROLL/PITCH/YAW wire order (Mixer.inputNames).
  const AXES = [
    { key: "roll", index: 1, labelKey: "mixerAxisGainRoll" },
    { key: "pitch", index: 2, labelKey: "mixerAxisGainPitch" },
    { key: "yaw", index: 3, labelKey: "mixerAxisGainYaw" },
  ];

  function gain(index) {
    return rateToPercent(FC.MIXER_INPUTS[index]?.rate ?? 0);
  }

  function setGain(index, percent) {
    const input = FC.MIXER_INPUTS[index];
    if (!input) return;
    input.rate = percentToRate(percent, input.rate < 0);
  }

  function invert(index) {
    return (FC.MIXER_INPUTS[index]?.rate ?? 0) < 0 ? 1 : 0;
  }

  function setInvert(index, value) {
    const input = FC.MIXER_INPUTS[index];
    if (!input) return;
    input.rate = percentToRate(rateToPercent(input.rate), value === 1);
  }

  let invertOptions = $derived([
    { value: 0, label: $i18n.t("mixerAxisInvertNormal") },
    { value: 1, label: $i18n.t("mixerAxisInvertInverted") },
  ]);
</script>

{#snippet gainHeader()}
  <div class="header">
    <span class="title">{$i18n.t("mixerAxisGainTitle")}</span>
    <div class="grow"></div>
    <HelpIcon>{$i18n.t("mixerAxisGainHelp")}</HelpIcon>
  </div>
{/snippet}

{#snippet invertHeader()}
  <div class="header">
    <span class="title">{$i18n.t("mixerAxisInvertTitle")}</span>
    <div class="grow"></div>
    <HelpIcon>{$i18n.t("mixerAxisInvertHelp")}</HelpIcon>
  </div>
{/snippet}

<div class="grid">
  <Section header={gainHeader}>
    <table class="axis-table">
      <tbody>
        {#each AXES as axis (axis.key)}
          <tr>
            <td>{$i18n.t(axis.labelKey)}</td>
            <td>
              <NumberInput
                min={AXIS_GAIN_MIN}
                max={AXIS_GAIN_MAX}
                step="5"
                bind:value={
                  () => gain(axis.index), (v) => setGain(axis.index, v)
                }
              />
            </td>
            <td class="unit">%</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Section>

  <Section header={invertHeader}>
    <table class="axis-table">
      <tbody>
        {#each AXES as axis (axis.key)}
          <tr>
            <td>{$i18n.t(axis.labelKey)}</td>
            <td>
              <Select
                options={invertOptions}
                bind:value={
                  () => invert(axis.index), (v) => setInvert(axis.index, v)
                }
              />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Section>
</div>

<style lang="scss">
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    column-gap: var(--section-gap);
  }

  .header {
    @extend %section-header;
    padding-right: 8px;
  }

  .title {
    padding-left: 8px;
  }

  .grow {
    flex-grow: 1;
  }

  .axis-table {
    border-collapse: collapse;

    td {
      padding: 3px 0;
      vertical-align: middle;
    }

    td:first-child {
      padding-right: 12px;
      width: 60px;
    }
  }

  .unit {
    padding-left: 6px;
    color: var(--color-text-soft);
  }
</style>
