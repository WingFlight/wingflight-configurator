<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import ServoArt from "./ServoArt.svelte";
  import PulseTrain from "./PulseTrain.svelte";

  const wiz = getContext("setupWizard");

  // Only the update rate differs between the types: every servo centres on
  // a standard 1500 us pulse (narrow-band 760 us servos aren't supported).
  // The rate is one setting for every PWM servo output (servo_pwm_rate).
  const TYPES = [
    { key: "analog", rate: 50 },
    { key: "digital", rate: 333 },
  ];
  const PULSE_WIDTH = 1500;

  function currentType() {
    const rate = FC.MIXER_CONFIG.servo_pwm_rate;
    return TYPES.find((t) => t.rate === rate)?.key ?? null;
  }

  let selected = $state(currentType());
  let applied = $state(false);

  function apply() {
    const type = TYPES.find((t) => t.key === selected);
    if (!type) return;
    FC.MIXER_CONFIG.servo_pwm_rate = type.rate;
    wiz.sendPwmRate();
    applied = true;
  }
</script>

<div class="intro">
  <ServoArt />
  <p>{$i18n.t("setupWizardServoTypeIntro")}</p>
</div>

<fieldset class="types">
  {#each TYPES as type (type.key)}
    <label class={["type", selected === type.key && "selected"]}>
      <input
        type="radio"
        name="servo-type"
        value={type.key}
        bind:group={selected}
      />
      <span class="type-name">
        {$i18n.t(`setupWizardServoType_${type.key}`)}
        {#if selected === type.key}
          <i class="fas fa-check-circle" aria-hidden="true"></i>
        {/if}
      </span>
      <PulseTrain rate={type.rate} width={PULSE_WIDTH} />
      <span class="rate">{type.rate} Hz · {PULSE_WIDTH} µs</span>
      <span class="muted"
        >{$i18n.t(`setupWizardServoTypeHelp_${type.key}`)}</span
      >
    </label>
  {/each}
</fieldset>

<p class="muted">{$i18n.t("setupWizardServoTypeAllSurfaces")}</p>

<div class="actions">
  <button class="btn" disabled={!selected} onclick={apply}>
    {$i18n.t("setupWizardApply")}
  </button>
  {#if applied}
    <span>{$i18n.t("setupWizardRebootNeeded")}</span>
    <button class="btn primary" onclick={wiz.saveAndReboot}>
      {$i18n.t("buttonSaveReboot")}
    </button>
  {/if}
</div>

<style lang="scss">
  .btn {
    @extend %button;
  }

  .btn.primary {
    @extend %button-primary;
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

  //// Type tiles: the radio stays for keyboard and screen readers.

  .types {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    border: none;
    margin: 0;
    padding: 0;
    min-width: 0;
  }

  .type {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
    cursor: pointer;
    transition:
      border-color var(--animation-speed),
      background-color var(--animation-speed),
      box-shadow var(--animation-speed);

    &:hover {
      border-color: var(--color-border);
    }

    &:has(input:focus-visible) {
      box-shadow: 0 0 0 3px var(--color-focus-ring);
    }

    &.selected {
      border-color: var(--color-accent-500);
      background-color: var(--color-accent-soft);
      box-shadow: inset 0 0 0 1px var(--color-accent-500);
    }

    input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
  }

  .type-name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;

    i {
      color: var(--color-accent-500);
    }
  }

  .rate {
    font-size: 0.85em;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
</style>
