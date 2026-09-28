<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import FlightFeelGuide from "./FlightFeelGuide.svelte";
  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import {
    ITERM_DECAY_TIME_ADJUSTMENT_FUNCTIONS,
    BOUNCEBACK_ADJUSTMENT_FUNCTIONS,
    MASTER_GAIN_ADJUSTMENT_FUNCTIONS,
    adjustmentChannelLabel,
    adjustmentTitle,
    getAdjustmentState,
  } from "@/tabs/adjustments/adjustmentState.js";

  // One row per axis, matching PidGains.svelte's table (same axis color
  // coding, plus a fourth color for throttle), plus throttle attenuation
  // folded in as a fourth row since it's the same shape (a baseline gain,
  // optionally shaped by a curve). Every row, throttle included, is visible
  // regardless of expert mode; throttle gets its own help text since its
  // mechanism differs from the per-axis rows. Curves are assigned in the
  // Expert Mode Gain Curves panel (GainCurves.svelte); a CURVE badge on Master Gain
  // shows when one is shaping that row.
  const MASTER_GAIN_AXES = [
    {
      key: "roll",
      axisClass: "ROLL",
      label: "axisROLL",
      gainKey: "masterGainRoll",
      curveKey: "gainCurveRoll",
      decayKey: "itermDecayTimeRoll",
      bouncebackKey: "bouncebackRoll",
    },
    {
      key: "pitch",
      axisClass: "PITCH",
      label: "axisPITCH",
      gainKey: "masterGainPitch",
      curveKey: "gainCurvePitch",
      decayKey: "itermDecayTimePitch",
      bouncebackKey: "bouncebackPitch",
    },
    {
      key: "yaw",
      axisClass: "YAW",
      label: "axisYAW",
      gainKey: "masterGainYaw",
      curveKey: "gainCurveYaw",
      decayKey: "itermDecayTimeYaw",
      bouncebackKey: "bouncebackYaw",
    },
    {
      key: "throttle",
      axisClass: "THROTTLE",
      label: "controlAxisThrottle",
      uppercase: true,
      suffix: "TPA",
      gainKey: "fwTpaGain",
      curveKey: "fwTpaCurve",
      help: "profilesFwTpaHelp",
      gainMax: 200,
    },
  ];

  function masterGainAdjustmentState(axisIndex) {
    return axisIndex < MASTER_GAIN_ADJUSTMENT_FUNCTIONS.length
      ? getAdjustmentState(MASTER_GAIN_ADJUSTMENT_FUNCTIONS[axisIndex])
      : null;
  }

  function runtimeMasterGain(axisIndex) {
    const value = FC.PID_RUNTIME_GAINS?.axes?.[axisIndex]?.masterGain;
    return Number.isFinite(value) ? value : null;
  }

  function showRuntimeMasterGain(axisIndex, adjustment) {
    return adjustment?.active && runtimeMasterGain(axisIndex) != null;
  }

  // I-Term Decay sits beside each axis's Master Gain because it is the other
  // half of how "locked" that axis feels: Master Gain sets how hard it pushes
  // back, I-Term Decay how long it remembers the disturbance.
  function decayAdjustmentState(axisIndex) {
    return axisIndex < ITERM_DECAY_TIME_ADJUSTMENT_FUNCTIONS.length
      ? getAdjustmentState(ITERM_DECAY_TIME_ADJUSTMENT_FUNCTIONS[axisIndex])
      : null;
  }

  // I-Term Relax is a 1-10 score per axis (higher = more relax, less
  // bounce-back); the firmware turns it into the relax filter cutoff.
  function bouncebackAdjustmentState(axisIndex) {
    return axisIndex < BOUNCEBACK_ADJUSTMENT_FUNCTIONS.length
      ? getAdjustmentState(BOUNCEBACK_ADJUSTMENT_FUNCTIONS[axisIndex])
      : null;
  }
</script>

<Section label="profilesMasterGainGroup">
  <div class="flight-feel-layout">
    <div class="table-scroll">
      <table class="grid">
        <thead>
          <tr>
            <th></th>
            <th>
              <span class="header-label">
                {$i18n.t("profilesMasterGainColumn")}
                <HelpIcon>{$i18n.t("profilesMasterGainHelp")}</HelpIcon>
              </span>
            </th>
            <th>
              <span class="header-label">
                {$i18n.t("profilesItermDecayColumn")}
                <HelpIcon>{$i18n.t("profilesItermDecayTimeHelp")}</HelpIcon>
              </span>
            </th>
            <th>
              <span class="header-label">
                {$i18n.t("profilesBouncebackColumn")}
                <HelpIcon>{$i18n.t("profilesBouncebackHelp")}</HelpIcon>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {#each MASTER_GAIN_AXES as axis, axisIndex (axis.key)}
            {@const adjustment = masterGainAdjustmentState(axisIndex)}
            <tr>
              <td class="axis {axis.axisClass}">
                <span class="axis-label">
                  {axis.uppercase
                    ? $i18n.t(axis.label).toUpperCase()
                    : $i18n.t(axis.label)}
                  {#if axis.suffix}
                    ({axis.suffix})
                  {/if}
                  {#if axis.help}
                    <HelpIcon>{$i18n.t(axis.help)}</HelpIcon>
                  {/if}
                </span>
              </td>
              <td>
                <div
                  class="runtime-control"
                  class:runtime-controlled={adjustment}
                  class:runtime-active={adjustment?.active}
                  title={adjustmentTitle(adjustment)}
                >
                  {#if showRuntimeMasterGain(axisIndex, adjustment)}
                    <div class="runtime-value-field">
                      <span class="step-button fas fa-minus"></span>
                      <span class="runtime-value"
                        >{runtimeMasterGain(axisIndex)}</span
                      >
                      <span class="step-button fas fa-plus"></span>
                    </div>
                  {:else}
                    <NumberInput
                      min="25"
                      max={axis.gainMax ?? 1000}
                      bind:value={FC.PID_PROFILE[axis.gainKey]}
                    />
                  {/if}
                  {#if adjustment}
                    <span class="adjustment-badge">
                      {adjustment.active
                        ? (adjustmentChannelLabel(adjustment) ?? "LIVE")
                        : "ADJ"}
                    </span>
                  {/if}
                  {#if FC.PID_PROFILE[axis.curveKey] > 0}
                    <span
                      class="curve-badge"
                      title={$i18n.t("profilesGainCurveBadgeTitle", {
                        1: FC.PID_PROFILE[axis.curveKey],
                      })}>{$i18n.t("profilesGainCurveBadge")}</span
                    >
                  {/if}
                </div>
              </td>
              <td>
                {#if axis.decayKey}
                  {@const decayAdjustment = decayAdjustmentState(axisIndex)}
                  <div
                    class="runtime-control"
                    class:runtime-controlled={decayAdjustment}
                    class:runtime-active={decayAdjustment?.active}
                    title={adjustmentTitle(decayAdjustment)}
                  >
                    <NumberInput
                      min="0.01"
                      max="1"
                      step="0.01"
                      bind:value={
                        () => FC.PID_PROFILE[axis.decayKey] / 100,
                        (v) =>
                          (FC.PID_PROFILE[axis.decayKey] = Math.round(v * 100))
                      }
                    />
                    {#if decayAdjustment}
                      <span class="adjustment-badge">
                        {decayAdjustment.active
                          ? (adjustmentChannelLabel(decayAdjustment) ?? "LIVE")
                          : "ADJ"}
                      </span>
                    {/if}
                  </div>
                {/if}
              </td>
              <td>
                {#if axis.bouncebackKey}
                  {@const bouncebackAdjustment =
                    bouncebackAdjustmentState(axisIndex)}
                  <div
                    class="runtime-control"
                    class:runtime-controlled={bouncebackAdjustment}
                    class:runtime-active={bouncebackAdjustment?.active}
                    title={adjustmentTitle(bouncebackAdjustment)}
                  >
                    <NumberInput
                      min="1"
                      max="10"
                      bind:value={FC.PID_PROFILE[axis.bouncebackKey]}
                    />
                    {#if bouncebackAdjustment}
                      <span class="adjustment-badge">
                        {bouncebackAdjustment.active
                          ? (adjustmentChannelLabel(bouncebackAdjustment) ??
                            "LIVE")
                          : "ADJ"}
                      </span>
                    {/if}
                  </div>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <FlightFeelGuide throttle />
  </div>
</Section>

<style lang="scss">
  // Table on the left, plain-language guide in the space to its right;
  // the guide wraps below the table on narrow windows.
  .flight-feel-layout {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 16px;
  }

  .table-scroll {
    overflow-x: auto;
  }

  .grid {
    min-width: 480px;
    border-collapse: collapse;
  }

  th {
    padding: 4px 12px;
    font-weight: 600;
    font-size: 0.8rem;
    text-align: left;
    white-space: nowrap;

    color: var(--color-text-soft);
    border-bottom: 1px solid var(--color-border);
  }

  .header-label {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    white-space: nowrap;
  }

  td {
    padding: 4px 12px;
    text-align: left;
  }

  .runtime-control {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .runtime-controlled {
    padding-right: 2px;
  }

  .runtime-active {
    opacity: 1;
  }

  .runtime-value-field {
    display: flex;
    max-width: 120px;
  }

  .step-button,
  .runtime-value {
    height: 1.5rem;
    line-height: 1.5rem;
    border: 1px solid var(--color-border);
    background-color: var(--color-input-bg-disabled);
    color: var(--color-text-soft);
    font-size: 0.8rem;
  }

  .step-button {
    width: 2rem;
    text-align: center;
  }

  .runtime-value {
    width: 100%;
    min-width: 4.5rem;
    padding: 0 8px;
    text-align: right;
    border-left: 0;
    border-right: 0;
  }

  .adjustment-badge {
    min-width: 2.5rem;
    padding: 1px 5px;
    border: 1px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
    border-radius: var(--radius-xs);
    background-color: var(--color-accent, var(--accent));
    color: var(--color-text-inverse, #fff);
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1rem;
    text-align: center;
    letter-spacing: 0;
  }

  .runtime-control:not(.runtime-active) .adjustment-badge {
    background-color: transparent;
    color: var(--color-text-soft);
  }

  // Outlined like an idle ADJ badge: a curve is configuration, not live.
  .curve-badge {
    min-width: 2.5rem;
    padding: 1px 5px;
    border: 1px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
    border-radius: var(--radius-xs);
    color: var(--color-text-soft);
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1rem;
    text-align: center;
    cursor: help;
  }

  .runtime-control.runtime-active .runtime-value-field {
    opacity: 0.62;
  }

  .axis {
    font-weight: 600;
    white-space: nowrap;
  }

  .axis-label {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .axis.ROLL {
    background-color: hsl(0, 100%, 85%);
  }

  .axis.PITCH {
    background-color: hsl(120, 100%, 85%);
  }

  .axis.YAW {
    background-color: hsl(240, 100%, 88%);
  }

  .axis.THROTTLE {
    background-color: hsl(35, 100%, 82%);
  }

  :global(html[data-theme="dark"]) .axis.ROLL {
    background-color: hsl(0, 40%, 30%);
  }

  :global(html[data-theme="dark"]) .axis.PITCH {
    background-color: hsl(120, 25%, 25%);
  }

  :global(html[data-theme="dark"]) .axis.YAW {
    background-color: hsl(240, 35%, 32%);
  }

  :global(html[data-theme="dark"]) .axis.THROTTLE {
    background-color: hsl(35, 45%, 28%);
  }

  // This table has room to spare even at desktop density - it's not the
  // reason for the 820px threshold (see Profiles.svelte's comment), but
  // it switches at the same point as its siblings above so the page's
  // compact mode arrives as one consistent transition rather than in
  // stages. Buttons stay reasonably tappable (1.6rem); the text field
  // narrows instead, since it only ever shows a short number.
  @media only screen and (max-width: 820px) {
    .table-scroll {
      --number-input-height: 1.6rem;
      --number-input-btn-size: 1.6rem;
      --number-input-max-width: 92px;
      --number-input-padding-x: 3px;
    }

    .grid {
      min-width: 260px;
    }

    th,
    td {
      padding: 4px 6px;
    }
  }
</style>
