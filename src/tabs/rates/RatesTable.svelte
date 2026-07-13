<script>
  import { i18n } from "@/js/i18n.js";
  import { FC } from "@/js/fc.svelte.js";

  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";

  let { maxAngularRoll, maxAngularPitch, maxAngularYaw } = $props();

  // Runtime ranges/precision the legacy tab applied via jQuery .attr()
  // overrides on load (rates.js RATES_DEFAULTS) -- the static HTML
  // min/max/step were only placeholders.
  const RC_RATE_MIN = 10;
  const RC_RATE_MAX = 1000;
  const RC_RATE_STEP = 5;
  const SHAPE_MIN = 0;
  const SHAPE_MAX = 127;
  const SHAPE_STEP = 1;
  const EXPO_MIN = 0;
  const EXPO_MAX = 100;
  const EXPO_STEP = 1;

  const AXES = [
    { key: "roll", label: "axisROLL", maxAngular: () => maxAngularRoll },
    { key: "pitch", label: "axisPITCH", maxAngular: () => maxAngularPitch },
    { key: "yaw", label: "axisYAW", maxAngular: () => maxAngularYaw },
  ];
</script>

<Section label="rateSetupRates" summary="rateSetupTuningHelp">
  <table class="grid">
    <thead>
      <tr>
        <th></th>
        <th>{$i18n.t("rateSetupRotorflightRate")}</th>
        <th>{$i18n.t("rateSetupRotorflightShape")}</th>
        <th>{$i18n.t("rateSetupRotorflightExpo")}</th>
        <th>{$i18n.t("rateSetupMaxVel")}</th>
      </tr>
    </thead>
    <tbody>
      {#each AXES as axis (axis.key)}
        <tr>
          <td class="axis {axis.key}">{$i18n.t(axis.label)}</td>
          <td>
            <NumberInput
              min={RC_RATE_MIN}
              max={RC_RATE_MAX}
              step={RC_RATE_STEP}
              bind:value={
                () => FC.RC_TUNING[`${axis.key}_rc_rate`] * 500,
                (v) => (FC.RC_TUNING[`${axis.key}_rc_rate`] = v / 500)
              }
            />
          </td>
          <td>
            <NumberInput
              min={SHAPE_MIN}
              max={SHAPE_MAX}
              step={SHAPE_STEP}
              bind:value={
                () => FC.RC_TUNING[`${axis.key}_srate`] * 100,
                (v) => (FC.RC_TUNING[`${axis.key}_srate`] = v / 100)
              }
            />
          </td>
          <td>
            <NumberInput
              min={EXPO_MIN}
              max={EXPO_MAX}
              step={EXPO_STEP}
              bind:value={
                () => FC.RC_TUNING[`${axis.key}_rc_expo`] * 100,
                (v) => (FC.RC_TUNING[`${axis.key}_rc_expo`] = v / 100)
              }
            />
          </td>
          <td class="max-vel">{axis.maxAngular().toFixed(0)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</Section>

<style lang="scss">
  .grid {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    padding: 4px;
    font-weight: 600;
    font-size: 0.8rem;
    text-align: center;

    color: var(--color-text-soft);
    border-bottom: 1px solid var(--color-border);
  }

  td {
    padding: 4px;
    text-align: center;
  }

  .max-vel {
    font-weight: 600;
  }

  .axis {
    font-weight: 600;
    text-align: left;
    padding-left: 8px;
  }

  .axis.roll {
    background-color: hsl(0, 100%, 85%);
  }

  .axis.pitch {
    background-color: hsl(120, 100%, 85%);
  }

  .axis.yaw {
    background-color: hsl(240, 100%, 88%);
  }

  :global(html[data-theme="dark"]) .axis.roll {
    background-color: hsl(0, 40%, 30%);
  }

  :global(html[data-theme="dark"]) .axis.pitch {
    background-color: hsl(120, 25%, 25%);
  }

  :global(html[data-theme="dark"]) .axis.yaw {
    background-color: hsl(240, 35%, 32%);
  }
</style>
