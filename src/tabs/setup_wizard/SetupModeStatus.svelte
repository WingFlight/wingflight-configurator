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

{#snippet status(kind, icon, text)}
  <div class={["status", kind]} role="status">
    <i class={["fas", icon]} aria-hidden="true"></i>
    <div class="status-text">
      <span class="status-title">{$i18n.t("setupWizardSetupModeTitle")}</span>
      <span>{text}</span>
    </div>
    {#if kind === "bad"}
      <button class="btn" onclick={() => wiz.openTab("auxiliary")}>
        {$i18n.t("setupWizardOpenModes")}
      </button>
    {/if}
  </div>
{/snippet}

{#if wiz.setupModeActive}
  {@render status(
    "good",
    "fa-check-circle",
    wiz.setupModeForced
      ? $i18n.t("setupWizardSetupModeForced")
      : $i18n.t("setupWizardSetupModeOn"),
  )}
{:else if forceFailed && !wiz.setupModeAssigned}
  {@render status(
    "bad",
    "fa-times-circle",
    $i18n.t("setupWizardSetupModeNotAssigned"),
  )}
{:else if forceFailed}
  {@render status(
    "warn",
    "fa-exclamation-triangle",
    $i18n.t("setupWizardSetupModeOff"),
  )}
{:else}
  {@render status(
    "warn",
    "fa-circle-notch fa-spin",
    $i18n.t("setupWizardSetupModeWaiting"),
  )}
{/if}

<style lang="scss">
  .btn {
    @extend %button;
  }

  // A tinted box with an icon, so "the green box" in the steps' text is
  // easy to find: green when SETUP is on, yellow while waiting, red when
  // the pilot has to do something.
  .status {
    --tone: var(--color-yellow-500);
    display: flex;
    align-items: center;
    gap: 12px 14px;
    padding: 12px 16px;
    border: 1px solid var(--tone);
    border-radius: var(--radius-md);
    background-color: color-mix(in srgb, var(--tone) 12%, transparent);

    &.good {
      --tone: var(--color-status-good);
    }

    &.bad {
      --tone: var(--color-status-bad);
    }

    > i {
      flex: none;
      font-size: 1.6em;
      color: var(--tone);
    }
  }

  .status-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    max-width: 75ch;
  }

  .status-title {
    font-weight: 700;
  }
</style>
