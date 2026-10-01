<script>
  import { getContext, onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import LivePulse from "./LivePulse.svelte";

  const wiz = getContext("setupWizard");

  // Beyond this the horn should be moved instead: a large Mid offset costs
  // travel on one side.
  const MID_WARN_US = 100;

  // Hold every stabilized axis at zero so the gyro can't move the surfaces
  // while they are being centred.
  onMount(() => wiz.holdAxes({ roll: 0, pitch: 0, yaw: 0 }));

  function bandCentre(config) {
    return config.mid > 860 ? 1500 : 760;
  }

  function nudge(servo, delta) {
    const config = FC.SERVO_CONFIG[servo];
    config.mid += delta;
    wiz.sendServo(servo);
  }
</script>

<p>{$i18n.t("setupWizardCentreIntro")}</p>

<table class="rows">
  <tbody>
    {#each wiz.surfaces as surface (surface.servo)}
      {@const config = FC.SERVO_CONFIG[surface.servo]}
      <tr>
        <td class="name">{wiz.surfaceLabel(surface)}</td>
        <td class="nudges">
          {#each [-10, -1] as delta (delta)}
            <button class="btn" onclick={() => nudge(surface.servo, delta)}
              >{delta}</button
            >
          {/each}
          <span class="mid">{config.mid}</span>
          {#each [1, 10] as delta (delta)}
            <button class="btn" onclick={() => nudge(surface.servo, delta)}
              >+{delta}</button
            >
          {/each}
        </td>
        <td><LivePulse servo={surface.servo} /></td>
        <td class="warn">
          {#if Math.abs(config.mid - bandCentre(config)) > MID_WARN_US}
            {$i18n.t("setupWizardCentreFarWarning")}
          {/if}
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style lang="scss">
  .btn {
    @extend %button;
    min-width: 2.6em;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .rows {
    border-collapse: collapse;

    td {
      padding: 6px 12px 6px 0;
      vertical-align: middle;
    }
  }

  .name {
    font-weight: 600;
    white-space: nowrap;
  }

  .nudges {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .mid {
    min-width: 4ch;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .warn {
    color: var(--color-yellow-500);
    font-size: 0.9em;
  }
</style>
