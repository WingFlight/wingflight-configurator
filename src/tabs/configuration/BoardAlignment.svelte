<script>
  import { mount, unmount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import HelpIcon from "@/components/HelpIcon.svelte";
  import NumberInput from "@/components/NumberInput.svelte";
  import Select from "@/components/Select.svelte";

  import AutoAlignWizard from "./AutoAlignWizard.svelte";
  import MountTrimAutoWizard from "./MountTrimAutoWizard.svelte";
  import { SENSOR_ALIGNMENTS } from "./util.js";

  let { magHardwareEnabled, onDirty, onModelPollingPausedChange } = $props();

  let magAlignOptions = $derived([
    { value: 0, label: $i18n.t("configurationSensorAlignmentDefaultOption") },
    ...SENSOR_ALIGNMENTS.map((label, i) => ({ value: i + 1, label })),
  ]);

  let autoAlignDisabled = $state(false);
  let mountTrimAutoDisabled = $state(false);
  let autoAlignWizardInstance = null;
  let mountTrimAutoWizardInstance = null;

  // Both wizards poll their own MSP2_WING_BOARD_*_AUTO status every 250ms
  // while open. Pausing the 3D model's MSP_ATTITUDE poll for that window
  // avoids contending with that traffic on a real (non-instant) serial
  // link, which previously showed up as edits to the roll/pitch/yaw/trim
  // fields getting clobbered mid-interaction.
  function updateModelPollingPaused() {
    onModelPollingPausedChange?.(
      !!autoAlignWizardInstance || !!mountTrimAutoWizardInstance,
    );
  }

  function closeAutoAlignWizard() {
    if (!autoAlignWizardInstance) return;
    const instance = autoAlignWizardInstance;
    autoAlignWizardInstance = null;
    unmount(instance);
    updateModelPollingPaused();
  }

  function closeMountTrimAutoWizard() {
    if (!mountTrimAutoWizardInstance) return;
    const instance = mountTrimAutoWizardInstance;
    mountTrimAutoWizardInstance = null;
    unmount(instance);
    updateModelPollingPaused();
  }

  function onClickAutoAlign() {
    closeAutoAlignWizard();
    // A native <dialog>'s built-in centering resolves against the nearest
    // ancestor with a transform, and #content has a (no-op) transform
    // applied as a long-standing Mac freeze fix. Mounting to <body> (rather
    // than nesting the dialog under #content) avoids that so showModal()
    // centers on the real viewport.
    autoAlignWizardInstance = mount(AutoAlignWizard, {
      target: document.body,
      props: {
        onButtonDisabled: (v) => (autoAlignDisabled = v),
        onDirty,
        onClose: closeAutoAlignWizard,
      },
    });
    updateModelPollingPaused();
  }

  function onClickMountTrimAuto() {
    closeMountTrimAutoWizard();
    mountTrimAutoWizardInstance = mount(MountTrimAutoWizard, {
      target: document.body,
      props: {
        onButtonDisabled: (v) => (mountTrimAutoDisabled = v),
        onDirty,
        onClose: closeMountTrimAutoWizard,
      },
    });
    updateModelPollingPaused();
  }

  function decidegreesToDegrees(value) {
    return value / 10;
  }

  function degreesToDecidegrees(value) {
    return Math.round(Number(value) * 10);
  }

  function onClickResetMountTrim() {
    FC.BOARD_MOUNT_TRIM.roll = 0;
    FC.BOARD_MOUNT_TRIM.pitch = 0;
    FC.BOARD_MOUNT_TRIM.yaw = 0;
  }

  export function cleanup() {
    autoAlignWizardInstance?.stop();
    mountTrimAutoWizardInstance?.stop();
    closeAutoAlignWizard();
    closeMountTrimAutoWizard();
  }
</script>

<div class="section-title">
  <span>{$i18n.t("configurationBoardAlignmentSectionTitle")}</span>
  <HelpIcon>{$i18n.t("configurationBoardAlignmentSectionHelp")}</HelpIcon>
</div>

<div class="row">
  <div class="inputs">
    <label class="axis">
      <NumberInput
        bind:value={FC.BOARD_ALIGNMENT_CONFIG.roll}
        min={-180}
        max={360}
        step={1}
      />
      <span class="icon roll"></span>
      <span>{$i18n.t("configurationBoardAlignmentRoll")}</span>
    </label>
    <label class="axis">
      <NumberInput
        bind:value={FC.BOARD_ALIGNMENT_CONFIG.pitch}
        min={-180}
        max={360}
        step={1}
      />
      <span class="icon pitch"></span>
      <span>{$i18n.t("configurationBoardAlignmentPitch")}</span>
    </label>
    <label class="axis">
      <NumberInput
        bind:value={FC.BOARD_ALIGNMENT_CONFIG.yaw}
        min={-180}
        max={360}
        step={1}
      />
      <span class="icon yaw"></span>
      <span>{$i18n.t("configurationBoardAlignmentYaw")}</span>
    </label>
  </div>

  <div class="auto-align">
    <button class="btn" disabled={autoAlignDisabled} onclick={onClickAutoAlign}>
      {$i18n.t("configurationBoardAutoAlignStart")}
    </button>
    <HelpIcon>{$i18n.t("configurationBoardAutoAlignHelp")}</HelpIcon>
  </div>
</div>

<div class="mount-trim">
  <div class="section-title">
    <span>{$i18n.t("configurationBoardMountTrim")}</span>
    <HelpIcon>{$i18n.t("configurationBoardMountTrimHelp")}</HelpIcon>
  </div>

  <div class="row">
    <div class="inputs">
      <label class="axis">
        <NumberInput
          bind:value={
            () => decidegreesToDegrees(FC.BOARD_MOUNT_TRIM.roll),
            (v) => (FC.BOARD_MOUNT_TRIM.roll = degreesToDecidegrees(v))
          }
          min={-360}
          max={360}
          step={0.1}
        />
        <span class="icon roll"></span>
        <span>{$i18n.t("configurationBoardMountTrimRoll")}</span>
      </label>
      <label class="axis">
        <NumberInput
          bind:value={
            () => decidegreesToDegrees(FC.BOARD_MOUNT_TRIM.pitch),
            (v) => (FC.BOARD_MOUNT_TRIM.pitch = degreesToDecidegrees(v))
          }
          min={-360}
          max={360}
          step={0.1}
        />
        <span class="icon pitch"></span>
        <span>{$i18n.t("configurationBoardMountTrimPitch")}</span>
      </label>
      <label class="axis">
        <NumberInput
          bind:value={
            () => decidegreesToDegrees(FC.BOARD_MOUNT_TRIM.yaw),
            (v) => (FC.BOARD_MOUNT_TRIM.yaw = degreesToDecidegrees(v))
          }
          min={-360}
          max={360}
          step={0.1}
        />
        <span class="icon yaw"></span>
        <span>{$i18n.t("configurationBoardMountTrimYaw")}</span>
      </label>
    </div>

    <div class="auto-align">
      <button
        class="btn"
        disabled={mountTrimAutoDisabled}
        onclick={onClickMountTrimAuto}
      >
        {$i18n.t("configurationBoardMountTrimAutoStart")}
      </button>
      <HelpIcon>{$i18n.t("configurationBoardMountTrimAutoHelp")}</HelpIcon>
      <button class="btn" onclick={onClickResetMountTrim}>
        {$i18n.t("configurationBoardMountTrimReset")}
      </button>
    </div>
  </div>
</div>

{#if magHardwareEnabled}
  <div class="mag-align">
    <div class="section-title">
      <span>{$i18n.t("configurationSensorAlignmentMag")}</span>
    </div>
    <Select
      id="mag-align"
      bind:value={FC.SENSOR_ALIGNMENT.align_mag}
      options={magAlignOptions}
    />
  </div>
{/if}

<style lang="scss">
  .btn {
    @extend %button;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    color: var(--color-text-soft);
    font-size: 0.7rem;
    font-weight: 600;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 20px;
  }

  .inputs {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .axis {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
  }

  .icon {
    width: 15px;
    height: 15px;
    background-repeat: no-repeat;
    background-position: center;

    &.roll {
      background-image: url(/images/icons/cf_icon_roll.svg);
    }
    &.pitch {
      background-image: url(/images/icons/cf_icon_pitch.svg);
    }
    &.yaw {
      background-image: url(/images/icons/cf_icon_yaw.svg);
    }
  }

  .auto-align {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .mount-trim {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dotted var(--color-border);

    :global(input) {
      width: 5em;
    }
  }

  .mag-align {
    margin-top: 8px;
    padding-top: 4px;
    border-top: 1px dotted var(--color-border);
  }

  // The Select component has no <style> of its own, so Svelte's scoping
  // can't reach its internal <select> from here without :global().
  .mag-align :global(select) {
    height: 1.5rem;
    min-width: 120px;
    padding: 0 4px;
    border-radius: 2px;
    border: 1px solid var(--color-border-soft);
    background-color: var(--color-input-bg);
    color: var(--color-text);
  }
</style>
