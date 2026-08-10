<script>
  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import {
    SERVO_TRIM_ADJUSTMENT_FUNCTIONS,
    adjustmentChannelLabel,
    adjustmentTitle,
    getAdjustmentState,
  } from "@/tabs/adjustments/adjustmentState.js";

  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Switch from "@/components/Switch.svelte";

  let { servos, onFieldChange, onRateChange } = $props();

  const FLAG_REVERSE = 1;
  const FLAG_GEOCOR = 2;

  const scaleMin = 50;

  // Roll/Pitch/Yaw, same order as SERVO_TRIM_ADJUSTMENT_FUNCTIONS.
  const SERVO_TRIM_AXIS_LABELS = ["R", "P", "Y"];

  // ServoTrimRoll/Pitch/Yaw aren't tied to a fixed servo slot like
  // PID/MasterGain adjustments -- they trim whichever servo(s)
  // FC.MIXER_RULES currently mixes from the corresponding stabilized axis
  // input (src 1/2/3, see AxisConfig.svelte). dst uses the same 1-based raw
  // servo slot numbering as servo.mspIndex (dst - 1 === mspIndex) for both
  // PWM and bus servos.
  function axisAffectsServo(axisSrc, mspIndex) {
    return (FC.MIXER_RULES ?? []).some(
      (rule) => rule.src === axisSrc && rule.dst - 1 === mspIndex,
    );
  }

  // A servo can be mixed from more than one stabilized axis at once (e.g. a
  // flying-wing elevon mixes both Roll and Pitch), so this returns every
  // applicable, currently-configured trim rather than just the first match.
  function servoTrimAdjustments(servo) {
    return SERVO_TRIM_ADJUSTMENT_FUNCTIONS.map((adjFunction, axisIndex) => {
      if (!axisAffectsServo(axisIndex + 1, servo.mspIndex)) {
        return null;
      }

      const adjustment = getAdjustmentState(adjFunction);
      return adjustment
        ? { axisLabel: SERVO_TRIM_AXIS_LABELS[axisIndex], adjustment }
        : null;
    }).filter(Boolean);
  }

  // While a Stepped ServoTrim adjustment is actively incrementing/
  // decrementing, the FC persists the change and the polled
  // MSP_SERVO_CONFIGURATIONS response overwrites Mid with it -- disable
  // editing to avoid the field fighting with the live value. Mapped
  // adjustments only bias the runtime servo output and never rewrite the
  // stored Mid value, so they don't need to block editing.
  function midDisabled(servo) {
    return servoTrimAdjustments(servo).some(
      (trim) => trim.adjustment.active && trim.adjustment.adjType === 2,
    );
  }

  // Bus servos are always mixer-driven and have no Rate (Hz) setting -- each
  // table instance is homogeneous (all PWM or all bus), so hide the whole
  // column rather than leaving an empty cell in every row.
  let isBusTable = $derived(servos.length > 0 && servos[0].isBusServo);

  // Only show the Trim column if at least one servo in this table actually
  // has a ServoTrim adjustment configured for it -- otherwise it's just an
  // empty column taking up space.
  let hasTrimAdjustments = $derived(
    servos.some((servo) => servoTrimAdjustments(servo).length > 0),
  );

  // Mobile view (see markup below): the desktop grid has up to 11 columns
  // of tiny inputs, which doesn't survive shrinking to phone width no
  // matter how it's squeezed -- so below that width this becomes a list of
  // servos you tap into one at a time, each opening a single-column form
  // with every field at a legible size, mirroring the list->editor pattern
  // wingflight-lua-ethos-suite uses for the same reason (servos_pwm.lua).
  let selectedIndex = $state(null);
  let selectedServo = $derived(
    servos.find((servo) => servo.index === selectedIndex) ?? null,
  );

  // Guards against a stale selection surviving a prop change this table
  // instance doesn't otherwise react to (e.g. bus mode toggling off while
  // a bus servo's detail view is open).
  $effect(() => {
    if (
      selectedIndex !== null &&
      !servos.some((servo) => servo.index === selectedIndex)
    ) {
      selectedIndex = null;
    }
  });

  // CSS Grid instead of a <table>: HTML tables with border-collapse are
  // prone to sub-pixel row-height rounding that visibly accumulates over
  // many rows (fine at row 1, drifted by row 10+) -- a grid sizes every row
  // independently and doesn't have that failure mode.
  let gridColumns = $derived.by(() => {
    const trimColumn = hasTrimAdjustments ? "70px " : "";
    if (!CONFIGURATOR.expertMode) {
      return `44px 118px ${trimColumn}118px 118px 118px 118px 84px 1fr`;
    }
    return isBusTable
      ? `44px 118px ${trimColumn}118px 118px 118px 118px 118px 84px 84px 1fr`
      : `44px 118px ${trimColumn}118px 118px 118px 118px 118px 118px 84px 84px 1fr`;
  });

  function bounds(servo, field) {
    if (servo.isBusServo) {
      if (field === "mid") return { min: 1001, max: 1999 };
      if (field === "min") return { min: -500, max: -1 };
      if (field === "max") return { min: 1, max: 500 };
    } else {
      if (field === "mid") return { min: 50, max: 2250 };
      if (field === "min" || field === "max") return { min: -1000, max: 1000 };
    }
    return {};
  }

  function meterRange(servo) {
    if (servo.isBusServo) {
      return { min: 1000, max: 2000 };
    }

    const mid = FC.SERVO_CONFIG[servo.index].mid;
    if (mid <= 860) return { min: 375, max: 1145 };
    if (mid <= 1060) return { min: 460, max: 1460 };
    return { min: 750, max: 2250 };
  }

  function meterPercent(servo) {
    const { min, max } = meterRange(servo);
    const value = FC.SERVO_DATA[servo.index] ?? min;
    const percent = (100 * (value - min)) / (max - min);
    return Math.min(100, Math.max(0, percent));
  }

  function flag(index, mask) {
    return (FC.SERVO_CONFIG[index].flags & mask) !== 0;
  }

  function setFlag(index, mask, enabled) {
    FC.SERVO_CONFIG[index].flags = enabled
      ? FC.SERVO_CONFIG[index].flags | mask
      : FC.SERVO_CONFIG[index].flags & ~mask;
  }
</script>

{#snippet fieldLabel(labelKey, helpKey)}
  <span class="mobile-field-label">
    {$i18n.t(labelKey)}
    {#if helpKey}<HelpIcon>{$i18n.t(helpKey)}</HelpIcon>{/if}
  </span>
{/snippet}

<div class="servo-config desktop-table">
  <div class="header-row" style="grid-template-columns: {gridColumns}">
    <span>{$i18n.t("servoNumber")}</span>
    <span class="header-label-flex">
      <span>{$i18n.t("servoMid")}</span>
      <HelpIcon>{$i18n.t("servoMidHelp")}</HelpIcon>
    </span>
    {#if hasTrimAdjustments}
      <span class="header-label-flex">
        <span>{$i18n.t("servoTrimColumn")}</span>
        <HelpIcon>{$i18n.t("servoTrimColumnHelp")}</HelpIcon>
      </span>
    {/if}
    <span class="header-label-flex">
      <span>{$i18n.t("servoMin")}</span>
      <HelpIcon>{$i18n.t("servoMinHelp")}</HelpIcon>
    </span>
    <span class="header-label-flex">
      <span>{$i18n.t("servoMax")}</span>
      <HelpIcon>{$i18n.t("servoMaxHelp")}</HelpIcon>
    </span>
    <span class="header-label-flex">
      <span>{$i18n.t("servoScaleNeg")}</span>
      <HelpIcon>{$i18n.t("servoScaleNegHelp")}</HelpIcon>
    </span>
    <span class="header-label-flex">
      <span>{$i18n.t("servoScalePos")}</span>
      <HelpIcon>{$i18n.t("servoScalePosHelp")}</HelpIcon>
    </span>
    {#if CONFIGURATOR.expertMode}
      {#if !isBusTable}
        <span class="header-label-flex">
          <span>{$i18n.t("servoRate")}</span>
          <HelpIcon>
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html $i18n.t("servoRateHelp")}
          </HelpIcon>
        </span>
      {/if}
      <span class="header-label-flex">
        <span>{$i18n.t("servoSpeed")}</span>
        <HelpIcon>{$i18n.t("servoSpeedHelp")}</HelpIcon>
      </span>
    {/if}
    <span class="header-label-flex">
      <span>{$i18n.t("servoReverse")}</span>
      <HelpIcon>{$i18n.t("servoReverseHelp")}</HelpIcon>
    </span>
    {#if CONFIGURATOR.expertMode}
      <span class="header-label-flex">
        <span>{$i18n.t("servoGeometryCorrection")}</span>
        <HelpIcon>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html $i18n.t("servoGeometryCorrectionHelp")}
        </HelpIcon>
      </span>
    {/if}
    <span>{$i18n.t("servoSignal")}</span>
  </div>

  {#each servos as servo (servo.index)}
    {@const config = FC.SERVO_CONFIG[servo.index]}
    <div class="servo-row" style="grid-template-columns: {gridColumns}">
      <span class="servo-index">{servo.label}</span>
      <span>
        <NumberInput
          {...bounds(servo, "mid")}
          bind:value={config.mid}
          disabled={midDisabled(servo)}
          onchange={() => onFieldChange(servo.index)}
        />
      </span>
      {#if hasTrimAdjustments}
        <span class="servo-trim-badges">
          {#each servoTrimAdjustments(servo) as trim (trim.axisLabel)}
            <span
              class="adjustment-badge"
              class:runtime-active={trim.adjustment.active}
              title={adjustmentTitle(trim.adjustment)}
            >
              {trim.axisLabel}
              {trim.adjustment.active
                ? (adjustmentChannelLabel(trim.adjustment) ?? "LIVE")
                : "ADJ"}
            </span>
          {/each}
        </span>
      {/if}
      <span>
        <NumberInput
          {...bounds(servo, "min")}
          bind:value={config.min}
          onchange={() => onFieldChange(servo.index)}
        />
      </span>
      <span>
        <NumberInput
          {...bounds(servo, "max")}
          bind:value={config.max}
          onchange={() => onFieldChange(servo.index)}
        />
      </span>
      <span>
        <NumberInput
          min={scaleMin}
          max="1000"
          bind:value={config.rneg}
          onchange={() => onFieldChange(servo.index)}
        />
      </span>
      <span>
        <NumberInput
          min={scaleMin}
          max="1000"
          bind:value={config.rpos}
          onchange={() => onFieldChange(servo.index)}
        />
      </span>
      {#if CONFIGURATOR.expertMode}
        {#if !isBusTable}
          <span>
            <NumberInput
              min="50"
              max="5000"
              bind:value={config.rate}
              onchange={() => onRateChange(servo.index)}
            />
          </span>
        {/if}
        <span>
          <NumberInput
            min="0"
            max="60000"
            bind:value={config.speed}
            onchange={() => onFieldChange(servo.index)}
          />
        </span>
      {/if}
      <span class="servo-checkbox">
        <Switch
          bind:checked={
            () => flag(servo.index, FLAG_REVERSE),
            (v) => setFlag(servo.index, FLAG_REVERSE, v)
          }
          onchange={() => onFieldChange(servo.index)}
        />
      </span>
      {#if CONFIGURATOR.expertMode}
        <span class="servo-checkbox">
          <Switch
            bind:checked={
              () => flag(servo.index, FLAG_GEOCOR),
              (v) => setFlag(servo.index, FLAG_GEOCOR, v)
            }
            onchange={() => onFieldChange(servo.index)}
          />
        </span>
      {/if}
      <span class="servo-signal">
        <span class="meter">
          <span class="meter-fill" style="width: {meterPercent(servo)}%"></span>
        </span>
        <span class="meter-label">{FC.SERVO_DATA[servo.index] ?? 0}</span>
      </span>
    </div>
  {/each}
</div>

<div class="mobile-view">
  {#if selectedServo}
    {@const servo = selectedServo}
    {@const config = FC.SERVO_CONFIG[servo.index]}
    <div class="mobile-detail">
      <button
        type="button"
        class="mobile-back"
        onclick={() => (selectedIndex = null)}
      >
        <em class="fas fa-chevron-left"></em>
        {$i18n.t("servoListBack")}
      </button>

      <div class="mobile-detail-title">
        {$i18n.t("servoNumber")}
        {servo.label}
      </div>

      <div class="mobile-field">
        {@render fieldLabel("servoMid", "servoMidHelp")}
        <NumberInput
          {...bounds(servo, "mid")}
          bind:value={config.mid}
          disabled={midDisabled(servo)}
          onchange={() => onFieldChange(servo.index)}
        />
      </div>

      {#if servoTrimAdjustments(servo).length > 0}
        <div class="mobile-field">
          {@render fieldLabel("servoTrimColumn", "servoTrimColumnHelp")}
          <span class="servo-trim-badges">
            {#each servoTrimAdjustments(servo) as trim (trim.axisLabel)}
              <span
                class="adjustment-badge"
                class:runtime-active={trim.adjustment.active}
                title={adjustmentTitle(trim.adjustment)}
              >
                {trim.axisLabel}
                {trim.adjustment.active
                  ? (adjustmentChannelLabel(trim.adjustment) ?? "LIVE")
                  : "ADJ"}
              </span>
            {/each}
          </span>
        </div>
      {/if}

      <div class="mobile-field">
        {@render fieldLabel("servoMin", "servoMinHelp")}
        <NumberInput
          {...bounds(servo, "min")}
          bind:value={config.min}
          onchange={() => onFieldChange(servo.index)}
        />
      </div>

      <div class="mobile-field">
        {@render fieldLabel("servoMax", "servoMaxHelp")}
        <NumberInput
          {...bounds(servo, "max")}
          bind:value={config.max}
          onchange={() => onFieldChange(servo.index)}
        />
      </div>

      <div class="mobile-field">
        {@render fieldLabel("servoScaleNeg", "servoScaleNegHelp")}
        <NumberInput
          min={scaleMin}
          max="1000"
          bind:value={config.rneg}
          onchange={() => onFieldChange(servo.index)}
        />
      </div>

      <div class="mobile-field">
        {@render fieldLabel("servoScalePos", "servoScalePosHelp")}
        <NumberInput
          min={scaleMin}
          max="1000"
          bind:value={config.rpos}
          onchange={() => onFieldChange(servo.index)}
        />
      </div>

      {#if CONFIGURATOR.expertMode}
        {#if !isBusTable}
          <div class="mobile-field">
            {@render fieldLabel("servoRate", "servoRateHelp")}
            <NumberInput
              min="50"
              max="5000"
              bind:value={config.rate}
              onchange={() => onRateChange(servo.index)}
            />
          </div>
        {/if}
        <div class="mobile-field">
          {@render fieldLabel("servoSpeed", "servoSpeedHelp")}
          <NumberInput
            min="0"
            max="60000"
            bind:value={config.speed}
            onchange={() => onFieldChange(servo.index)}
          />
        </div>
      {/if}

      <div class="mobile-field">
        {@render fieldLabel("servoReverse", "servoReverseHelp")}
        <Switch
          bind:checked={
            () => flag(servo.index, FLAG_REVERSE),
            (v) => setFlag(servo.index, FLAG_REVERSE, v)
          }
          onchange={() => onFieldChange(servo.index)}
        />
      </div>

      {#if CONFIGURATOR.expertMode}
        <div class="mobile-field">
          {@render fieldLabel(
            "servoGeometryCorrection",
            "servoGeometryCorrectionHelp",
          )}
          <Switch
            bind:checked={
              () => flag(servo.index, FLAG_GEOCOR),
              (v) => setFlag(servo.index, FLAG_GEOCOR, v)
            }
            onchange={() => onFieldChange(servo.index)}
          />
        </div>
      {/if}

      <div class="mobile-field">
        {@render fieldLabel("servoSignal", null)}
        <span class="servo-signal">
          <span class="meter">
            <span class="meter-fill" style="width: {meterPercent(servo)}%"
            ></span>
          </span>
          <span class="meter-label">{FC.SERVO_DATA[servo.index] ?? 0}</span>
        </span>
      </div>
    </div>
  {:else}
    <div class="mobile-list">
      {#each servos as servo (servo.index)}
        {@const config = FC.SERVO_CONFIG[servo.index]}
        <button
          type="button"
          class="mobile-list-row"
          onclick={() => (selectedIndex = servo.index)}
        >
          <span class="mobile-row-index">{servo.label}</span>
          <span class="servo-signal mobile-row-signal">
            <span class="meter">
              <span class="meter-fill" style="width: {meterPercent(servo)}%"
              ></span>
            </span>
            <span class="meter-label">{FC.SERVO_DATA[servo.index] ?? 0}</span>
          </span>
          <span class="mobile-row-mid">{$i18n.t("servoMid")}: {config.mid}</span
          >
          {#if servoTrimAdjustments(servo).length > 0}
            <span class="mobile-row-badges">
              {#each servoTrimAdjustments(servo) as trim (trim.axisLabel)}
                <span
                  class="adjustment-badge"
                  class:runtime-active={trim.adjustment.active}
                >
                  {trim.axisLabel}
                </span>
              {/each}
            </span>
          {/if}
          {#if flag(servo.index, FLAG_REVERSE)}
            <span class="mobile-row-rev">{$i18n.t("servoReverse")}</span>
          {/if}
          <em class="fas fa-chevron-right mobile-row-chevron"></em>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .servo-config {
    width: 100%;
    margin-top: 2px;
  }

  .header-row,
  .servo-row {
    display: grid;
    align-items: center;
    column-gap: 4px;
  }

  .servo-trim-badges {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .adjustment-badge {
    min-width: 2.5rem;
    padding: 1px 5px;
    border: 1px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
    border-radius: 3px;
    background-color: transparent;
    color: var(--color-text-soft);
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1rem;
    text-align: center;
    letter-spacing: 0;
  }

  .adjustment-badge.runtime-active {
    background-color: var(--color-accent, var(--accent));
    color: var(--color-text-inverse, #fff);
  }

  .header-row {
    padding: 4px;
    font-weight: 600;
    font-size: 0.75rem;
    text-align: center;

    color: var(--color-text-soft);
    background-color: var(--color-surface-float, var(--color-surface));
    border-bottom: 1px solid var(--color-border);
  }

  .header-label-flex {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    white-space: nowrap;
  }

  .header-label-flex :global(.container) {
    margin-left: 2px;
  }

  .servo-row {
    padding: 4px;
    text-align: center;
    border-bottom: 1px solid var(--color-border);
  }

  .servo-index {
    font-weight: 600;
  }

  .servo-checkbox {
    display: flex;
    justify-content: center;
  }

  .servo-signal {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .meter {
    position: relative;
    display: block;
    flex: 1;
    height: 10px;
    border-radius: 5px;
    overflow: hidden;

    background-color: var(--color-surface-float, var(--color-surface));
    box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.2);
  }

  .meter-fill {
    position: absolute;
    top: 0;
    left: 0;
    display: block;
    height: 100%;
    border-radius: 5px;
    background-color: var(--color-accent, var(--accent));
  }

  .meter-label {
    min-width: 34px;
    font-size: 0.7rem;
    font-weight: 600;
    text-align: right;

    color: var(--color-text-soft);
  }

  .mobile-view {
    display: none;
  }

  // 820px - the same "needs real room" breakpoint EffectivePidGains.svelte/
  // PidGains.svelte/Profiles.svelte already switch their widest tables at.
  // This table has up to 11 narrow input columns (more than any of those),
  // so a horizontal-scrolling grid of tiny touch targets is a worse
  // trade-off here, not a better one - below the same point it becomes a
  // list of servos you tap into one at a time, each opening every field at
  // a legible, single-column size instead.
  @media only screen and (max-width: 820px) {
    .desktop-table {
      display: none;
    }

    .mobile-view {
      display: block;
    }
  }

  .mobile-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 2px;
  }

  .mobile-list-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font: inherit;
    text-align: left;
    cursor: pointer;

    color: var(--color-text);
    background-color: var(--color-surface);

    @media (hover: hover) {
      &:hover {
        background-color: var(--color-surface-float, var(--color-surface));
      }
    }
  }

  .mobile-row-index {
    min-width: 1.8rem;
    font-weight: 700;
    text-align: center;
  }

  .mobile-row-signal {
    flex: 1;
    min-width: 70px;
  }

  .mobile-row-mid {
    flex-shrink: 0;
    font-size: 0.75rem;
    white-space: nowrap;

    color: var(--color-text-soft);
  }

  .mobile-row-badges {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
  }

  .mobile-row-rev {
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.65rem;
    font-weight: 700;

    color: var(--color-text-soft);
    background-color: var(--color-surface-float, var(--color-surface));
  }

  .mobile-row-chevron {
    flex-shrink: 0;
    font-size: 0.8rem;

    color: var(--color-text-soft);
  }

  .mobile-detail {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 2px;
  }

  .mobile-back {
    @extend %button;

    align-self: flex-start;
    gap: 6px;
    padding: 0 10px;
  }

  .mobile-detail-title {
    margin: 6px 0 4px;
    font-weight: 700;
    font-size: 0.95rem;
    text-align: center;
  }

  .mobile-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 4px;
    border-bottom: 1px solid var(--color-border);
  }

  .mobile-field-label {
    display: inline-flex;
    align-items: center;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .mobile-field-label :global(.container) {
    margin-left: 4px;
  }

  .mobile-field .servo-signal {
    flex: 1;
    justify-content: flex-end;
  }

  .mobile-field .servo-trim-badges {
    justify-content: flex-end;
  }
</style>
