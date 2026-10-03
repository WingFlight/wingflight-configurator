<script>
  import { getContext, onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import CentreArt from "./CentreArt.svelte";
  import CentreGauge from "./CentreGauge.svelte";

  const wiz = getContext("setupWizard");

  // Beyond this the horn should be moved instead: a large Mid offset costs
  // travel on one side.
  const MID_WARN_US = 100;

  // Servo override at 0 puts each servo exactly at its Mid, as on the Servos
  // tab: nothing from the mixer (gyro, offsets, flaps, curves) reaches it.
  // Released by the wizard when the step is left.
  onMount(() => {
    for (const surface of wiz.surfaces) {
      wiz.holdServo(surface.servo, 0);
    }
  });

  function bandCentre(config) {
    return config.mid > 860 ? 1500 : 760;
  }

  function nudge(servo, delta) {
    const config = FC.SERVO_CONFIG[servo];
    config.mid += delta;
    wiz.sendServo(servo);
  }

  function signed(n) {
    return `${n > 0 ? "+" : ""}${n}`;
  }
</script>

<div class="intro">
  <CentreArt />
  <div class="intro-text">
    <p>{$i18n.t("setupWizardCentreIntro")}</p>
    <ol class="tips">
      <li>{$i18n.t("setupWizardCentreTipHorn")}</li>
      <li>{$i18n.t("setupWizardCentreTipSurface")}</li>
    </ol>
  </div>
</div>

<div class="surfaces">
  {#each wiz.surfaces as surface (surface.servo)}
    {@const config = FC.SERVO_CONFIG[surface.servo]}
    {@const centre = bandCentre(config)}
    {@const offset = config.mid - centre}
    {@const far = Math.abs(offset) > MID_WARN_US}
    <section class={["surface", far && "far"]}>
      <div class="head">
        <span class="name">{wiz.surfaceLabel(surface)}</span>
        {#if far}
          <span class="flag warn">
            <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
            {$i18n.t("setupWizardCentreFlagFar")}
          </span>
        {:else}
          <span class="flag good">
            <i class="fas fa-check" aria-hidden="true"></i>
            {$i18n.t("setupWizardCentreFlagNear")}
          </span>
        {/if}
      </div>

      <CentreGauge servo={surface.servo} {centre} warn={MID_WARN_US} />
      <div class="scale" aria-hidden="true">
        <span>{signed(-2 * MID_WARN_US)}</span>
        <span>{centre} µs</span>
        <span>{signed(2 * MID_WARN_US)}</span>
      </div>

      <div class="controls">
        <span class="nudges">
          {#each [-10, -1] as delta (delta)}
            <button class="btn" onclick={() => nudge(surface.servo, delta)}
              >{delta}</button
            >
          {/each}
          <span class="mid">
            <span class="value">{config.mid}</span>
            <span class="unit">µs</span>
          </span>
          {#each [1, 10] as delta (delta)}
            <button class="btn" onclick={() => nudge(surface.servo, delta)}
              >+{delta}</button
            >
          {/each}
        </span>
        <span class="offset">
          {$i18n.t("setupWizardCentreOffset", { 1: signed(offset) })}
        </span>
      </div>

      {#if far}
        <p class="warn-text">{$i18n.t("setupWizardCentreFarWarning")}</p>
      {/if}
    </section>
  {/each}
</div>

<style lang="scss">
  .btn {
    @extend %button;
    min-width: 2.6em;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .intro {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 28px;
  }

  .intro-text {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1 1 300px;
  }

  // Numbered to match the badges in the picture.
  .tips {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: tip;
    font-weight: 600;

    li {
      display: flex;
      align-items: center;
      gap: 8px;
      counter-increment: tip;

      &::before {
        content: counter(tip);
        display: inline-grid;
        place-items: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background-color: var(--color-accent-500);
        color: var(--color-accent-fg);
        font-size: 0.75em;
        font-weight: 700;
      }
    }
  }

  //// One card per surface.

  .surfaces {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }

  .surface {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
    transition: border-color var(--animation-speed);

    &.far {
      border-color: var(--color-yellow-500);
    }
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
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

    &.warn {
      color: var(--color-yellow-500);
    }
  }

  .scale {
    display: flex;
    justify-content: space-between;
    color: var(--color-text-soft);
    font-size: 0.75em;
    font-variant-numeric: tabular-nums;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
  }

  .nudges {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .mid {
    min-width: 6ch;
    text-align: center;
    font-variant-numeric: tabular-nums;

    .value {
      font-size: 1.15em;
      font-weight: 700;
    }

    .unit {
      color: var(--color-text-soft);
      font-size: 0.8em;
    }
  }

  .offset {
    color: var(--color-text-soft);
    font-size: 0.9em;
    font-variant-numeric: tabular-nums;
  }

  .warn-text {
    color: var(--color-yellow-500);
    font-size: 0.9em;
  }
</style>
