<script>
  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { ServoBalanceCurve } from "@/js/ServoBalanceCurve.js";
  import { requestCurveView } from "@/js/curveNav.svelte.js";
  import { Mixer } from "@/js/Mixer.js";
  import {
    SERVO_TRIM_ADJUSTMENT_FUNCTIONS,
    adjustmentChannelLabel,
    adjustmentTitle,
    getAdjustmentState,
  } from "@/tabs/adjustments/adjustmentState.js";

  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Switch from "@/components/Switch.svelte";

  // pwmServoCount is only meaningful (and only passed) for the bus table -
  // needed to work out whether a given bus channel is actually being
  // cloned from a PWM servo right now (see effectiveCurveIndex() below).
  let { servos, onFieldChange, onRateChange, pwmServoCount = 0 } = $props();

  const FLAG_REVERSE = 1;

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

  // Servos have their own saved trim, added at the output on top of Center
  // (FC API 22.3+; older FCs report none). A Stepped ServoTrim adjustment
  // changes it and the polled MSP_SERVO_CONFIGURATIONS response shows the
  // new value; Mapped adjustments are runtime-only and never touch the saved
  // trim, so they don't show up here (the badge shows they're live).

  // The FC limits trim to this share of the servo's scale (larger of
  // Scale -/+), see SERVO_TRIM_LIMIT_PERCENT in the firmware.
  const TRIM_LIMIT_PERCENT = 20;

  function trimBounds(servo) {
    const config = FC.SERVO_CONFIG[servo.index];
    const limit = Math.floor(
      (Math.max(config.rneg, config.rpos) * TRIM_LIMIT_PERCENT) / 100,
    );
    return { min: -limit, max: limit };
  }

  let hasTrimField = $derived(
    servos.some((servo) => FC.SERVO_CONFIG[servo.index]?.trim !== undefined),
  );

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
  //
  // Column widths are kept as a plain array (rather than hand-typed into
  // the grid-template-columns string, as before) so gridMinWidth below can
  // be computed from the exact same numbers instead of a second,
  // independently-hand-typed guess that could drift out of sync with it.
  const INDEX_COL = 44;
  const VALUE_COL = 100;
  const TRIM_COL = 64;
  const TRIM_VALUE_COL = 80;
  // Wide enough for the Reverse label + help icon on one line for most
  // locales (English "Reverse", German "Umkehr", ...) -- header-label-narrow
  // below still wraps the icon as a fallback for longer translations (e.g.
  // Bulgarian "Реверсиране") rather than relying on this width alone.
  const REVERSE_COL = 90;
  // No fixed column for the trailing Signal meter (it's the 1fr track), but
  // it still needs *some* room to be legible -- this is roughly its
  // meter-label plus a usable sliver of the meter bar itself.
  const SIGNAL_MIN_WIDTH = 90;
  const COLUMN_GAP = 4;

  let columnWidths = $derived.by(() => {
    const cols = [INDEX_COL, VALUE_COL]; // Servo #, Center
    if (hasTrimField) cols.push(TRIM_VALUE_COL); // Trim
    if (hasTrimAdjustments) cols.push(TRIM_COL);
    cols.push(VALUE_COL, VALUE_COL, VALUE_COL, VALUE_COL); // Min, Max, Scale neg/pos
    if (CONFIGURATOR.expertMode) {
      if (!isBusTable) cols.push(VALUE_COL); // Rate (PWM only)
      cols.push(VALUE_COL); // Speed
    }
    cols.push(REVERSE_COL); // Reverse
    return cols;
  });

  let gridColumns = $derived(
    `${columnWidths.map((w) => `${w}px`).join(" ")} 1fr`,
  );

  // The narrowest this table's *current* column set (which varies with
  // Expert Mode / bus vs PWM / whether a Trim column is showing) can get
  // before it needs its own horizontal scrollbar -- compared against the
  // actually-measured available width below to decide whether to show the
  // grid at all, rather than guessing a single fixed viewport breakpoint
  // that can't account for the sidebar or for which column set is active.
  let gridMinWidth = $derived(
    columnWidths.reduce((sum, w) => sum + w, 0) +
      columnWidths.length * COLUMN_GAP + // one gap before each column, including before the trailing Signal track
      SIGNAL_MIN_WIDTH,
  );

  // Measured via bind:clientWidth below. Starts at 0 before the first
  // layout pass, during which showCompact defaults to true (see below) --
  // briefly showing the compact list first on a wide screen reads better
  // than briefly showing an overflowing grid.
  let containerWidth = $state(0);
  let showCompact = $derived(
    containerWidth === 0 || containerWidth < gridMinWidth,
  );

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

  // Balance curves are edited on the Curves tab, not here - this is just a
  // read-only "something's set" indicator so it's not invisible from the
  // Servos tab.
  //
  // In clone mode (bus_servo_clone_pwm), a bus channel's actual
  // transmitted signal mirrors its paired PWM servo's already
  // curve-shaped output verbatim - the firmware never even reads that bus
  // channel's own curve slot in that case (sbusOutGetValueMixer(),
  // drivers/sbus_output.c). So the curve that's actually meaningful for a
  // cloned bus row is the source PWM servo's, not the bus channel's own
  // (functionally inert while cloned) slot. Only channels that actually
  // have a PWM counterpart (channel < pwmServoCount) are cloned - beyond
  // that, a bus channel always runs its own independent mixer/curve
  // regardless of the clone toggle.
  function effectiveCurveIndex(servo) {
    if (servo.isBusServo) {
      const channel = servo.mspIndex - Mixer.BUS_SERVO_OFFSET;
      if (
        FC.MIXER_CONFIG?.bus_servo_clone_pwm === 1 &&
        channel < pwmServoCount
      ) {
        return channel; // PWM servos occupy FC.SERVO_CURVES[0..pwmServoCount-1] directly
      }
    }
    return servo.index;
  }

  function hasActiveCurve(servo) {
    const curve = FC.SERVO_CURVES?.[effectiveCurveIndex(servo)];
    return (
      !!curve &&
      !ServoBalanceCurve.compareCurve(curve, ServoBalanceCurve.nullCurve())
    );
  }

  function isClonedCurve(servo) {
    return servo.isBusServo && effectiveCurveIndex(servo) !== servo.index;
  }

  function curveTooltip(servo) {
    return isClonedCurve(servo)
      ? $i18n.t("servoCurveActiveCloned", { 1: effectiveCurveIndex(servo) + 1 })
      : $i18n.t("servoCurveActive");
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

{#snippet curveIconSvg()}
  <svg
    class="curve-icon"
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3 18 C 7 18, 7 6, 12 6 C 17 6, 17 18, 21 18" />
  </svg>
{/snippet}

{#snippet curveIcon(servo)}
  <button
    type="button"
    class="curve-icon-btn"
    onclick={() => requestCurveView("servo", effectiveCurveIndex(servo))}
    title={$i18n.t("servoCurveEdit")}
    aria-label={$i18n.t("servoCurveEdit")}
  >
    {@render curveIconSvg()}
  </button>
{/snippet}

<div class="responsive-table" bind:clientWidth={containerWidth}>
  {#if !showCompact}
    <div class="servo-config desktop-table">
      <div class="header-row" style="grid-template-columns: {gridColumns}">
        <span>{$i18n.t("servoNumber")}</span>
        <span class="header-label-flex">
          <span>{$i18n.t("servoMid")}</span>
          <HelpIcon>{$i18n.t("servoMidHelp")}</HelpIcon>
        </span>
        {#if hasTrimField}
          <span class="header-label-flex">
            <span>{$i18n.t("servoTrim")}</span>
            <HelpIcon>{$i18n.t("servoTrimHelp")}</HelpIcon>
          </span>
        {/if}
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
        <span class="header-label-flex header-label-narrow">
          <span>{$i18n.t("servoReverse")}</span>
          <HelpIcon>{$i18n.t("servoReverseHelp")}</HelpIcon>
        </span>
        <span>{$i18n.t("servoSignal")}</span>
      </div>

      {#each servos as servo (servo.index)}
        {@const config = FC.SERVO_CONFIG[servo.index]}
        <div class="servo-row" style="grid-template-columns: {gridColumns}">
          <span
            class="servo-index"
            title={hasActiveCurve(servo) ? curveTooltip(servo) : undefined}
          >
            {servo.label}
            {#if hasActiveCurve(servo)}{@render curveIcon(servo)}{/if}
          </span>
          <span>
            <NumberInput
              {...bounds(servo, "mid")}
              bind:value={config.mid}
              onchange={() => onFieldChange(servo.index)}
            />
          </span>
          {#if hasTrimField}
            <span>
              <NumberInput
                {...trimBounds(servo)}
                bind:value={config.trim}
                onchange={() => onFieldChange(servo.index)}
              />
            </span>
          {/if}
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
          <span class="servo-signal">
            <span class="meter">
              <span class="meter-fill" style="width: {meterPercent(servo)}%"
              ></span>
            </span>
            <span class="meter-label">{FC.SERVO_DATA[servo.index] ?? 0}</span>
          </span>
        </div>
      {/each}
    </div>
  {:else}
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
            <span
              class="mobile-detail-index"
              title={hasActiveCurve(servo) ? curveTooltip(servo) : undefined}
            >
              {servo.label}
              {#if hasActiveCurve(servo)}{@render curveIcon(servo)}{/if}
            </span>
          </div>

          <div class="mobile-field">
            {@render fieldLabel("servoMid", "servoMidHelp")}
            <NumberInput
              {...bounds(servo, "mid")}
              bind:value={config.mid}
              onchange={() => onFieldChange(servo.index)}
            />
          </div>
          {#if config.trim !== undefined}
            <div class="mobile-field">
              {@render fieldLabel("servoTrim", "servoTrimHelp")}
              <NumberInput
                {...trimBounds(servo)}
                bind:value={config.trim}
                onchange={() => onFieldChange(servo.index)}
              />
            </div>
          {/if}

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
              <span
                class="mobile-row-index"
                title={hasActiveCurve(servo) ? curveTooltip(servo) : undefined}
              >
                {servo.label}
                {#if hasActiveCurve(servo)}{@render curveIconSvg()}{/if}
              </span>
              <span class="servo-signal mobile-row-signal">
                <span class="meter">
                  <span class="meter-fill" style="width: {meterPercent(servo)}%"
                  ></span>
                </span>
                <span class="meter-label"
                  >{FC.SERVO_DATA[servo.index] ?? 0}</span
                >
              </span>
              <span class="mobile-row-mid"
                >{$i18n.t("servoMid")}: {config.mid}</span
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
    border-radius: var(--radius-xs);
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

  // REVERSE_COL is sized for the label in most locales, but a long enough
  // translation (e.g. Bulgarian "Реверсиране") can still outrun it, and with
  // nowrap the overflow wouldn't respect the grid cell -- it'd bleed into
  // the Signal column instead of staying above the switch. Wrapping the
  // icon onto its own line as a fallback keeps the label centered over its
  // actual column at any text length.
  .header-label-narrow {
    flex-wrap: wrap;
    row-gap: 1px;
    white-space: normal;
  }

  .header-label-narrow :global(.container) {
    margin-left: 0;
  }

  .servo-row {
    padding: 4px;
    text-align: center;
    border-bottom: 1px solid var(--color-border);
  }

  .servo-index {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    font-weight: 600;
  }

  // Shown below/beside a servo's number when it has a non-default balance
  // curve set on the Curves tab - not editable from here, just a "something's
  // set" flag so it isn't invisible from this tab. Reused on the desktop
  // index cell, the mobile detail title, and the mobile list row; stacked
  // under the number where the column is narrow (desktop), inline where
  // there's more room (mobile).
  // Sized in em (matched on the element itself too, as a belt-and-braces
  // fallback - see width/height="1em" on the <svg>) so it tracks whatever
  // font-size/line-height applies at each of its three call sites, instead
  // of a fixed px size that's right in one place and wrong in the others.
  .curve-icon {
    width: 1em;
    height: 1em;
    flex-shrink: 0;
    color: var(--color-accent, var(--accent));
  }

  // Clickable variant (desktop index cell, mobile detail title) - jumps to
  // this servo's curve on the Curves tab, see curveNav.svelte.js. Not used
  // in the mobile list row, which is itself already a <button> and can't
  // nest another one - that spot renders the plain curveIconSvg instead.
  .curve-icon-btn {
    display: inline-flex;
    padding: 2px;
    border: none;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--color-accent, var(--accent));
    cursor: pointer;

    @media (hover: hover) {
      &:hover {
        background-color: var(--color-surface-float, var(--color-surface));
      }
    }
  }

  .mobile-detail-index {
    display: inline-flex;
    align-items: center;
    gap: 5px;
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
    border-radius: var(--radius-sm);
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
    border-radius: var(--radius-sm);
    background-color: var(--color-accent, var(--accent));
  }

  .meter-label {
    min-width: 34px;
    font-size: 0.7rem;
    font-weight: 600;
    text-align: right;

    color: var(--color-text-soft);
  }

  // Which of .desktop-table / .mobile-view renders is now decided in JS
  // (showCompact, from bind:clientWidth vs. the current column set's real
  // minimum width) rather than a fixed viewport media query -- a static
  // breakpoint can't account for the sidebar eating real width, or for
  // Expert Mode/bus-vs-PWM/trim changing how many columns are actually in
  // play, so it either overflows on ordinary wide screens (breakpoint too
  // low) or loses the grid entirely on them (breakpoint pushed high enough
  // to compensate). See gridMinWidth in the script block.
  .responsive-table {
    width: 100%;
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
    position: relative;
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
    border-radius: var(--radius-xs);
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
