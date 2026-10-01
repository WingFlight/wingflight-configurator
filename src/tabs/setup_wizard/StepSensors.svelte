<script>
  import { getContext, mount, unmount, onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";
  import { have_sensor } from "@/js/serial_backend.js";

  import AutoAlignWizard from "@/tabs/configuration/AutoAlignWizard.svelte";
  import MountTrimAutoWizard from "@/tabs/configuration/MountTrimAutoWizard.svelte";

  const wiz = getContext("setupWizard");

  let tailWheel = $state(null);
  let calibrating = $state(false);
  let calibrated = $state(false);
  let alignmentDirty = $state(false);
  let dialogBusy = $state(false);
  let dialog = null;
  let calibrationTimer;

  let hasAcc = $derived(have_sensor(FC.CONFIG.activeSensors, "acc"));

  function calibrateAccel() {
    if (calibrating) return;
    calibrating = true;
    MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, () => {
      GUI.log($i18n.t("initialSetupAccelCalibStarted"));
    });
    calibrationTimer = setTimeout(() => {
      GUI.log($i18n.t("initialSetupAccelCalibEnded"));
      calibrating = false;
      calibrated = true;
    }, 2000);
  }

  function closeDialog() {
    if (!dialog) return;
    const instance = dialog;
    dialog = null;
    unmount(instance);
  }

  // Same mounting as the Configuration tab's BoardAlignment: on <body>, so
  // the native <dialog> centres on the viewport.
  function openDialog(component) {
    closeDialog();
    dialog = mount(component, {
      target: document.body,
      props: {
        onButtonDisabled: (v) => (dialogBusy = v),
        onDirty: () => {
          alignmentDirty = true;
          wiz.markChanged();
        },
        onClose: closeDialog,
      },
    });
  }

  wiz.setCommit(async () => {
    if (!alignmentDirty) return;
    await MSP.promise(
      MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG,
      mspHelper.crunch(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG),
    );
    await MSP.promise(
      MSPCodes.MSP2_WING_SET_BOARD_MOUNT_TRIM,
      mspHelper.crunch(MSPCodes.MSP2_WING_SET_BOARD_MOUNT_TRIM),
    );
  });

  onDestroy(() => {
    clearTimeout(calibrationTimer);
    dialog?.stop?.();
    closeDialog();
  });
</script>

<p>{$i18n.t("setupWizardSensorsIntro")}</p>

{#if !hasAcc}
  <div class="note">{$i18n.t("setupWizardSensorsNoAcc")}</div>
{/if}

<fieldset class="question">
  <legend>{$i18n.t("setupWizardSensorsTailWheelQuestion")}</legend>
  <label>
    <input type="radio" name="tail-wheel" value={true} bind:group={tailWheel} />
    {$i18n.t("setupWizardYes")}
  </label>
  <label>
    <input
      type="radio"
      name="tail-wheel"
      value={false}
      bind:group={tailWheel}
    />
    {$i18n.t("setupWizardNo")}
  </label>
</fieldset>

{#if tailWheel}
  <div class="note">{$i18n.t("setupWizardSensorsTailWheelNote")}</div>
{/if}

<ol class="tasks">
  <li>
    <div class="task-text">
      <strong>{$i18n.t("setupWizardSensorsAccTitle")}</strong>
      <span>{$i18n.t("setupWizardSensorsAccText")}</span>
    </div>
    <button
      class="btn"
      disabled={!hasAcc || calibrating}
      onclick={calibrateAccel}
    >
      {calibrating
        ? $i18n.t("initialSetupButtonCalibratingText")
        : $i18n.t("initialSetupButtonCalibrateAccel")}
    </button>
    {#if calibrated}
      <span class="done">{$i18n.t("setupWizardDone")}</span>
    {/if}
  </li>
  <li>
    <div class="task-text">
      <strong>{$i18n.t("setupWizardSensorsAlignTitle")}</strong>
      <span>{$i18n.t("setupWizardSensorsAlignText")}</span>
      <span class="values">
        {$i18n.t("setupWizardSensorsAlignValues", {
          1: FC.BOARD_ALIGNMENT_CONFIG.roll,
          2: FC.BOARD_ALIGNMENT_CONFIG.pitch,
          3: FC.BOARD_ALIGNMENT_CONFIG.yaw,
        })}
      </span>
    </div>
    <button
      class="btn"
      disabled={!hasAcc || dialogBusy}
      onclick={() => openDialog(AutoAlignWizard)}
    >
      {$i18n.t("configurationBoardAutoAlignStart")}
    </button>
  </li>
  <li>
    <div class="task-text">
      <strong>{$i18n.t("setupWizardSensorsLevelTitle")}</strong>
      <span>{$i18n.t("setupWizardSensorsLevelText")}</span>
      <span class="values">
        {$i18n.t("setupWizardSensorsLevelValues", {
          1: (FC.BOARD_MOUNT_TRIM.roll / 10).toFixed(1),
          2: (FC.BOARD_MOUNT_TRIM.pitch / 10).toFixed(1),
        })}
      </span>
    </div>
    <button
      class="btn"
      disabled={!hasAcc || dialogBusy}
      onclick={() => openDialog(MountTrimAutoWizard)}
    >
      {$i18n.t("configurationBoardMountTrimAutoStart")}
    </button>
  </li>
</ol>

{#if alignmentDirty}
  <div class="actions">
    <span>{$i18n.t("setupWizardRebootNeeded")}</span>
    <button class="btn primary" onclick={wiz.saveAndReboot}>
      {$i18n.t("buttonSaveReboot")}
    </button>
  </div>
{/if}

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

  .note {
    padding: 8px 12px;
    border-left: 3px solid var(--color-yellow-500);
    background-color: var(--color-surface);
    border-radius: var(--radius-xs);
    max-width: 70ch;
  }

  .question {
    display: flex;
    gap: 16px;
    border: none;
    padding: 0;
    margin: 0;

    legend {
      font-weight: 600;
      margin-bottom: 4px;
    }

    label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    input {
      margin: 0;
    }
  }

  .tasks {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
    }
  }

  .task-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 320px;
    min-width: 0;
  }

  .values {
    color: var(--color-text-soft);
    font-size: 0.9em;
    font-variant-numeric: tabular-nums;
  }

  .done {
    color: var(--color-status-good);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
</style>
