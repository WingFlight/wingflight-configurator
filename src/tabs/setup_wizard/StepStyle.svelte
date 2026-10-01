<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  import {
    STYLES,
    STYLE_AXES as AXES,
    applyStyle,
    expoOf,
    matchingStyle,
    rateOf,
    relaxOf,
  } from "./styles.js";

  const wiz = getContext("setupWizard");

  let changed = $state(false);

  let current = $derived(matchingStyle(FC.RC_TUNING, FC.PID_PROFILE));

  function rate(axis) {
    return rateOf(FC.RC_TUNING, axis);
  }

  function expo(axis) {
    return expoOf(FC.RC_TUNING, axis);
  }

  function relax(axis) {
    return relaxOf(FC.PID_PROFILE, axis);
  }

  function isCurrent(style) {
    return current?.key === style.key;
  }

  function apply(style) {
    applyStyle(style, FC.RC_TUNING, FC.PID_PROFILE);
    changed = true;
    wiz.markChanged();
  }

  wiz.setCommit(async () => {
    if (!changed) return;
    await MSP.promise(
      MSPCodes.MSP_SET_RC_TUNING,
      mspHelper.crunch(MSPCodes.MSP_SET_RC_TUNING),
    );
    await MSP.promise(
      MSPCodes.MSP_SET_PID_PROFILE,
      mspHelper.crunch(MSPCodes.MSP_SET_PID_PROFILE),
    );
    changed = false;
  });
</script>

<p>{$i18n.t("setupWizardStyleIntro")}</p>

<div class="styles">
  {#each STYLES as style (style.key)}
    <button
      class={["style", isCurrent(style) && "current"]}
      onclick={() => apply(style)}
    >
      <strong>{$i18n.t(`setupWizardStyle_${style.key}`)}</strong>
      <span class="muted">{$i18n.t(`setupWizardStyleHelp_${style.key}`)}</span>
      <span class="numbers">
        {$i18n.t("setupWizardStyleRates", { 1: style.rate, 2: style.expo })}
      </span>
      <span class="numbers">
        {$i18n.t(`setupWizardStyleRelax_${style.key}`)}
      </span>
    </button>
  {/each}
</div>

<table class="now">
  <tbody>
    {#each AXES as axis (axis)}
      <tr>
        <td>{$i18n.t(`setupWizardAxis_${axis}`)}</td>
        <td
          >{$i18n.t("setupWizardStyleRates", {
            1: rate(axis),
            2: expo(axis),
          })}</td
        >
        <td>{$i18n.t("setupWizardStyleRelaxValue", { 1: relax(axis) })}</td>
      </tr>
    {/each}
  </tbody>
</table>

<p class="muted">{$i18n.t("setupWizardStyleMore")}</p>

<style lang="scss">
  p {
    margin: 0;
    max-width: 70ch;
  }

  .styles {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .style {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 220px;
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

  .now {
    width: auto;
    border-collapse: collapse;

    td {
      padding: 2px 16px 2px 0;
      font-variant-numeric: tabular-nums;
    }
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
