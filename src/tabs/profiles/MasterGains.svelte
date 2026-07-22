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

<style lang="scss">
  .grid {
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
