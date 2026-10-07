<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import TravelGauge from "./TravelGauge.svelte";
  import StickCorners from "./StickCorners.svelte";
  import PassthroughStatus from "./PassthroughStatus.svelte";
  import { travelReach } from "./surfaces.js";

  const wiz = getContext("setupWizard");

  let rows = $derived(
    wiz.surfaces.map((surface) => ({
      surface,
      reach: travelReach(
        surface,
        FC.SERVO_CONFIG[surface.servo],
        wiz.axisGains,
        FC.SERVO_CURVES?.[surface.servo],
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

<PassthroughStatus />

<div class="corners">
  <StickCorners />
  <span>{$i18n.t("setupWizardTravelCorners")}</span>
</div>

<div class="legend">
  <span class="key"
    ><span class="sw limit"></span>{$i18n.t("setupWizardTravelKeyLimit")}</span
  >
  <span class="key"
    ><span class="sw reach"></span>{$i18n.t("setupWizardTravelKeyReach")}</span
  >
  <span class="key"
    ><span class="sw over"></span>{$i18n.t("setupWizardTravelKeyOver")}</span
  >
  <span class="key"
    ><span class="sw now"></span>{$i18n.t("setupWizardTravelKeyNow")}</span
  >
</div>

<div class="surfaces">
  {#each rows as { surface, reach } (surface.servo)}
    {@const clips = reach.neg.fraction > 1 || reach.pos.fraction > 1}
    <section class={["surface", clips && "clips"]}>
      <div class="head">
        <span class="name">{wiz.surfaceLabel(surface)}</span>
        {#if clips}
          <span class="flag bad">
            <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
            {$i18n.t("setupWizardTravelFlagClips")}
          </span>
        {:else}
          <span class="flag good">
            <i class="fas fa-check" aria-hidden="true"></i>
            {$i18n.t("setupWizardTravelFlagOk")}
          </span>
        {/if}
      </div>
      <TravelGauge servo={surface.servo} {reach} />
      <div class="sides">
        {#each [{ s: reach.neg, label: "setupWizardTravelNeg" }, { s: reach.pos, label: "setupWizardTravelPos" }] as { s, label } (label)}
          <span class={["reading", s.fraction > 1 && "clips"]}>
            <span class="side">{$i18n.t(label)}</span>
            {$i18n.t("setupWizardTravelValue", {
              1: percent(s.fraction),
              2: Math.round(s.us),
              3: s.limit,
            })}
          </span>
        {/each}
      </div>
    </section>
  {/each}
</div>

{#if anyClipping}
  <div class="note">{$i18n.t("setupWizardTravelClipping")}</div>
{:else if rows.length > 0}
  <p class="good-text">
    <i class="fas fa-check-circle" aria-hidden="true"></i>
    {$i18n.t("setupWizardTravelOk")}
  </p>
{/if}

<style lang="scss">
  p {
    margin: 0;
    max-width: 70ch;
  }

  .corners {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
    font-weight: 600;
  }

  //// Legend for the gauges, drawn with the same marks.

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 20px;
    color: var(--color-text-soft);
    font-size: 0.85em;
  }

  .key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .sw {
    display: inline-block;

    &.limit {
      width: 4px;
      height: 14px;
      border-radius: 2px;
      background-color: var(--color-text-muted);
    }

    &.reach {
      width: 22px;
      height: 8px;
      background-color: var(--color-accent-500);
    }

    &.over {
      width: 22px;
      height: 8px;
      background-color: var(--color-status-bad);
    }

    &.now {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background-color: var(--color-text);
    }
  }

  //// One card per surface.

  .surfaces {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .surface {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);

    &.clips {
      border-color: var(--color-status-bad);
    }
  }

  .head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .name {
    font-weight: 600;
  }

  .flag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85em;
    font-weight: 600;

    &.good {
      color: var(--color-status-good);
    }

    &.bad {
      color: var(--color-status-bad);
    }
  }

  .sides {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }

  .reading {
    font-variant-numeric: tabular-nums;
    font-size: 0.9em;

    &:last-child {
      text-align: right;
    }

    &.clips {
      color: var(--color-status-bad);
      font-weight: 600;
    }
  }

  .side {
    margin-right: 6px;
    color: var(--color-text-soft);
    font-weight: 600;
  }

  .note {
    padding: 10px 14px;
    border-left: 4px solid var(--color-status-bad);
    background-color: var(--color-surface-sunken);
    border-radius: var(--radius-xs);
    max-width: 70ch;
  }

  .good-text {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-status-good);
    font-weight: 600;
  }
</style>
