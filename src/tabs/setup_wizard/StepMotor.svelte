<script>
  import { getContext, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  import motorState from "@/tabs/motors/state.svelte.js";

  import MotorArt from "./MotorArt.svelte";

  const wiz = getContext("setupWizard");

  // The usual protocols as tiles; anything else (no motor, OneShot, ...) from
  // the Other list. DShot600 is in the list: it is fussy about long, noisy
  // ESC leads. Telemetry, PWM rate and throttle endpoints stay on the Motors
  // tab.
  const CHOICES = [
    { key: "pwm", protocol: "PWM" },
    { key: "dshot150", protocol: "DSHOT150" },
    { key: "dshot300", protocol: "DSHOT300" },
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
  let protocols = $derived(
    motorState.throttleProtocols
      .map((name, index) => ({ name, index }))
      .filter((p) => p.name),
  );
  let changed = $state(false);

  let propOff = $state(false);
  let testThrottle = $state(10);
  let keepalive;

  let motorCount = $derived(FC.CONFIG.motorCount ?? 0);

  function choose(choice) {
    setProtocol(indexOf(choice.protocol));
  }

  function setProtocol(index) {
    if (index < 0 || index === FC.MOTOR_CONFIG.motor_pwm_protocol) return;
    FC.MOTOR_CONFIG.motor_pwm_protocol = index;
    // DShot150 has no bidirectional RPM telemetry, and an ESC that doesn't
    // answer bidirectional requests may not arm, so turn it off. It goes out
    // with MSP_SET_MOTOR_CONFIG on commit.
    if (motorState.isDshot && !motorState.bidirCapable) {
      FC.MOTOR_CONFIG.use_dshot_telemetry = false;
    }
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
  // so a motor runs only while this page keeps sending and the link is up.
  // It also ramps an override at a quarter of the range per second
  // (MOTOR_OVERRIDE_RATE), so full throttle takes four seconds to reach.

  // What is driving the motors now: null, "calibrate" or a motor index. One
  // holder at a time.
  let output = $state(null);

  function send(motors, value) {
    for (const i of motors) {
      FC.MOTOR_OVERRIDE[i] = value;
      mspHelper.sendMotorOverride(i);
    }
  }

  function allMotors() {
    return Array.from({ length: motorCount }, (_, i) => i);
  }

  function hold(holder, motors, value) {
    clearInterval(keepalive);
    output = holder;
    send(motors, value);
    keepalive = setInterval(() => send(motors, value), KEEPALIVE_MS);
  }

  function stopOutput() {
    if (output === null) return;
    output = null;
    clearInterval(keepalive);
    send(allMotors(), 0);
  }

  let canRun = $derived(propOff && !wiz.armed);

  //// Spin, one motor at a time, so a twin shows which motor is which.

  function startSpin(motor) {
    if (!canRun || output !== null) return;
    hold(motor, [motor], testThrottle * 10);
  }

  function stopSpin(motor) {
    if (output === motor) stopOutput();
  }

  //// Calibrate: a PWM ESC learns the throttle range. Full throttle is held
  //// while the battery is plugged in, then low throttle. DShot has no range
  //// to learn.

  const FULL_THROTTLE = 1000; // MOTOR_OVERRIDE_MAX
  // The override ramp from zero to full, and a margin.
  const RAMP_SECONDS = 5;

  let isPwm = $derived(current === "PWM");
  // idle -> full (held at 100 %) -> done
  let calibration = $state("idle");
  let batteryOut = $state(false);
  let fullSeconds = $state(0);
  let fullTimer;

  function startCalibration() {
    if (!canRun || !batteryOut || output !== null) return;
    calibration = "full";
    fullSeconds = 0;
    hold("calibrate", allMotors(), FULL_THROTTLE);
    fullTimer = setInterval(() => (fullSeconds += 1), 1000);
  }

  function endCalibration(done) {
    clearInterval(fullTimer);
    stopOutput();
    calibration = done ? "done" : "idle";
    batteryOut = false;
  }

  // An armed model or a cleared prop-off tick stops it.
  $effect(() => {
    if (calibration === "full" && !canRun) endCalibration(false);
  });

  onDestroy(() => {
    clearInterval(fullTimer);
    stopOutput();
  });
</script>

<div class="intro">
  <MotorArt />
  <p>{$i18n.t("setupWizardMotorIntro")}</p>
</div>

<fieldset class="choices">
  <legend>{$i18n.t("setupWizardMotorProtocolTitle")}</legend>
  {#each CHOICES as choice (choice.key)}
    <label class={["choice", currentChoice === choice.key && "selected"]}>
      <input
        type="radio"
        name="motor-protocol"
        value={choice.key}
        checked={currentChoice === choice.key}
        onchange={() => choose(choice)}
      />
      <span class="choice-name">
        {$i18n.t(`setupWizardMotor_${choice.key}`)}
        {#if currentChoice === choice.key}
          <i class="fas fa-check-circle" aria-hidden="true"></i>
        {/if}
      </span>
      <span class="muted">{$i18n.t(`setupWizardMotorHelp_${choice.key}`)}</span>
    </label>
  {/each}
</fieldset>
<div class="actions">
  <span class="muted">{$i18n.t("setupWizardMotorOther")}</span>
  <select
    value={FC.MOTOR_CONFIG.motor_pwm_protocol}
    onchange={(e) => setProtocol(Number(e.target.value))}
  >
    {#each protocols as p (p.index)}
      <option value={p.index}>{p.name}</option>
    {/each}
  </select>
</div>
{#if current === "DISABLED"}
  <p class="muted">{$i18n.t("setupWizardMotorHelp_none")}</p>
{:else if motorState.isDshot && !motorState.bidirCapable}
  <p class="muted">{$i18n.t("setupWizardMotorDshot150NoRpm")}</p>
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
        <MotorArt propOff spinning={typeof output === "number"} />
      </div>
      <!-- In order: prop off, calibrate a PWM ESC, pick a throttle, hold
           to spin. -->
      <ol class="steps">
        <li>
          <label class="prop">
            <input
              type="checkbox"
              bind:checked={propOff}
              disabled={output !== null}
            />
            {$i18n.t("setupWizardMotorPropOff")}
          </label>
        </li>
        {#if isPwm}
          <li class="calibrate">
            <span class="step-label">
              {$i18n.t("setupWizardMotorCalTitle")}
              {#if calibration === "done"}
                <i class="fas fa-check-circle" aria-hidden="true"></i>
              {/if}
            </span>
            {#if calibration === "full"}
              <span class="cal-text">
                {fullSeconds < RAMP_SECONDS
                  ? $i18n.t("setupWizardMotorCalRamping", {
                      1: RAMP_SECONDS - fullSeconds,
                    })
                  : $i18n.t("setupWizardMotorCalPlugIn")}
              </span>
              <button
                class="btn primary"
                disabled={fullSeconds < RAMP_SECONDS}
                onclick={() => endCalibration(true)}
              >
                {$i18n.t("setupWizardMotorCalLow")}
              </button>
              <button class="btn" onclick={() => endCalibration(false)}>
                {$i18n.t("setupWizardMotorCalCancel")}
              </button>
            {:else}
              <label class="prop">
                <input
                  type="checkbox"
                  bind:checked={batteryOut}
                  disabled={!canRun}
                />
                {$i18n.t("setupWizardMotorCalBatteryOut")}
              </label>
              <button
                class="btn"
                disabled={!canRun || !batteryOut || output !== null}
                onclick={startCalibration}
              >
                {$i18n.t("setupWizardMotorCalFull")}
              </button>
            {/if}
          </li>
        {/if}
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
                  disabled={!canRun || output !== null}
                />
                {t}%
              </label>
            {/each}
          </span>
        </li>
        <li>
          {#each allMotors() as motor (motor)}
            <button
              class={["btn", "spin", output === motor && "primary"]}
              disabled={!canRun || (output !== null && output !== motor)}
              onpointerdown={() => startSpin(motor)}
              onpointerup={() => stopSpin(motor)}
              onpointerleave={() => stopSpin(motor)}
              onpointercancel={() => stopSpin(motor)}
              onkeydown={(e) =>
                (e.key === " " || e.key === "Enter") && startSpin(motor)}
              onkeyup={() => stopSpin(motor)}
              onblur={() => stopSpin(motor)}
            >
              {output === motor
                ? $i18n.t("setupWizardMotorSpinning")
                : motorCount > 1
                  ? $i18n.t("setupWizardMotorHoldMotor", { 1: motor + 1 })
                  : $i18n.t("setupWizardMotorHoldToSpin")}
            </button>
          {/each}
        </li>
      </ol>
    </div>
    {#if isPwm}
      <p class="muted">
        {calibration === "done"
          ? $i18n.t("setupWizardMotorCalDoneHelp")
          : $i18n.t("setupWizardMotorCalHelp")}
      </p>
    {/if}
    <p class="muted">
      {motorCount > 1
        ? $i18n.t("setupWizardMotorTestCheckTwin")
        : $i18n.t("setupWizardMotorTestCheck")}
    </p>
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

    i {
      color: var(--color-status-good);
    }
  }

  .cal-text {
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
    min-width: 180px;
    touch-action: none;
    user-select: none;
  }

  .muted {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
