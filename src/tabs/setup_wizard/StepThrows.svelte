<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import LivePulse from "./LivePulse.svelte";
  import SetupModeStatus from "./SetupModeStatus.svelte";
  import {
    AXES,
    AXIS_GAIN_MIN,
    AXIS_GAIN_MAX,
    travelReach,
  } from "./surfaces.js";

  // Throws are set with the radio in SETUP mode, so full stick is exactly
  // what the pilot's sticks and endpoints give, with no gyro. No overrides
  // here: in SETUP mode the FC replaces the stabilized inputs with the stick
  // anyway (flight/mixer.c), and Axis Gain still scales them.
  const wiz = getContext("setupWizard");

  let axes = $derived(
    AXES.map((a) => a.key).filter((axis) =>
      wiz.surfaces.some((s) => s.axes[axis]),
    ),
  );

  function surfacesOn(axis) {
    return wiz.surfaces.filter((s) => s.axes[axis]);
  }

  function nudge(axis, delta) {
    const next = Math.min(
      AXIS_GAIN_MAX,
      Math.max(AXIS_GAIN_MIN, wiz.axisGainPercent(axis) + delta),
    );
    wiz.setAxisGainPercent(axis, next);
  }

  // Surfaces on this axis that hit a limit with this axis alone at full
  // stick, so the pilot sees it while setting the throw rather than later.
  function limited(axis) {
    return surfacesOn(axis).filter((surface) => {
      const alone = { ...surface, axes: { [axis]: surface.axes[axis] } };
      const reach = travelReach(
        alone,
        FC.SERVO_CONFIG[surface.servo],
        wiz.axisGains,
      );
      return reach.pos.fraction > 1 || reach.neg.fraction > 1;
    });
  }
</script>

<p>{$i18n.t("setupWizardThrowsIntro")}</p>

<SetupModeStatus />

<div class="how">
  <strong>{$i18n.t("setupWizardThrowsHowTitle")}</strong>
  <ol>
    {#each [1, 2, 3, 4] as n (n)}
      <li>
        <span class="n">{n}.</span>
        <span>{$i18n.t(`setupWizardThrowsHow_${n}`)}</span>
      </li>
    {/each}
  </ol>
</div>

{#each axes as axis (axis)}
  {@const atLimit = limited(axis)}
  <section class="axis">
    <strong>{$i18n.t(`setupWizardAxis_${axis}`)}</strong>

    <div class="row">
      <span class="label">{$i18n.t("setupWizardThrowsThrow")}</span>
      {#each [-5, -1] as delta (delta)}
        <button class="btn" onclick={() => nudge(axis, delta)}>{delta}</button>
      {/each}
      <span class="amount">{wiz.axisGainPercent(axis)}%</span>
      {#each [1, 5] as delta (delta)}
        <button class="btn" onclick={() => nudge(axis, delta)}>+{delta}</button>
      {/each}
    </div>

    <table class="surfaces">
      <tbody>
        {#each surfacesOn(axis) as surface (surface.servo)}
          <tr>
            <td class="name">{wiz.surfaceLabel(surface)}</td>
            <td><LivePulse servo={surface.servo} /></td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if atLimit.length > 0}
      <span class="warn">
        {$i18n.t("setupWizardThrowsAtLimit", {
          1: atLimit.map((s) => wiz.surfaceLabel(s)).join(", "),
        })}
      </span>
    {/if}
  </section>
{/each}

<p class="muted">{$i18n.t("setupWizardThrowsRepeat")}</p>

<style lang="scss">
  .btn {
    @extend %button;
    min-width: 2.6em;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .how {
    max-width: 70ch;

    ol {
      list-style: none;
      margin: 4px 0 0;
      padding-left: 4px;
    }

    li {
      display: flex;
      gap: 6px;
      margin-bottom: 2px;
    }

    .n {
      flex: 0 0 1.2em;
      font-weight: 600;
    }
  }

  .axis {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    max-width: 720px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .label {
    min-width: 6em;
    color: var(--color-text-soft);
  }

  .amount {
    min-width: 4em;
    text-align: center;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .surfaces td {
    padding: 2px 12px 2px 0;
  }

  .name {
    white-space: nowrap;
  }

  .warn {
    color: var(--color-yellow-500);
    font-size: 0.9em;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
