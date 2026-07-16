<script>
  import { onMount } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSP } from "@/js/msp.svelte.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  let { onButtonDisabled, onDirty, onClose } = $props();

  const BOARD_MOUNT_TRIM_AUTO = {
    IDLE: 0,
    SAMPLING: 1,
    SUCCESS: 2,
    REJECTED_ARMED: 3,
    REJECTED_UNCALIBRATED: 4,
    TIMEOUT: 5,
    OUT_OF_RANGE: 6,
  };

  let dialogEl;
  let wizardStep = $state("");
  let wizardDetail = $state("");
  let wizardProgress = $state(0);
  let canRetry = $state(false);
  let canCalibrate = $state(false);

  let pollTimer;
  let autoCloseTimer;

  function t(key, args = []) {
    const params = {};
    args.forEach((value, i) => (params[i + 1] = value));
    return $i18n.t(key, params);
  }

  function setWizard(
    stepKey,
    detailKey,
    progressPercent,
    detailArgs = [],
    retry = false,
    calibrate = false,
  ) {
    wizardStep = t(stepKey);
    wizardDetail = t(detailKey, detailArgs);
    wizardProgress = progressPercent;
    canRetry = retry;
    canCalibrate = calibrate;
  }

  function clearPoll() {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  function clearAutoClose() {
    clearInterval(autoCloseTimer);
    autoCloseTimer = null;
  }

  function startAutoCloseCountdown(rollDeg, pitchDeg, seconds = 3) {
    clearAutoClose();

    let remaining = seconds;
    setWizard(
      "configurationBoardMountTrimAutoWizardStep2",
      "configurationBoardMountTrimAutoSuccessCountdown",
      100,
      [rollDeg, pitchDeg, remaining],
    );

    autoCloseTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearAutoClose();
        dialogEl.close();
        onClose();
        return;
      }

      setWizard(
        "configurationBoardMountTrimAutoWizardStep2",
        "configurationBoardMountTrimAutoSuccessCountdown",
        100,
        [rollDeg, pitchDeg, remaining],
      );
    }, 1000);
  }

  function onQueryFailed() {
    setWizard(
      "configurationBoardMountTrimAutoWizardStep2",
      "configurationBoardMountTrimAutoUnsupported",
      100,
    );
    onButtonDisabled(false);
    clearPoll();
  }

  async function queryBoardMountTrimAuto(startProcedure = false) {
    const payload = startProcedure ? [1] : false;
    const { data } = await MSP.promise(
      MSPCodes.MSP2_WING_BOARD_MOUNT_TRIM_AUTO,
      payload,
    );

    if (!data || data.byteLength < 6) {
      clearAutoClose();
      onButtonDisabled(true);
      setWizard(
        "configurationBoardMountTrimAutoWizardStep2",
        "configurationBoardMountTrimAutoUnsupported",
        100,
      );
      clearPoll();
      return;
    }

    const state = data.readU8();
    const rollTrimDecidegrees = data.read16();
    const pitchTrimDecidegrees = data.read16();
    const stabilityPercent = data.readU8();

    if (state === BOARD_MOUNT_TRIM_AUTO.SAMPLING) {
      clearAutoClose();
      setWizard(
        "configurationBoardMountTrimAutoWizardStep1",
        "configurationBoardMountTrimAutoSampling",
        Math.max(10, stabilityPercent),
      );
      onButtonDisabled(true);
      clearPoll();
      pollTimer = setTimeout(() => {
        queryBoardMountTrimAuto(false).catch(onQueryFailed);
      }, 250);
      return;
    }

    onButtonDisabled(false);
    clearPoll();

    if (state === BOARD_MOUNT_TRIM_AUTO.SUCCESS) {
      FC.BOARD_MOUNT_TRIM.roll = rollTrimDecidegrees;
      FC.BOARD_MOUNT_TRIM.pitch = pitchTrimDecidegrees;

      const rollDeg = rollTrimDecidegrees / 10;
      const pitchDeg = pitchTrimDecidegrees / 10;

      startAutoCloseCountdown(rollDeg, pitchDeg, 3);
      onDirty?.();
      return;
    }

    if (state === BOARD_MOUNT_TRIM_AUTO.REJECTED_ARMED) {
      clearAutoClose();
      setWizard(
        "configurationBoardMountTrimAutoWizardStep1",
        "configurationBoardMountTrimAutoDisarmRequired",
        100,
        [],
        true,
      );
      return;
    }

    if (state === BOARD_MOUNT_TRIM_AUTO.REJECTED_UNCALIBRATED) {
      clearAutoClose();
      setWizard(
        "configurationBoardMountTrimAutoWizardStep1",
        "configurationBoardMountTrimAutoUncalibrated",
        100,
        [],
        false,
        true,
      );
      return;
    }

    if (state === BOARD_MOUNT_TRIM_AUTO.TIMEOUT) {
      clearAutoClose();
      setWizard(
        "configurationBoardMountTrimAutoWizardStep1",
        "configurationBoardMountTrimAutoTimeout",
        100,
        [],
        true,
      );
      return;
    }

    if (state === BOARD_MOUNT_TRIM_AUTO.OUT_OF_RANGE) {
      clearAutoClose();
      setWizard(
        "configurationBoardMountTrimAutoWizardStep2",
        "configurationBoardMountTrimAutoOutOfRange",
        100,
        [],
        true,
      );
      return;
    }

    clearAutoClose();
    setWizard(
      "configurationBoardMountTrimAutoWizardStep1",
      "configurationBoardMountTrimAutoIdle",
      0,
    );
  }

  function onClickRetry() {
    clearAutoClose();
    setWizard(
      "configurationBoardMountTrimAutoWizardStep1",
      "configurationBoardMountTrimAutoStarting",
      10,
    );
    queryBoardMountTrimAuto(true).catch(onQueryFailed);
  }

  function onClickCalibrate() {
    clearAutoClose();
    clearPoll();

    setWizard(
      "configurationBoardMountTrimAutoWizardStep1",
      "configurationBoardMountTrimAutoCalibrating",
      10,
    );

    MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, () => {
      GUI.log($i18n.t("initialSetupAccelCalibStarted"));
    });

    GUI.timeout_add(
      "board_mount_trim_auto_calibrate_wait",
      () => {
        GUI.log($i18n.t("initialSetupAccelCalibEnded"));
        setWizard(
          "configurationBoardMountTrimAutoWizardStep1",
          "configurationBoardMountTrimAutoStarting",
          10,
        );
        queryBoardMountTrimAuto(true).catch(onQueryFailed);
      },
      2000,
    );
  }

  function onClickClose() {
    clearPoll();
    clearAutoClose();
    onButtonDisabled(false);
    dialogEl.close();
    onClose();
  }

  export function stop() {
    clearPoll();
    clearAutoClose();
  }

  onMount(() => {
    dialogEl.showModal();
    setWizard(
      "configurationBoardMountTrimAutoWizardStep1",
      "configurationBoardMountTrimAutoStarting",
      10,
    );
    queryBoardMountTrimAuto(true).catch(onQueryFailed);
  });
</script>

<dialog bind:this={dialogEl}>
  <h3>{$i18n.t("configurationBoardMountTrimAutoWizardTitle")}</h3>
  <div class="wizard-step">{wizardStep}</div>
  <div class="wizard-detail">{wizardDetail}</div>
  <div class="wizard-progress" aria-hidden="true">
    <div class="wizard-progress-fill" style:width="{wizardProgress}%"></div>
  </div>
  <div class="wizard-actions">
    {#if canCalibrate}
      <button class="btn" onclick={onClickCalibrate}>
        {$i18n.t("configurationBoardAutoAlignWizardCalibrate")}
      </button>
    {/if}
    {#if canRetry}
      <button class="btn" onclick={onClickRetry}>
        {$i18n.t("configurationBoardAutoAlignWizardRetry")}
      </button>
    {/if}
    <button class="btn" onclick={onClickClose}>
      {$i18n.t("configurationBoardAutoAlignWizardClose")}
    </button>
  </div>
</dialog>

<style lang="scss">
  .btn {
    @extend %button;
  }

  dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    width: min(400px, calc(100% - 2em));
    border-radius: 5px;
  }

  dialog h3 {
    margin: 0 0 12px;
  }

  .wizard-step {
    font-size: 0.75rem;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .wizard-detail {
    font-size: 0.75rem;
    line-height: 1.5;
    margin-bottom: 12px;
  }

  .wizard-progress {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--color-border);
    overflow: hidden;
  }

  .wizard-progress-fill {
    height: 100%;
    background: var(--color-accent-500);
    transition: width 180ms ease-out;
  }

  .wizard-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }
</style>
