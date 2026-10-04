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

  import RateCurve from "./RateCurve.svelte";
  import StyleArt from "./StyleArt.svelte";

  const wiz = getContext("setupWizard");

  // The firmware's expo exponent for an axis: sRates / 16 + 2
  // (applyWingflightRates() in fc/rc_rates.c); RC_TUNING holds sRates / 100.
  // The styles leave it alone, so their curves use the current roll shape.
  function shape(axis) {
    return ((FC.RC_TUNING[`${axis}_srate`] ?? 0) * 100) / 16 + 2;
  }

  // One rate scale for every curve on the page, so they compare.
  let scale = $derived(
    Math.max(...STYLES.map((s) => s.rate.roll), ...AXES.map((a) => rate(a))),
  );

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
      <span class="art"><StyleArt style={style.key} /></span>
      <span class="style-name">
        {$i18n.t(`setupWizardStyle_${style.key}`)}
        {#if isCurrent(style)}
          <i class="fas fa-check-circle" aria-hidden="true"></i>
        {/if}
      </span>
      <span class="muted">{$i18n.t(`setupWizardStyleHelp_${style.key}`)}</span>
      <RateCurve
        rate={style.rate.roll}
        expo={style.expo}
        shape={shape("roll")}
        {scale}
        axisLabel={$i18n.t("setupWizardStyleStickAxis")}
      />
      <span class="numbers">
        {$i18n.t("setupWizardStyleAxisRates", {
          1: style.rate.roll,
          2: style.rate.pitch,
          3: style.rate.yaw,
          4: style.expo,
        })}
      </span>
      <span class="relax">
        {$i18n.t(`setupWizardStyleRelax_${style.key}`)}
      </span>
    </button>
  {/each}
</div>

<div class="now">
  <span class="now-title">{$i18n.t("setupWizardStyleNow")}</span>
  <div class="now-axes">
    {#each AXES as axis (axis)}
      <div class="now-axis">
        <span class="axis-name">{$i18n.t(`setupWizardAxis_${axis}`)}</span>
        <RateCurve
          rate={rate(axis)}
          expo={expo(axis)}
          shape={shape(axis)}
          {scale}
          axisLabel={$i18n.t("setupWizardStyleStickAxis")}
        />
        <span class="numbers">
          {$i18n.t("setupWizardStyleRates", { 1: rate(axis), 2: expo(axis) })}
        </span>
        <span class="muted">
          {$i18n.t("setupWizardStyleRelaxValue", { 1: relax(axis) })}
        </span>
      </div>
    {/each}
  </div>
</div>

<p class="muted">{$i18n.t("setupWizardStyleMore")}</p>

<style lang="scss">
  p {
    margin: 0;
    max-width: 70ch;
  }

  .styles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .style {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 14px 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
    color: var(--color-text);
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition:
      border-color var(--animation-speed),
      background-color var(--animation-speed),
      box-shadow var(--animation-speed);

    &:hover {
      border-color: var(--color-border);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--color-focus-ring);
    }

    &.current {
      border-color: var(--color-accent-500);
      background-color: var(--color-accent-soft);
      box-shadow: inset 0 0 0 1px var(--color-accent-500);
    }
  }

  .art {
    align-self: center;
    margin-bottom: 4px;
  }

  .style-name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.1em;
    font-weight: 700;

    i {
      color: var(--color-accent-500);
    }
  }

  .numbers {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .relax {
    color: var(--color-text-soft);
    font-size: 0.85em;
  }

  //// What the model has now, per axis, on the same scale.

  .now {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
  }

  .now-title {
    color: var(--color-text-soft);
    font-size: 0.85em;
    font-weight: 600;
  }

  .now-axes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px 24px;
  }

  .now-axis {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .axis-name {
    font-weight: 600;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
