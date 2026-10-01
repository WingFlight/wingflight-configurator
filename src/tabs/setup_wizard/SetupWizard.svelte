<script>
  import { onMount, onDestroy, setContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { getTabHelpURL } from "@/js/help";
  import { bit_check, reinitialiseConnection } from "@/js/serial_backend";

  import Page from "@/components/Page.svelte";

  import { surfacesFromRules, AXES } from "./surfaces.js";
  import StepSensors from "./StepSensors.svelte";
  import StepAirframe from "./StepAirframe.svelte";
  import StepServoType from "./StepServoType.svelte";
  import StepCentre from "./StepCentre.svelte";
  import StepDirection from "./StepDirection.svelte";
  import StepLimits from "./StepLimits.svelte";
  import StepThrows from "./StepThrows.svelte";
  import StepUpDown from "./StepUpDown.svelte";
  import StepTravel from "./StepTravel.svelte";
  import StepGyro from "./StepGyro.svelte";
  import StepModes from "./StepModes.svelte";
  import StepFailsafe from "./StepFailsafe.svelte";
  import StepFinish from "./StepFinish.svelte";

  // Order is the procedure: each step relies on the ones before it (the
  // airframe says which servo is which surface, limits come before throws,
  // throws before the tune). See the "Set Up Your Aircraft" docs page.
  const STEPS = [
    { key: "sensors", component: StepSensors },
    { key: "airframe", component: StepAirframe },
    { key: "servoType", component: StepServoType },
    { key: "centre", component: StepCentre },
    { key: "direction", component: StepDirection },
    { key: "limits", component: StepLimits },
    { key: "throws", component: StepThrows },
    { key: "upDown", component: StepUpDown },
    { key: "travel", component: StepTravel },
    { key: "gyro", component: StepGyro },
    { key: "modes", component: StepModes },
    { key: "failsafe", component: StepFailsafe },
    { key: "finish", component: StepFinish },
  ];

  const STEP_STORAGE_KEY = "setupWizardStep";
  const PWM_SERVO_SLOTS = 8;
  const SERVO_OVERRIDE_OFF = 2001;

  let loading = $state(true);
  let stepIndex = $state(readStoredStep());
  let pending = $state(false);
  let saving = $state(false);
  let armed = $state(false);
  let commitFn = null;
  let leaveFn = null;
  let snapshot = null;
  let poller;

  function readStoredStep() {
    try {
      const value = parseInt(localStorage.getItem(STEP_STORAGE_KEY), 10);
      return value >= 0 && value < STEPS.length ? value : 0;
    } catch {
      return 0;
    }
  }

  function storeStep(index) {
    try {
      localStorage.setItem(STEP_STORAGE_KEY, String(index));
    } catch {
      // Remembering the step is a convenience only.
    }
  }

  // PWM servos only: mixer output N drives FC.SERVO_CONFIG[N - 1] and servo
  // override N - 1 directly. Bus servos use a different index scheme and are
  // left to the Servos tab.
  let servoCount = $derived(
    Math.min(
      FC.CONFIG.servoCount ?? 0,
      PWM_SERVO_SLOTS,
      FC.SERVO_CONFIG.length,
    ),
  );

  let surfaces = $derived(surfacesFromRules(FC.MIXER_RULES, servoCount));

  let axisGains = $derived(
    Object.fromEntries(
      AXES.map((a) => [a.key, (FC.MIXER_INPUTS[a.input]?.rate ?? 1000) / 1000]),
    ),
  );

  function takeSnapshot() {
    snapshot = $state.snapshot({
      SERVO_CONFIG: FC.SERVO_CONFIG,
      MIXER_INPUTS: FC.MIXER_INPUTS,
      MIXER_RULES: FC.MIXER_RULES,
      MIXER_CONFIG: FC.MIXER_CONFIG,
    });
  }

  function isArmed() {
    const index = FC.AUX_CONFIG.indexOf("ARM");
    return index >= 0 && bit_check(FC.CONFIG.mode, index);
  }

  onMount(async () => {
    await MSP.promise(MSPCodes.MSP_STATUS);
    await MSP.promise(MSPCodes.MSP_BOXNAMES);
    await MSP.promise(MSPCodes.MSP_BOXIDS);
    await MSP.promise(MSPCodes.MSP_MODE_RANGES);
    await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
    await MSP.promise(MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG);
    await MSP.promise(MSPCodes.MSP2_WING_BOARD_MOUNT_TRIM);
    await MSP.promise(MSPCodes.MSP_RX_MAP);
    await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
    await MSP.promise(MSPCodes.MSP_MIXER_INPUTS);
    await MSP.promise(MSPCodes.MSP_MIXER_RULES);
    await MSP.promise(MSPCodes.MSP_MIXER_OVERRIDE);
    await MSP.promise(MSPCodes.MSP_SERVO_CONFIGURATIONS);
    await MSP.promise(MSPCodes.MSP_SERVO_OVERRIDE);
    await MSP.promise(MSPCodes.MSP_SERVO);

    while (FC.MIXER_RULES.length < Mixer.RULE_COUNT) {
      FC.MIXER_RULES.push(Mixer.nullRule());
    }

    takeSnapshot();
    armed = isArmed();
    loading = false;

    poller = setInterval(async () => {
      await MSP.promise(MSPCodes.MSP_SERVO);
      await MSP.promise(MSPCodes.MSP_STATUS);
      armed = isArmed();
    }, 200);
  });

  onDestroy(() => {
    clearInterval(poller);
    leaveFn?.();
    releaseAll();
  });

  //// Overrides. The FC ignores both kinds while armed (flight/mixer.c
  //// mixerSetInput(), flight/servos.c servoUpdate()).

  function holdAxes(values) {
    for (const axis of AXES) {
      const value = values[axis.key] ?? 0;
      FC.MIXER_OVERRIDE[axis.input] = Math.round(value * 1000);
      mspHelper.sendMixerOverride(axis.input);
    }
  }

  function releaseAxes() {
    for (const axis of AXES) {
      if (FC.MIXER_OVERRIDE[axis.input] === Mixer.OVERRIDE_OFF) continue;
      FC.MIXER_OVERRIDE[axis.input] = Mixer.OVERRIDE_OFF;
      mspHelper.sendMixerOverride(axis.input);
    }
  }

  function holdServo(servo, raw) {
    FC.SERVO_OVERRIDE[servo] = Math.max(-2000, Math.min(2000, Math.round(raw)));
    mspHelper.sendServoOverride(servo);
  }

  function releaseServo(servo) {
    if (FC.SERVO_OVERRIDE[servo] === SERVO_OVERRIDE_OFF) return;
    FC.SERVO_OVERRIDE[servo] = SERVO_OVERRIDE_OFF;
    mspHelper.sendServoOverride(servo);
  }

  function releaseServos() {
    for (let i = 0; i < servoCount; i++) {
      releaseServo(i);
    }
  }

  function releaseAll() {
    releaseAxes();
    releaseServos();
  }

  //// Live changes. Every edit goes to the FC straight away so the surface
  //// moves; Save writes them to EEPROM.

  function sendServo(servo) {
    mspHelper.sendServoConfig(servo);
    pending = true;
  }

  function axisGainPercent(axisKey) {
    const axis = AXES.find((a) => a.key === axisKey);
    return Math.round(Math.abs(FC.MIXER_INPUTS[axis.input]?.rate ?? 0) / 10);
  }

  function setAxisGainPercent(axisKey, percent) {
    const axis = AXES.find((a) => a.key === axisKey);
    const input = FC.MIXER_INPUTS[axis.input];
    if (!input) return;
    const sign = input.rate < 0 ? -1 : 1;
    input.rate = sign * percent * 10;
    mspHelper.sendMixerInput(axis.input);
    pending = true;
  }

  function invertAxis(axisKey) {
    const axis = AXES.find((a) => a.key === axisKey);
    const input = FC.MIXER_INPUTS[axis.input];
    if (!input) return;
    input.rate = -input.rate;
    mspHelper.sendMixerInput(axis.input);
    pending = true;
  }

  function markChanged() {
    pending = true;
  }

  async function save() {
    saving = true;
    try {
      if (commitFn) {
        await commitFn();
      }
      await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
      GUI.log($i18n.t("eepromSaved"));
      pending = false;
      takeSnapshot();
    } finally {
      saving = false;
    }
  }

  // Steps whose settings only apply after a reboot (servo rate, board
  // alignment). The Configurator reconnects on its own tab afterwards, so
  // the wizard remembers to resume at the next step.
  async function saveAndReboot() {
    await save();
    storeStep(Math.min(stepIndex + 1, STEPS.length - 1));
    MSP.send_message(MSPCodes.MSP_SET_REBOOT);
    GUI.log($i18n.t("deviceRebooting"));
    reinitialiseConnection();
  }

  async function revert() {
    if (!snapshot) return;
    FC.SERVO_CONFIG = snapshot.SERVO_CONFIG;
    FC.MIXER_INPUTS = snapshot.MIXER_INPUTS;
    FC.MIXER_RULES = snapshot.MIXER_RULES;
    Object.assign(FC.MIXER_CONFIG, snapshot.MIXER_CONFIG);
    await new Promise((resolve) => mspHelper.sendServoConfigurations(resolve));
    await new Promise((resolve) => mspHelper.sendMixerInputs(resolve));
    await new Promise((resolve) => mspHelper.sendMixerRules(resolve));
    await new Promise((resolve) => mspHelper.sendMixerConfig(resolve));
    pending = false;
  }

  function openTab(tabName) {
    document
      .querySelector(`#tabs ul.mode-connected .tab_${tabName} a`)
      ?.click();
  }

  // Shared with every step component.
  setContext("setupWizard", {
    get surfaces() {
      return surfaces;
    },
    get servoCount() {
      return servoCount;
    },
    get axisGains() {
      return axisGains;
    },
    get armed() {
      return armed;
    },
    holdAxes,
    releaseAxes,
    holdServo,
    releaseServo,
    releaseServos,
    sendServo,
    axisGainPercent,
    setAxisGainPercent,
    invertAxis,
    markChanged,
    saveAndReboot,
    openTab,
    // A step that stages edits instead of sending them live registers how to
    // send them; Save runs it before the EEPROM write.
    setCommit(fn) {
      commitFn = fn;
    },
    // Runs when the step is left (another step, another tab), e.g. to put
    // back temporarily widened servo limits.
    setLeave(fn) {
      leaveFn = fn;
    },
    surfaceLabel(surface) {
      return $i18n.t("setupWizardSurfaceLabel", {
        1: surface.servo + 1,
        2: $i18n.t(`setupWizardSurface_${surface.kind}`),
      });
    },
  });

  function goTo(index) {
    if (index === stepIndex || index < 0 || index >= STEPS.length) return;
    leaveFn?.();
    leaveFn = null;
    commitFn = null;
    releaseAll();
    stepIndex = index;
    storeStep(index);
  }

  async function next() {
    if (pending) {
      await save();
    }
    goTo(stepIndex + 1);
  }

  function onClickHelp() {
    window.open(getTabHelpURL("tabSetupWizard"), "_system");
  }

  export function isDirty() {
    return pending;
  }

  export async function onSave() {
    await save();
  }

  export async function onRevert() {
    await revert();
  }

  let Current = $derived(STEPS[stepIndex].component);
</script>

{#snippet header()}
  <h1>{$i18n.t("tabSetupWizard")}</h1>
  <div class="grow"></div>
  <button class="btn help-btn" onclick={onClickHelp}>
    {$i18n.t("buttonHelp")}
  </button>
{/snippet}

<Page {header} {loading}>
  <div class="layout">
    <nav class="steps" aria-label={$i18n.t("tabSetupWizard")}>
      <ol>
        {#each STEPS as step, i (step.key)}
          <li>
            <button
              class={[
                "step",
                i === stepIndex && "active",
                i < stepIndex && "done",
              ]}
              aria-current={i === stepIndex ? "step" : undefined}
              onclick={() => goTo(i)}
            >
              <span class="number">{i + 1}</span>
              <span class="label">{$i18n.t(`setupWizardStep_${step.key}`)}</span
              >
            </button>
          </li>
        {/each}
      </ol>
    </nav>

    <div class="content">
      {#if armed}
        <div class="banner warn">{$i18n.t("setupWizardArmedWarning")}</div>
      {/if}
      {#if servoCount === 0}
        <div class="banner">{$i18n.t("setupWizardNoServos")}</div>
      {/if}

      <h2>
        {$i18n.t("setupWizardStepCounter", {
          1: stepIndex + 1,
          2: STEPS.length,
        })}
        · {$i18n.t(`setupWizardStep_${STEPS[stepIndex].key}`)}
      </h2>

      {#key stepIndex}
        <div class="step-body">
          <Current />
        </div>
      {/key}

      <div class="footer">
        <button
          class="btn"
          disabled={stepIndex === 0}
          onclick={() => goTo(stepIndex - 1)}
        >
          {$i18n.t("setupWizardBack")}
        </button>
        <div class="grow"></div>
        {#if pending}
          <span class="unsaved">{$i18n.t("setupWizardUnsaved")}</span>
        {/if}
        {#if stepIndex < STEPS.length - 1}
          <button class="btn primary" disabled={saving} onclick={next}>
            {pending
              ? $i18n.t("setupWizardSaveNext")
              : $i18n.t("setupWizardNext")}
          </button>
        {:else if pending}
          <button class="btn primary" disabled={saving} onclick={save}>
            {$i18n.t("buttonSave")}
          </button>
        {/if}
      </div>
    </div>
  </div>
</Page>

<style lang="scss">
  .btn {
    @extend %button;
  }

  .btn.primary {
    @extend %button-primary;
  }

  .grow {
    flex: 1;
  }

  .layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: var(--section-gap);
    align-items: start;
  }

  .steps ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-soft);
    text-align: left;
    cursor: pointer;
    font: inherit;

    &:hover {
      background-color: var(--color-hover);
    }

    &.active {
      background-color: var(--color-surface);
      color: var(--color-text);
      font-weight: 600;
    }

    &.done .number {
      background-color: var(--color-accent-500);
      color: var(--color-neutral-100);
    }
  }

  .number {
    flex: 0 0 22px;
    height: 22px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85em;
    font-variant-numeric: tabular-nums;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: var(--section-gap);
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.25em;
  }

  .step-body {
    display: flex;
    flex-direction: column;
    gap: var(--section-gap);
  }

  .banner {
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);

    &.warn {
      border-color: var(--color-yellow-500);
    }
  }

  .footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--color-border);
  }

  .unsaved {
    color: var(--color-text-soft);
    font-size: 0.9em;
  }
</style>
