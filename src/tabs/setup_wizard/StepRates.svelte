<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  const wiz = getContext("setupWizard");

  // Starting points by flying style, applied to roll, pitch and yaw. The
  // Rates tab holds rate as deg/s / 500 and expo as a fraction.
  const PRESETS = [
    { key: "gentle", rate: 150, expo: 20 },
    { key: "sport", rate: 250, expo: 30 },
    { key: "3d", rate: 500, expo: 60 },
  ];
  const AXES = ["roll", "pitch", "yaw"];

  let changed = $state(false);

  function rate(axis) {
    return Math.round(FC.RC_TUNING[`${axis}_rc_rate`] * 500);
  }

  function expo(axis) {
    return Math.round(FC.RC_TUNING[`${axis}_rc_expo`] * 100);
  }

  function isCurrent(preset) {
    return AXES.every(
      (a) => rate(a) === preset.rate && expo(a) === preset.expo,
    );
  }

  function apply(preset) {
    for (const axis of AXES) {
      FC.RC_TUNING[`${axis}_rc_rate`] = preset.rate / 500;
      FC.RC_TUNING[`${axis}_rc_expo`] = preset.expo / 100;
    }
    changed = true;
    wiz.markChanged();
  }

  wiz.setCommit(async () => {
    if (!changed) return;
    await MSP.promise(
      MSPCodes.MSP_SET_RC_TUNING,
      mspHelper.crunch(MSPCodes.MSP_SET_RC_TUNING),
    );
    changed = false;
  });
</script>

<p>{$i18n.t("setupWizardRatesIntro")}</p>

<div class="presets">
  {#each PRESETS as preset (preset.key)}
    <button
      class={["preset", isCurrent(preset) && "current"]}
      onclick={() => apply(preset)}
    >
      <strong>{$i18n.t(`setupWizardRates_${preset.key}`)}</strong>
      <span class="numbers">
        {$i18n.t("setupWizardRatesValues", { 1: preset.rate, 2: preset.expo })}
      </span>
      <span class="muted">{$i18n.t(`setupWizardRatesHelp_${preset.key}`)}</span>
    </button>
  {/each}
</div>

<table class="current-rates">
  <tbody>
    {#each AXES as axis (axis)}
      <tr>
        <td>{$i18n.t(`setupWizardAxis_${axis}`)}</td>
        <td
          >{$i18n.t("setupWizardRatesValues", {
            1: rate(axis),
            2: expo(axis),
          })}</td
        >
      </tr>
    {/each}
  </tbody>
</table>

<p class="muted">{$i18n.t("setupWizardRatesMore")}</p>
<div>
  <button class="btn" onclick={() => wiz.openTab("rates")}>
    {$i18n.t("tabRates")}
  </button>
</div>

<style lang="scss">
  .btn {
    @extend %button;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .preset {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 200px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
    color: var(--color-text);
    text-align: left;
    font: inherit;
    cursor: pointer;

    &:hover {
      border-color: var(--color-accent-500);
    }

    &.current {
      border-color: var(--color-accent-500);
      box-shadow: inset 0 0 0 1px var(--color-accent-500);
    }
  }

  .numbers {
    font-variant-numeric: tabular-nums;
  }

  .current-rates {
    width: auto;
    border-collapse: collapse;
  }

  .current-rates td {
    padding: 2px 16px 2px 0;
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
