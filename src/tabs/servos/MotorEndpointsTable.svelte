<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Switch from "@/components/Switch.svelte";
  import WarningNote from "@/components/notes/WarningNote.svelte";

  // Analog PWM motor outputs with their own endpoints (firmware
  // MSP2_WING_MOTOR_ENDPOINTS). Edits are sent on Save, not live: the FC uses
  // a new Off value at once, even disarmed.
  let { motorCount } = $props();

  const PULSE_MIN = 50;
  const PULSE_MAX = 2250;
  // Reversing mirrors every endpoint about this pulse, as for a servo
  const REVERSE_CENTER = 1500;

  let confirmDialogEl;
  let pendingReverse = $state(null);
  let switchKey = $state(0);

  let motorIndices = $derived(
    Array.from(
      { length: Math.min(motorCount, FC.MOTOR_ENDPOINTS?.length ?? 0) },
      (_, index) => index,
    ),
  );

  function isReversed(ends) {
    return ends.minthrottle > ends.maxthrottle;
  }

  function mirror(value) {
    return Math.min(Math.max(2 * REVERSE_CENTER - value, PULSE_MIN), PULSE_MAX);
  }

  // Reversing moves the Off pulse to the other end (e.g. 1000 to 2000us), which
  // is full throttle on a normal ESC, so it is confirmed first. The switches
  // are redrawn when the dialog closes, so a cancelled one flips back.
  function requestReverse(index) {
    pendingReverse = index;
    confirmDialogEl.showModal();
  }

  function applyReverse() {
    const ends = FC.MOTOR_ENDPOINTS[pendingReverse];
    ends.mincommand = mirror(ends.mincommand);
    ends.minthrottle = mirror(ends.minthrottle);
    ends.maxthrottle = mirror(ends.maxthrottle);
    closeDialog();
  }

  function closeDialog() {
    confirmDialogEl.close();
  }

  // Also runs on Escape
  function onDialogClosed() {
    pendingReverse = null;
    switchKey++;
  }
</script>

<div class="warning">
  <WarningNote message="servoMotorEndpointsWarning" />
</div>

<div class="motor-endpoints">
  <div class="header-row">
    <span>{$i18n.t("servoMotorNumber")}</span>
    <span class="header-label">
      <span>{$i18n.t("servoMotorOff")}</span>
      <HelpIcon>{$i18n.t("servoMotorOffHelp")}</HelpIcon>
    </span>
    <span class="header-label">
      <span>{$i18n.t("servoMotorMin")}</span>
      <HelpIcon>{$i18n.t("servoMotorMinHelp")}</HelpIcon>
    </span>
    <span class="header-label">
      <span>{$i18n.t("servoMotorMax")}</span>
      <HelpIcon>{$i18n.t("servoMotorMaxHelp")}</HelpIcon>
    </span>
    <span class="header-label">
      <span>{$i18n.t("servoReverse")}</span>
      <HelpIcon>{$i18n.t("servoMotorReverseHelp")}</HelpIcon>
    </span>
  </div>

  {#each motorIndices as index (index)}
    {@const ends = FC.MOTOR_ENDPOINTS[index]}
    <div class="motor-row">
      <span class="motor-index">M{index + 1}</span>
      <span>
        <NumberInput
          min={PULSE_MIN}
          max={PULSE_MAX}
          bind:value={ends.mincommand}
        />
      </span>
      <span>
        <NumberInput
          min={PULSE_MIN}
          max={PULSE_MAX}
          bind:value={ends.minthrottle}
        />
      </span>
      <span>
        <NumberInput
          min={PULSE_MIN}
          max={PULSE_MAX}
          bind:value={ends.maxthrottle}
        />
      </span>
      <span class="motor-switch">
        {#key switchKey}
          <Switch
            checked={isReversed(ends)}
            onchange={() => requestReverse(index)}
          />
        {/key}
      </span>
    </div>
  {/each}
</div>

<dialog bind:this={confirmDialogEl} onclose={onDialogClosed}>
  <h3>
    {$i18n.t("servoMotorReverseConfirmTitle", { 1: (pendingReverse ?? 0) + 1 })}
  </h3>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  <p>{@html $i18n.t("servoMotorReverseConfirmText")}</p>
  <div class="buttons">
    <button class="btn" onclick={applyReverse}>
      {$i18n.t("servoMotorReverseConfirm")}
    </button>
    <button class="btn" onclick={closeDialog}>
      {$i18n.t("cancel")}
    </button>
  </div>
</dialog>

<style lang="scss">
  .warning {
    margin: 4px 4px 8px;
  }

  .header-row,
  .motor-row {
    display: grid;
    grid-template-columns: 60px repeat(3, 110px) 80px 1fr;
    align-items: center;
    column-gap: 4px;
    padding: 4px;
    text-align: center;
    border-bottom: 1px solid var(--color-border);
  }

  .header-row {
    font-weight: 600;
    font-size: 0.75rem;
    color: var(--color-text-soft);
    background-color: var(--color-surface-float, var(--color-surface));
  }

  .header-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }

  .header-label :global(.container) {
    margin-left: 2px;
  }

  .motor-index {
    font-weight: 600;
  }

  .motor-switch {
    display: flex;
    justify-content: center;
  }

  .btn {
    @extend %button;
  }

  dialog {
    width: 32em;
    border-radius: var(--radius-lg);
  }

  dialog h3 {
    margin-bottom: 0.5em;
  }

  dialog .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 1.5em;
  }
</style>
