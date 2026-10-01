<script>
  import { getContext, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  import motorState from "@/tabs/motors/state.svelte.js";

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

<p>{$i18n.t("setupWizardMotorIntro")}</p>

<fieldset class="choices">
  <legend>{$i18n.t("setupWizardMotorProtocolTitle")}</legend>
  {#each CHOICES as choice (choice.key)}
    <label>
      <input
        type="radio"
        name="motor-protocol"
        value={choice.key}
        checked={selected === choice.key}
        onchange={() => choose(choice)}
      />
      <span>
        <strong>{$i18n.t(`setupWizardMotor_${choice.key}`)}</strong>
        <span class="muted"
          >{$i18n.t(`setupWizardMotorHelp_${choice.key}`)}</span
        >
      </span>
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
  <section class="test">
    <strong>{$i18n.t("setupWizardMotorTestTitle")}</strong>
    <label class="prop">
      <input type="checkbox" bind:checked={propOff} />
      {$i18n.t("setupWizardMotorPropOff")}
    </label>
    <div class="row">
      <span>{$i18n.t("setupWizardMotorTestThrottle")}</span>
      {#each TEST_THROTTLES as t (t)}
        <label class="throttle">
          <input
            type="radio"
            name="test-throttle"
            value={t}
            bind:group={testThrottle}
            disabled={spinning}
          />
          {t}%
        </label>
      {/each}
    </div>
    <button
      class={["btn", spinning && "primary"]}
      disabled={!propOff || wiz.armed}
      onpointerdown={startSpin}
      onpointerup={stopSpin}
      onpointerleave={stopSpin}
      onpointercancel={stopSpin}
      onkeydown={(e) => (e.key === " " || e.key === "Enter") && startSpin()}
      onkeyup={stopSpin}
      onblur={stopSpin}
    >
      {spinning
        ? $i18n.t("setupWizardMotorSpinning")
        : $i18n.t("setupWizardMotorHoldToSpin")}
    </button>
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

  .choices {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: none;
    margin: 0;
    padding: 0;

    legend {
      font-weight: 600;
      margin-bottom: 4px;
    }

    label {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }

    label > span {
      display: flex;
      flex-direction: column;
    }
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .test {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    max-width: 720px;
  }

  .prop,
  .throttle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
