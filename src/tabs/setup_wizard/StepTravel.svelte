<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import LivePulse from "./LivePulse.svelte";
  import SetupModeStatus from "./SetupModeStatus.svelte";
  import { travelReach } from "./surfaces.js";

  const wiz = getContext("setupWizard");

  let rows = $derived(
    wiz.surfaces.map((surface) => ({
      surface,
      reach: travelReach(
        surface,
        FC.SERVO_CONFIG[surface.servo],
        wiz.axisGains,
      ),
    })),
  );

  let anyClipping = $derived(
    rows.some((r) => r.reach.pos.fraction > 1 || r.reach.neg.fraction > 1),
  );

  function percent(fraction) {
    return Math.round(fraction * 100);
  }
</script>

<p>{$i18n.t("setupWizardTravelIntro")}</p>

<SetupModeStatus />

<table class="rows">
  <thead>
    <tr>
      <th>{$i18n.t("setupWizardTravelSurface")}</th>
      <th>{$i18n.t("setupWizardTravelLive")}</th>
      <th>{$i18n.t("setupWizardTravelNeg")}</th>
      <th>{$i18n.t("setupWizardTravelPos")}</th>
    </tr>
  </thead>
  <tbody>
    {#each rows as { surface, reach } (surface.servo)}
      <tr>
        <td class="name">{wiz.surfaceLabel(surface)}</td>
        <td><LivePulse servo={surface.servo} /></td>
        {#each [reach.neg, reach.pos] as side, i (i)}
          {@const clips = side.fraction > 1}
          <td>
            <span class="bar" aria-hidden="true">
              <span
                class={["fill", clips && "clips"]}
                style:width={`${Math.min(side.fraction, 1) * 100}%`}
              ></span>
            </span>
            <span class={["reading", clips && "clips"]}>
              {$i18n.t("setupWizardTravelValue", {
                1: percent(side.fraction),
                2: Math.round(side.us),
                3: side.limit,
              })}
            </span>
          </td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>

{#if anyClipping}
  <div class="note">{$i18n.t("setupWizardTravelClipping")}</div>
{:else if rows.length > 0}
  <p class="good">{$i18n.t("setupWizardTravelOk")}</p>
{/if}

<style lang="scss">
  p {
    margin: 0;
    max-width: 70ch;
  }

  .rows {
    border-collapse: collapse;

    th {
      text-align: left;
      font-weight: 600;
      font-size: 0.9em;
      color: var(--color-text-soft);
      padding: 0 16px 4px 0;
    }

    td {
      padding: 6px 16px 6px 0;
      vertical-align: middle;
      white-space: nowrap;
    }
  }

  .name {
    font-weight: 600;
  }

  .bar {
    display: inline-block;
    width: 100px;
    height: 8px;
    margin-right: 8px;
    border-radius: var(--radius-pill);
    background-color: var(--color-border-soft);
    overflow: hidden;
    vertical-align: middle;
  }

  .fill {
    display: block;
    height: 100%;
    background-color: var(--color-accent-500);

    &.clips {
      background-color: var(--color-status-bad);
    }
  }

  .reading {
    font-variant-numeric: tabular-nums;
    font-size: 0.9em;

    &.clips {
      color: var(--color-status-bad);
      font-weight: 600;
    }
  }

  .note {
    padding: 8px 12px;
    border-left: 3px solid var(--color-status-bad);
    background-color: var(--color-surface);
    border-radius: var(--radius-xs);
    max-width: 70ch;
  }

  .good {
    color: var(--color-status-good);
  }
</style>
