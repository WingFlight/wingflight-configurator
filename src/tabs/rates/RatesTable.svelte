<script>
  import { i18n } from "@/js/i18n.js";
  import { FC } from "@/js/fc.svelte.js";

  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import Tier from "@/components/Tier.svelte";

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

  // fieldId: disclosure registry id (see fields.js) for the axis row.
  const AXES = [
    {
      key: "roll",
      label: "axisROLL",
      maxAngular: () => maxAngularRoll,
      fieldId: "rates.rates.roll",
    },
    {
      key: "pitch",
      label: "axisPITCH",
      maxAngular: () => maxAngularPitch,
      fieldId: "rates.rates.pitch",
    },
    {
      key: "yaw",
      label: "axisYAW",
      maxAngular: () => maxAngularYaw,
      fieldId: "rates.rates.yaw",
    },
  ];
</script>

<Section label="rateSetupRates" summary="rateSetupTuningHelp">
  <table class="grid">
    <thead>
      <tr>
        <th></th>
        <Tier id="rates.rates.rate">
          <th>{$i18n.t("rateSetupRotorflightRate")}</th>
        </Tier>
        <Tier id="rates.rates.shape">
          <th>{$i18n.t("rateSetupRotorflightShape")}</th>
        </Tier>
        <Tier id="rates.rates.expo">
          <th>{$i18n.t("rateSetupRotorflightExpo")}</th>
        </Tier>
        <th>{$i18n.t("rateSetupMaxVel")}</th>
      </tr>
    </thead>
    <tbody>
      {#each AXES as axis (axis.key)}
        <Tier id={axis.fieldId}>
          <tr>
            <td class="axis {axis.key}">{$i18n.t(axis.label)}</td>
            <Tier id="rates.rates.rate">
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
            </Tier>
            <Tier id="rates.rates.shape">
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
            </Tier>
            <Tier id="rates.rates.expo">
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
            </Tier>
            <td class="max-vel">{axis.maxAngular().toFixed(0)}</td>
          </tr>
        </Tier>
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

  // Matches Dynamics.svelte/Rates.svelte's 650px breakpoint so the whole
  // page goes compact together, even though this table's labels are
  // already short enough that it doesn't strictly need to change.
  @media only screen and (max-width: 650px) {
    th,
    td {
      padding: 4px 2px;
    }
  }
</style>
