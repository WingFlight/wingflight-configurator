<script>
  import { i18n } from "@/js/i18n.js";
  import { BACKUP_TYPES } from "@/js/cli_backup.js";
  import { wizardState } from "./backup_wizard_state.svelte.js";

  let {
    onSaveBackup,
    onContinue,
    onCancelBackup,
    onRetryBackup,
    onStartRestore,
    onRetryRestore,
    onSkipRestore,
    onCloseRestore,
  } = $props();

  let dialogEl;

  $effect(() => {
    if (!dialogEl) return;
    if (wizardState.phase && !dialogEl.open) {
      dialogEl.showModal();
    } else if (!wizardState.phase && dialogEl.open) {
      dialogEl.close();
    }
  });

  let backupCommand = $derived(
    wizardState.backupType === BACKUP_TYPES.DUMP ? "dump all" : "diff all",
  );
</script>

<dialog bind:this={dialogEl} class="wizard">
  {#if wizardState.phase === "backup"}
    <h3>{$i18n.t("firmwareFlasherWizardBackupTitle")}</h3>
    <div class="content">
      {#if wizardState.status === "connecting"}
        <p class="status">
          <span class="spinner"></span>
          {$i18n.t("firmwareFlasherWizardConnecting")}
        </p>
      {:else if wizardState.status === "running"}
        <p class="status">
          <span class="spinner"></span>
          {$i18n.t("firmwareFlasherWizardBackupRunning", {
            command: backupCommand,
          })}
        </p>
      {:else if wizardState.status === "ready"}
        <p>{$i18n.t("firmwareFlasherWizardBackupReady")}</p>
        {#if wizardState.backupSaved}
          <p class="ok">{$i18n.t("firmwareFlasherWizardBackupSaved")}</p>
        {/if}
      {:else if wizardState.status === "failed"}
        <p class="error">{$i18n.t("firmwareFlasherWizardBackupFailed")}</p>
      {/if}
    </div>
    <div class="buttons">
      {#if wizardState.status === "ready"}
        <button class="btn" onclick={onCancelBackup}>
          {$i18n.t("firmwareFlasherWizardCancel")}
        </button>
        <button class="btn" onclick={onSaveBackup}>
          {$i18n.t("firmwareFlasherWizardSaveBackupFile")}
        </button>
        <button class="btn primary" onclick={onContinue}>
          {$i18n.t("firmwareFlasherWizardContinueToFlash")}
        </button>
      {:else if wizardState.status === "failed"}
        <button class="btn" onclick={onCancelBackup}>
          {$i18n.t("firmwareFlasherWizardCancel")}
        </button>
        <button class="btn primary" onclick={onRetryBackup}>
          {$i18n.t("firmwareFlasherWizardRetry")}
        </button>
      {/if}
    </div>
  {:else if wizardState.phase === "restore"}
    <h3>{$i18n.t("firmwareFlasherWizardRestoreTitle")}</h3>
    <div class="content">
      {#if wizardState.status === "prompt"}
        <p>{$i18n.t("firmwareFlasherWizardRestorePrompt")}</p>
      {:else if wizardState.status === "waiting"}
        <p class="status">
          <span class="spinner"></span>
          {$i18n.t("firmwareFlasherWizardRestoreWaiting")}
        </p>
      {:else if wizardState.status === "connecting"}
        <p class="status">
          <span class="spinner"></span>
          {$i18n.t("firmwareFlasherWizardConnecting")}
        </p>
      {:else if wizardState.status === "running"}
        <p class="status">
          <span class="spinner"></span>
          {$i18n.t("firmwareFlasherWizardRestoreRunning")}
        </p>
      {:else if wizardState.status === "done"}
        <p class="ok">{$i18n.t("firmwareFlasherWizardRestoreDone")}</p>
      {:else if wizardState.status === "failed"}
        <p class="error">{$i18n.t("firmwareFlasherWizardRestoreFailed")}</p>
      {/if}
    </div>
    <div class="buttons">
      {#if wizardState.status === "prompt"}
        <button class="btn" onclick={onSkipRestore}>
          {$i18n.t("firmwareFlasherWizardSkip")}
        </button>
        <button class="btn primary" onclick={onStartRestore}>
          {$i18n.t("firmwareFlasherWizardRestoreNow")}
        </button>
      {:else if wizardState.status === "failed"}
        <button class="btn" onclick={onSkipRestore}>
          {$i18n.t("firmwareFlasherWizardSkip")}
        </button>
        <button class="btn primary" onclick={onRetryRestore}>
          {$i18n.t("firmwareFlasherWizardRetry")}
        </button>
      {:else if wizardState.status === "done"}
        <button class="btn primary" onclick={onCloseRestore}>
          {$i18n.t("firmwareFlasherWizardClose")}
        </button>
      {:else}
        <button class="btn" onclick={onSkipRestore}>
          {$i18n.t("firmwareFlasherWizardSkip")}
        </button>
      {/if}
    </div>
  {/if}
</dialog>

<style lang="scss">
  dialog.wizard {
    width: 32em;
    max-width: calc(100vw - 2em);
    border-radius: var(--radius-lg);
  }

  h3 {
    margin-bottom: 0.5em;
  }

  .content {
    min-height: 3em;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .ok {
    color: var(--color-valid, #00d000);
    font-weight: 600;
  }

  .error {
    color: var(--color-invalid, #a62e32);
    font-weight: 600;
  }

  .spinner {
    flex-shrink: 0;
    width: 1em;
    height: 1em;
    border-radius: 50%;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent-500, #f86008);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 1.5em;
  }

  .btn {
    @extend %button;
    white-space: nowrap;

    &.primary {
      @extend %button-primary;
    }
  }
</style>
