<script>
  import { onMount } from "svelte";

  import { i18n } from "@/js/i18n.js";
  import { MSP } from "@/js/msp.svelte.js";

  // mspCode: which trial command to drive - MSPCodes.MSP2_WING_RX_SERIAL_TRIAL
  // for the main RX, MSPCodes.MSP2_WING_RX_INPUT_BACKUP_TRIAL for the backup
  // port. Both share the exact same start/poll/stop wire shape. onDetected is
  // called with (inverted, halfDuplex, pinSwap) on SUCCESS so the caller can
  // apply the result to whichever FC config object it owns (FC.RX_CONFIG vs
  // FC.RX_INPUT_BACKUP_CONFIG) - this component has no opinion on that.
  let {
    mspCode,
    onDetected,
    titleKey = "receiverWiringDetectWizardTitle",
    onButtonDisabled,
    onClose,
  } = $props();

  // Keep in sync with wingflight-firmware's rx.h rxSerialTrialState_e.
  const RX_SERIAL_TRIAL = {
    IDLE: 0,
    RUNNING: 1,
    SUCCESS: 2,
    FAILED: 3,
    REJECTED: 4,
  };

  const COMBO_COUNT = 8;
  const POLL_INTERVAL_MS = 200; // comfortably under the firmware's 3s no-poll watchdog

  let dialogEl;
  let wizardStep = $state("");
  let wizardDetail = $state("");
  let wizardProgress = $state(0);
  let canRetry = $state(false);

  let pollTimer;
  let autoCloseTimer;

  // Same "race a single dropped/slow reply against a local timeout" pattern
  // as AutoAlignWizard's sendBoardAutoAlignQuery - MSP.promise() never
  // rejects and has no timeout of its own on a real (non-virtual)
  // connection, so a missed packet would otherwise hang this loop forever.
  function sendTrialQuery(action) {
    const payload = action ? [action] : false;

    return new Promise((resolve) => {
      let settled = false;
      let timeout;

      function finish(response) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(response ?? null);
      }

      timeout = setTimeout(() => finish(null), 1000);
      MSP.send_message(mspCode, payload, false, finish, true);
    });
  }

  function t(key, args = []) {
    const params = {};
    args.forEach((value, i) => (params[i + 1] = value));
    return $i18n.t(key, params);
  }

  function yesNo(value) {
    return value ? $i18n.t("yes") : $i18n.t("no");
  }

  function setWizard(
    stepKey,
    detailKey,
    progressPercent,
    detailArgs = [],
    retry = false,
  ) {
    wizardStep = t(stepKey);
    wizardDetail = t(detailKey, detailArgs);
    wizardProgress = progressPercent;
    canRetry = retry;
  }

  function clearPoll() {
    clearTimeout(pollTimer);
    pollTimer = null;
  }

  function clearAutoClose() {
    clearInterval(autoCloseTimer);
    autoCloseTimer = null;
  }

  function startAutoCloseCountdown(inverted, halfDuplex, pinSwap, seconds = 3) {
    clearAutoClose();

    let remaining = seconds;
    const args = [
      yesNo(inverted),
      yesNo(halfDuplex),
      yesNo(pinSwap),
      remaining,
    ];
    setWizard(
      "receiverWiringDetectWizardStep2",
      "receiverWiringDetectSuccessCountdown",
      100,
      args,
    );

    autoCloseTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearAutoClose();
        dialogEl.close();
        return;
      }
      setWizard(
        "receiverWiringDetectWizardStep2",
        "receiverWiringDetectSuccessCountdown",
        100,
        [yesNo(inverted), yesNo(halfDuplex), yesNo(pinSwap), remaining],
      );
    }, 1000);
  }

  function onQueryFailed() {
    setWizard(
      "receiverWiringDetectWizardStep2",
      "receiverWiringDetectUnsupported",
      100,
    );
    onButtonDisabled(false);
    clearPoll();
  }

  // Always tells the firmware to stop/restore, regardless of the state we
  // ended on - the trial never persists anything itself, so this is the
  // only way a running or finished trial ever gets cleaned up on the FC
  // side. Fire-and-forget: nothing here depends on the response.
  function stopTrial() {
    sendTrialQuery(2);
  }

  async function queryTrial(startProcedure = false) {
    const response = await sendTrialQuery(startProcedure ? 1 : 0);

    if (!response) {
      clearAutoClose();
      clearPoll();
      pollTimer = setTimeout(() => {
        queryTrial(false).catch(onQueryFailed);
      }, 250);
      return;
    }

    const { data } = response;

    if (!data || data.byteLength < 7) {
      clearAutoClose();
      onButtonDisabled(true);
      setWizard(
        "receiverWiringDetectWizardStep2",
        "receiverWiringDetectUnsupported",
        100,
      );
      clearPoll();
      return;
    }

    const state = data.readU8();
    const comboIndex = data.readU8();
    const inverted = data.readU8();
    const halfDuplex = data.readU8();
    const pinSwap = data.readU8();
    data.readU16(); // elapsedMs - not currently surfaced in the UI

    if (state === RX_SERIAL_TRIAL.RUNNING) {
      clearAutoClose();
      setWizard(
        "receiverWiringDetectWizardStep1",
        "receiverWiringDetectScanning",
        Math.round(((comboIndex + 1) / COMBO_COUNT) * 100),
        [comboIndex + 1, COMBO_COUNT],
      );
      onButtonDisabled(true);
      clearPoll();
      pollTimer = setTimeout(() => {
        queryTrial(false).catch(onQueryFailed);
      }, POLL_INTERVAL_MS);
      return;
    }

    onButtonDisabled(false);
    clearPoll();

    if (state === RX_SERIAL_TRIAL.SUCCESS) {
      // Apply now, while the combo is still live and reflected in this
      // response - this is the only place the result becomes visible. The
      // caller's onDetected writes it into whichever FC config it owns,
      // which rides that tab's existing dirty-diff/Save/Revert flow exactly
      // like any manually-edited field. Nothing is pushed to the FC for
      // real until the normal Save/Reboot button is pressed.
      onDetected(inverted, halfDuplex, pinSwap);

      stopTrial();
      startAutoCloseCountdown(inverted, halfDuplex, pinSwap, 3);
      return;
    }

    if (state === RX_SERIAL_TRIAL.FAILED) {
      clearAutoClose();
      stopTrial();
      setWizard(
        "receiverWiringDetectWizardStep2",
        "receiverWiringDetectFailed",
        100,
        [],
        true,
      );
      return;
    }

    if (state === RX_SERIAL_TRIAL.REJECTED) {
      clearAutoClose();
      setWizard(
        "receiverWiringDetectWizardStep2",
        "receiverWiringDetectRejected",
        100,
      );
      return;
    }

    // IDLE - shouldn't normally be observed mid-wizard, but handle it rather
    // than getting stuck if it ever is.
    clearAutoClose();
    setWizard(
      "receiverWiringDetectWizardStep1",
      "receiverWiringDetectScanning",
      0,
      [1, COMBO_COUNT],
    );
  }

  function onClickRetry() {
    clearAutoClose();
    setWizard(
      "receiverWiringDetectWizardStep1",
      "receiverWiringDetectScanning",
      0,
      [1, COMBO_COUNT],
    );
    queryTrial(true).catch(onQueryFailed);
  }

  function onClickClose() {
    dialogEl.close();
  }

  // Single source of truth for "this wizard is done" - a native <dialog>
  // fires `close` whether it was closed via our own dialogEl.close() calls
  // or the browser's own dismissal paths (Escape, backdrop click), which
  // never go through our click handlers. Always stop the trial here so a
  // scan abandoned mid-flight doesn't leave the FC sitting on a wiring
  // combo indefinitely (the firmware's own watchdog is the backstop if even
  // this doesn't arrive - e.g. the whole app closing).
  function handleDialogClose() {
    clearPoll();
    clearAutoClose();
    stopTrial();
    onButtonDisabled(false);
    onClose();
  }

  export function stop() {
    clearPoll();
    clearAutoClose();
    stopTrial();
  }

  onMount(() => {
    dialogEl.showModal();
    setWizard(
      "receiverWiringDetectWizardStep1",
      "receiverWiringDetectScanning",
      0,
      [1, COMBO_COUNT],
    );
    queryTrial(true).catch(onQueryFailed);
  });
</script>

<dialog bind:this={dialogEl} onclose={handleDialogClose}>
  <h3>{$i18n.t(titleKey)}</h3>
  <div class="wizard-step">{wizardStep}</div>
  <div class="wizard-detail">{wizardDetail}</div>
  <div class="wizard-progress" aria-hidden="true">
    <div class="wizard-progress-fill" style:width="{wizardProgress}%"></div>
  </div>
  <div class="wizard-actions">
    {#if canRetry}
      <button class="btn" onclick={onClickRetry}>
        {$i18n.t("receiverWiringDetectWizardRetry")}
      </button>
    {/if}
    <button class="btn" onclick={onClickClose}>
      {$i18n.t("receiverWiringDetectWizardClose")}
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
    border-radius: var(--radius-lg);
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
    border-radius: var(--radius-xs);
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
