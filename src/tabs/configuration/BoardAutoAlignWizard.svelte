<script>
  import { onDestroy } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { MSP } from "@/js/msp.svelte.js";
  import { MSPCodes } from "@/js/msp/MSPCodes.js";

  const STATE = {
    IDLE: 0,
    WAITING_FOR_TAIL_LIFT: 1,
    SUCCESS: 2,
    REJECTED_ARMED: 3,
    TIMEOUT: 4,
    NO_MATCH: 5,
    REJECTED_UNCALIBRATED: 6,
  };

  let dialogEl;
  let pollTimer;
  let closeTimer;
  let calibrateTimeout;

  let stepKey = $state("configurationBoardAutoAlignWizardStep1");
  let detailKey = $state("configurationBoardAutoAlignWizardDetailStart");
  let detailArgs = $state([]);
  let progress = $state(0);
  let canRetry = $state(false);
  let canCalibrate = $state(false);

  let { onDisabledChange } = $props();

  let detailParams = $derived(
    Object.fromEntries(detailArgs.map((v, i) => [i + 1, v])),
  );

  function setWizard(
    newStepKey,
    newDetailKey,
    newProgress,
    newDetailArgs = [],
    newCanRetry = false,
    newCanCalibrate = false,
  ) {
    stepKey = newStepKey;
    detailKey = newDetailKey;
    progress = newProgress;
    detailArgs = newDetailArgs;
    canRetry = newCanRetry;
    canCalibrate = newCanCalibrate;
  }

  function clearPoll() {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  function clearClose() {
    clearInterval(closeTimer);
    closeTimer = null;
  }

  function startAutoCloseCountdown(roll, pitch, yaw, seconds = 3) {
    clearClose();

    let remaining = seconds;
    setWizard(
      "configurationBoardAutoAlignWizardStep3",
      "configurationBoardAutoAlignSuccessCountdown",
      100,
      [roll, pitch, yaw, remaining],
    );

    closeTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearClose();
        dialogEl.close();
        return;
      }

      setWizard(
        "configurationBoardAutoAlignWizardStep3",
        "configurationBoardAutoAlignSuccessCountdown",
        100,
        [roll, pitch, yaw, remaining],
      );
    }, 1000);
  }

  function onQueryFailed() {
    setWizard(
      "configurationBoardAutoAlignWizardStep3",
      "configurationBoardAutoAlignUnsupported",
      100,
    );
    onDisabledChange?.(false);
    clearPoll();
  }

  async function queryBoardAutoAlign(startProcedure = false) {
    const payload = startProcedure ? [1] : false;
    const { data } = await MSP.promise(
      MSPCodes.MSP2_WING_BOARD_AUTO_ALIGN,
      payload,
    );

    if (!data || data.byteLength < 8) {
      clearClose();
      onDisabledChange?.(true);
      setWizard(
        "configurationBoardAutoAlignWizardStep3",
        "configurationBoardAutoAlignUnsupported",
        100,
      );
      clearPoll();
      return;
    }

    const state = data.readU8();
    const roll = data.read16();
    const pitch = data.read16();
    const yaw = data.read16();

    if (state === STATE.WAITING_FOR_TAIL_LIFT) {
      clearClose();
      setWizard(
        "configurationBoardAutoAlignWizardStep2",
        "configurationBoardAutoAlignWaiting",
        60,
      );
      onDisabledChange?.(true);
      clearPoll();
      pollTimer = setTimeout(() => {
        queryBoardAutoAlign(false).catch(onQueryFailed);
      }, 250);
      return;
    }

    onDisabledChange?.(false);
    clearPoll();

    if (state === STATE.SUCCESS) {
      FC.BOARD_ALIGNMENT_CONFIG.roll = roll;
      FC.BOARD_ALIGNMENT_CONFIG.pitch = pitch;
      FC.BOARD_ALIGNMENT_CONFIG.yaw = yaw;
      startAutoCloseCountdown(roll, pitch, yaw, 3);
      return;
    }

    if (state === STATE.REJECTED_ARMED) {
      clearClose();
      setWizard(
        "configurationBoardAutoAlignWizardStep1",
        "configurationBoardAutoAlignDisarmRequired",
        100,
        [],
        true,
      );
      return;
    }

    if (state === STATE.REJECTED_UNCALIBRATED) {
      clearClose();
      setWizard(
        "configurationBoardAutoAlignWizardStep1",
        "configurationBoardAutoAlignUncalibrated",
        100,
        [],
        false,
        true,
      );
      return;
    }

    if (state === STATE.TIMEOUT) {
      clearClose();
      setWizard(
        "configurationBoardAutoAlignWizardStep2",
        "configurationBoardAutoAlignTimeout",
        100,
        [],
        true,
      );
      return;
    }

    if (state === STATE.NO_MATCH) {
      clearClose();
      setWizard(
        "configurationBoardAutoAlignWizardStep2",
        "configurationBoardAutoAlignNoMatch",
        100,
        [],
        true,
      );
      return;
    }

    clearClose();
    setWizard(
      "configurationBoardAutoAlignWizardStep1",
      "configurationBoardAutoAlignIdle",
      0,
    );
  }

  export function open() {
    clearClose();
    dialogEl.showModal();
    setWizard(
      "configurationBoardAutoAlignWizardStep1",
      "configurationBoardAutoAlignStarting",
      25,
    );
    queryBoardAutoAlign(true).catch(onQueryFailed);
  }

  function onClickRetry() {
    clearClose();
    setWizard(
      "configurationBoardAutoAlignWizardStep1",
      "configurationBoardAutoAlignStarting",
      25,
    );
    queryBoardAutoAlign(true).catch(onQueryFailed);
  }

  function onClickCalibrate() {
    clearClose();
    clearPoll();

    setWizard(
      "configurationBoardAutoAlignWizardStep1",
      "configurationBoardAutoAlignCalibrating",
      10,
    );

    // Same pattern as Setup's calibrateAccel handler: the MCU is locked in
    // a blocking loop for the duration of the calibration and can't
    // process other MSP traffic, so the poll timer must stay cleared
    // (done above) until the fixed wait below has elapsed.
    MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, () => {
      GUI.log($i18n.t("initialSetupAccelCalibStarted"));
    });

    calibrateTimeout = setTimeout(() => {
      GUI.log($i18n.t("initialSetupAccelCalibEnded"));
      setWizard(
        "configurationBoardAutoAlignWizardStep1",
        "configurationBoardAutoAlignStarting",
        25,
      );
      queryBoardAutoAlign(true).catch(onQueryFailed);
    }, 2000);
  }

  function onClickClose() {
    clearPoll();
    clearClose();
    onDisabledChange?.(false);
    dialogEl.close();
  }

  onDestroy(() => {
    clearPoll();
    clearClose();
    clearTimeout(calibrateTimeout);
  });
</script>

<dialog bind:this={dialogEl} class="board-auto-align-wizard">
  <h3>{$i18n.t("configurationBoardAutoAlignWizardTitle")}</h3>
  <div class="wizard-step">{$i18n.t(stepKey)}</div>
  <div class="wizard-detail">{$i18n.t(detailKey, detailParams)}</div>
  <div class="wizard-progress" aria-hidden="true">
    <div class="wizard-progress-fill" style:width={`${progress}%`}></div>
  </div>
  <div class="wizard-actions">
    {#if canCalibrate}
      <button type="button" onclick={onClickCalibrate}>
        {$i18n.t("configurationBoardAutoAlignWizardCalibrate")}
      </button>
    {/if}
    {#if canRetry}
      <button type="button" onclick={onClickRetry}>
        {$i18n.t("configurationBoardAutoAlignWizardRetry")}
      </button>
    {/if}
    <button type="button" onclick={onClickClose}>
      {$i18n.t("configurationBoardAutoAlignWizardClose")}
    </button>
  </div>
</dialog>

<style lang="scss">
  .board-auto-align-wizard {
    width: 28em;
    border-radius: 5px;
  }

  .wizard-step {
    font-weight: 600;
    margin-bottom: 4px;
  }

  .wizard-detail {
    font-size: 0.85rem;
    color: var(--color-text-soft);
    min-height: 2.5em;
  }

  .wizard-progress {
    height: 6px;
    margin-top: 12px;
    border-radius: 3px;
    overflow: hidden;
    background-color: var(--color-meter-bg);
  }

  .wizard-progress-fill {
    height: 100%;
    background-color: var(--color-accent, var(--accent));
    transition: width 0.2s linear;
  }

  .wizard-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 1.5em;
  }

  .wizard-actions button {
    @extend %button;
  }

  @media only screen and (max-width: 480px) {
    .board-auto-align-wizard {
      width: calc(100% - 2em);
      border-radius: unset;
    }
  }
</style>
