<script>
  import { getContext, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  import motorState from "@/tabs/motors/state.svelte.js";

  import MotorArt from "./MotorArt.svelte";

  const wiz = getContext("setupWizard");

  // The normal choices only. Telemetry, PWM rate, throttle endpoints and the
  // rarer protocols (OneShot, SRXL2, ...) stay on the Motors tab.
  const CHOICES = [
    { key: "pwm", protocol: "PWM" },
    { key: "dshot300", protocol: "DSHOT300" },
    { key: "dshot600", protocol: "DSHOT600" },
    { key: "none", protocol: "DISABLED" },
  ];

  // Spin test throttle choices (percent), all low: this is a direction and
  // response check with the propeller off.
  const TEST_THROTTLES = [5, 10, 20];
  const KEEPALIVE_MS = 250;

  function indexOf(protocol) {
    return motorState.throttleProtocols.indexOf(protocol);
  }

  let current = $derived(
    motorState.throttleProtocols[FC.MOTOR_CONFIG.motor_pwm_protocol],
  );
  let currentChoice = $derived(
    CHOICES.find((c) => c.protocol === current)?.key ?? null,
  );
  let selected = $state(null);
  let changed = $state(false);

  let propOff = $state(false);
  let testThrottle = $state(10);
  let spinning = $state(false);
  let keepalive;

  let motorCount = $derived(FC.CONFIG.motorCount ?? 0);

  $effect(() => {
    if (selected === null) selected = currentChoice;
  });

  function choose(choice) {
    selected = choice.key;
    const index = indexOf(choice.protocol);
    if (index < 0 || index === FC.MOTOR_CONFIG.motor_pwm_protocol) return;
    FC.MOTOR_CONFIG.motor_pwm_protocol = index;
    changed = true;
    wiz.markChanged();
  }

  wiz.setCommit(async () => {
    if (!changed) return;
    await MSP.promise(
      MSPCodes.MSP_SET_MOTOR_CONFIG,
      mspHelper.crunch(MSPCodes.MSP_SET_MOTOR_CONFIG),
    );
  });

  // The FC drops a motor override 1 s after the last one it received
  // (MOTOR_OVERRIDE_TIMEOUT in flight/motors.h) and ignores it while armed,
  // so the motor runs only while the button is held and the link is up.
  function setAll(value) {
    for (let i = 0; i < motorCount; i++) {
      FC.MOTOR_OVERRIDE[i] = value;
      mspHelper.sendMotorOverride(i);
    }
  }

  function startSpin() {
    if (!propOff || spinning || wiz.armed) return;
    spinning = true;
    setAll(testThrottle * 10);
    keepalive = setInterval(() => setAll(testThrottle * 10), KEEPALIVE_MS);
  }

  function stopSpin() {
    if (!spinning) return;
    spinning = false;
    clearInterval(keepalive);
    setAll(0);
  }

  onDestroy(stopSpin);
</script>

<div class="intro">
  <MotorArt />
  <p>{$i18n.t("setupWizardMotorIntro")}</p>
</div>

<fieldset class="choices">
  <legend>{$i18n.t("setupWizardMotorProtocolTitle")}</legend>
  {#each CHOICES as choice (choice.key)}
    <label class={["choice", selected === choice.key && "selected"]}>
      <input
        type="radio"
        name="motor-protocol"
        value={choice.key}
        checked={selected === choice.key}
        onchange={() => choose(choice)}
      />
      <span class="choice-name">
        {$i18n.t(`setupWizardMotor_${choice.key}`)}
        {#if selected === choice.key}
          <i class="fas fa-check-circle" aria-hidden="true"></i>
        {/if}
      </span>
      <span class="muted">{$i18n.t(`setupWizardMotorHelp_${choice.key}`)}</span>
    </label>
  {/each}
</fieldset>
{#if !currentChoice && current}
  <p class="muted">{$i18n.t("setupWizardMotorOther", { 1: current })}</p>
{/if}

{#if changed}
  <div class="actions">
    <span>{$i18n.t("setupWizardRebootNeeded")}</span>
    <button class="btn primary" onclick={wiz.saveAndReboot}>
      {$i18n.t("buttonSaveReboot")}
    </button>
  </div>
{:else if current !== "DISABLED" && motorCount > 0}
  <section class={["test", propOff && "confirmed"]}>
    <strong>{$i18n.t("setupWizardMotorTestTitle")}</strong>
    <div class="test-body">
      <div class="art">
        <MotorArt propOff {spinning} />
      </div>
      <!-- In order: prop off, pick a throttle, hold to spin. -->
      <ol class="steps">
        <li>
          <label class="prop">
            <input type="checkbox" bind:checked={propOff} />
            {$i18n.t("setupWizardMotorPropOff")}
          </label>
        </li>
        <li>
          <span class="step-label"
            >{$i18n.t("setupWizardMotorTestThrottle")}</span
          >
          <span class="segments">
            {#each TEST_THROTTLES as t (t)}
              <label class={["segment", testThrottle === t && "selected"]}>
                <input
                  type="radio"
                  name="test-throttle"
                  value={t}
                  bind:group={testThrottle}
                  disabled={!propOff || spinning}
                />
                {t}%
              </label>
            {/each}
          </span>
        </li>
        <li>
          <button
            class={["btn", "spin", spinning && "primary"]}
            disabled={!propOff || wiz.armed}
            onpointerdown={startSpin}
            onpointerup={stopSpin}
            onpointerleave={stopSpin}
            onpointercancel={stopSpin}
            onkeydown={(e) =>
              (e.key === " " || e.key === "Enter") && startSpin()}
            onkeyup={stopSpin}
            onblur={stopSpin}
          >
            {spinning
              ? $i18n.t("setupWizardMotorSpinning")
              : $i18n.t("setupWizardMotorHoldToSpin")}
          </button>
        </li>
      </ol>
    </div>
    <p class="muted">{$i18n.t("setupWizardMotorTestCheck")}</p>
  </section>
{/if}

<div>
  <button class="btn" onclick={() => wiz.openTab("motors")}>
    {$i18n.t("setupWizardOpenMotors")}
  </button>
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

  //// Protocol tiles: the radio stays for keyboard and screen readers.

  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    border: none;
    margin: 0;
    padding: 0;
    min-width: 0;

    legend {
      font-weight: 600;
      margin-bottom: 8px;
      padding: 0;
    }
  }

  .choice {
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

  .choice-name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;

    i {
      color: var(--color-accent-500);
    }
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  //// Spin test: the picture on the left, the three actions in order on the
  //// right. The whole panel is a warning until the prop-off box is ticked.

  .test {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 18px;
    border: 1px solid var(--color-status-bad);
    border-radius: var(--radius-md);
    background-color: color-mix(
      in srgb,
      var(--color-status-bad) 6%,
      var(--color-surface-sunken)
    );
    transition:
      border-color var(--animation-speed),
      background-color var(--animation-speed);

    &.confirmed {
      border-color: var(--color-border-soft);
      background-color: var(--color-surface-sunken);
    }
  }

  .test-body {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 32px;
  }

  .art {
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: step;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      counter-increment: step;

      &::before {
        content: counter(step);
        display: inline-grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border: 1px solid var(--color-border);
        border-radius: 50%;
        font-size: 0.8em;
        font-weight: 600;
        color: var(--color-text-soft);
      }
    }
  }

  .confirmed .steps li:first-child::before {
    content: "\2713";
    border-color: var(--color-status-good);
    color: var(--color-status-good);
  }

  .prop {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }

  .step-label {
    font-weight: 600;
  }

  // Throttle as a segmented control; the radios stay for the keyboard.
  .segments {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .segment {
    position: relative;
    padding: 4px 14px;
    cursor: pointer;
    font-variant-numeric: tabular-nums;

    & + & {
      border-left: 1px solid var(--color-border);
    }

    &.selected {
      background-color: var(--color-accent-500);
      color: #fff;
    }

    &:has(input:disabled) {
      cursor: default;
      opacity: 0.6;
    }

    &:has(input:focus-visible) {
      box-shadow: inset 0 0 0 2px var(--color-focus-ring);
    }

    input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
  }

  .spin {
    min-width: 200px;
    touch-action: none;
    user-select: none;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
