<script>
  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { GainCurve } from "@/js/GainCurve.js";

  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Section from "@/components/Section.svelte";
  import Select from "@/components/Select.svelte";

  // One row per axis, matching PidGains.svelte's table (same axis color
  // coding, plus a fourth color for throttle), plus throttle attenuation
  // folded in as a fourth row since it's the same shape (a baseline gain
  // optionally shaped by a curve from the same shared pool). Gain and Curve
  // are both visible regardless of expert mode; expertOnly rows (throttle)
  // are hidden entirely outside expert mode, matching the previous
  // standalone Throttle Attenuation section; throttle gets its own help
  // text since its mechanism differs from the per-axis gain/curve rows.
  const MASTER_GAIN_AXES = [
    {
      key: "roll",
      axisClass: "ROLL",
      label: "axisROLL",
      gainKey: "masterGainRoll",
      curveKey: "gainCurveRoll",
    },
    {
      key: "pitch",
      axisClass: "PITCH",
      label: "axisPITCH",
      gainKey: "masterGainPitch",
      curveKey: "gainCurvePitch",
    },
    {
      key: "yaw",
      axisClass: "YAW",
      label: "axisYAW",
      gainKey: "masterGainYaw",
      curveKey: "gainCurveYaw",
    },
    {
      key: "throttle",
      axisClass: "THROTTLE",
      label: "controlAxisThrottle",
      gainKey: "fwTpaGain",
      curveKey: "fwTpaCurve",
      help: "profilesFwTpaHelp",
      expertOnly: true,
      gainMax: 200,
    },
  ];

  const PID_AXES = ["ROLL", "PITCH", "YAW"];
  const MASTER_GAIN_KEYS = [
    "masterGainRoll",
    "masterGainPitch",
    "masterGainYaw",
  ];
  const PID_GAINS = [
    {
      key: "P",
      label: "profilesProportional",
      help: "profilesProportionalHelp",
    },
    { key: "I", label: "profilesIntegral", help: "profilesIntegralHelp" },
    { key: "D", label: "profilesDerivative", help: "profilesDerivativeHelp" },
    { key: "F", label: "profilesFeedforward", help: "profilesFeedforwardHelp" },
    { key: "B", label: "profilesBoost", help: "profilesBoostHelp" },
  ];

  function isMasterGainAffected(gainIndex) {
    return gainIndex < 4;
  }

  function realPid(axisIndex, gainIndex) {
    const base = Number(FC.PIDS[axisIndex][gainIndex]) || 0;
    if (!isMasterGainAffected(gainIndex)) {
      return base;
    }

    const masterGain =
      Number(FC.PID_PROFILE[MASTER_GAIN_KEYS[axisIndex]]) || 100;
    return (base * masterGain) / 100;
  }

  function formatRealPid(value) {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded)
      ? String(rounded)
      : rounded
          .toFixed(2)
          .replace(/\.0+$/, "")
          .replace(/(\.\d*[1-9])0+$/, "$1");
  }

  let gainCurveOptions = $derived([
    { value: 0, label: $i18n.t("mixerCurveNone") },
    ...Array.from({ length: GainCurve.CURVE_COUNT }, (_, i) => ({
      value: i + 1,
      label: $i18n.t("mixerCurveLabel", { 1: i + 1 }),
    })),
  ]);
</script>

<Section label="profilesMasterGainGroup">
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
            {$i18n.t("profilesGainCurveColumn")}
            <HelpIcon>{$i18n.t("profilesGainCurveHelp")}</HelpIcon>
          </span>
        </th>
      </tr>
    </thead>
    <tbody>
      {#each MASTER_GAIN_AXES as axis (axis.key)}
        {#if !axis.expertOnly || CONFIGURATOR.expertMode}
          <tr>
            <td class="axis {axis.axisClass}">
              <span class="axis-label">
                {$i18n.t(axis.label)}
                {#if axis.help}
                  <HelpIcon>{$i18n.t(axis.help)}</HelpIcon>
                {/if}
              </span>
            </td>
            <td>
              <NumberInput
                min="25"
                max={axis.gainMax ?? 1000}
                bind:value={FC.PID_PROFILE[axis.gainKey]}
              />
            </td>
            <td>
              <Select
                options={gainCurveOptions}
                bind:value={FC.PID_PROFILE[axis.curveKey]}
              />
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</Section>

<div class="effective-pids-section">
  <div class="effective-pids-header">
    <span class="header-label">
      Effective PID Gains
      <HelpIcon>{$i18n.t("profilesEffectivePidGainsHelp")}</HelpIcon>
    </span>
  </div>
  <div class="effective-pids-content">
    <table class="grid effective-grid">
      <thead>
        <tr>
          <th></th>
          {#each PID_GAINS as gain (gain.key)}
            <th>
              <span class="header-label">
                {$i18n.t(gain.label)}
                <HelpIcon>{$i18n.t(gain.help)}</HelpIcon>
              </span>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each PID_AXES as axis, axisIndex (axis)}
          <tr>
            <td class="axis {axis}">{$i18n.t(`axis${axis}`)}</td>
            {#each PID_GAINS as gain, gainIndex (gain.key)}
              <td>
                <div class="real-pid" title={$i18n.t("profilesMasterGainHelp")}>
                  {formatRealPid(realPid(axisIndex, gainIndex))}
                </div>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style lang="scss">
  .grid {
    border-collapse: collapse;
  }

  .effective-pids-section {
    @extend %section-shadow;

    margin-top: var(--section-gap);
    overflow: hidden;
  }

  .effective-pids-header {
    @extend %section-header;

    padding: 0 8px;
  }

  .effective-pids-header .header-label {
    color: var(--color-text-alt);
  }

  @media only screen and (max-width: 480px) {
    .effective-pids-header .header-label {
      color: var(--color-text);
    }
  }

  .effective-pids-content {
    padding: 4px;
    background-color: var(--color-surface);
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

  .effective-grid th,
  .effective-grid td {
    text-align: center;
  }

  .effective-grid .axis {
    text-align: left;
    padding-left: 8px;
  }

  .real-pid {
    width: 100%;
    min-width: 72px;
    max-width: 100px;
    height: 1.5rem;
    padding: 0 8px;
    border: 1px solid var(--color-border);
    border-radius: 2px;
    background-color: var(--color-input-bg-disabled);
    color: var(--color-text-soft);
    text-align: right;
    line-height: 1.5rem;
    font-size: 0.75rem;
    pointer-events: none;
    user-select: none;
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
</style>
