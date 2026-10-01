<script>
  import { getContext, onMount } from "svelte";

  import { i18n } from "@/js/i18n.js";

  // Shown on the steps measured in SETUP mode (full stick is full servo
  // travel, no gyro). Opening the step switches SETUP on through the wizard;
  // leaving it switches it off again (SetupWizard.svelte). If every mode
  // slot is taken, the pilot's own SETUP switch is the fallback.
  const wiz = getContext("setupWizard");

  let forceFailed = $state(false);

  onMount(async () => {
    forceFailed = !(await wiz.forceSetupMode());
  });
</script>

{#if wiz.setupModeActive}
  <div class="status good">
    {wiz.setupModeForced
      ? $i18n.t("setupWizardSetupModeForced")
      : $i18n.t("setupWizardSetupModeOn")}
  </div>
{:else if forceFailed && !wiz.setupModeAssigned}
  <div class="status bad">
    <span>{$i18n.t("setupWizardSetupModeNotAssigned")}</span>
    <button class="btn" onclick={() => wiz.openTab("auxiliary")}>
      {$i18n.t("setupWizardOpenModes")}
    </button>
  </div>
{:else if forceFailed}
  <div class="status warn">{$i18n.t("setupWizardSetupModeOff")}</div>
{:else}
  <div class="status warn">{$i18n.t("setupWizardSetupModeWaiting")}</div>
{/if}

<style lang="scss">
  .btn {
    @extend %button;
  }

  .status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 8px 12px;
    border-left: 3px solid var(--color-border);
    border-radius: var(--radius-xs);
    background-color: var(--color-surface);
    max-width: 70ch;
    font-weight: 600;

    &.good {
      border-left-color: var(--color-status-good);
    }

    &.warn {
      border-left-color: var(--color-yellow-500);
    }

    &.bad {
      border-left-color: var(--color-status-bad);
    }
  }
</style>
