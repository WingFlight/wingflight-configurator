<script>
  import { getContext } from "svelte";

  import { i18n } from "@/js/i18n.js";

  import LivePulse from "./LivePulse.svelte";

  const wiz = getContext("setupWizard");

  // No overrides here: the stabiliser drives the surfaces (the PID runs
  // while disarmed too), so they react while the model is being moved.
  const CHECKS = ["roll", "pitch", "yaw"];

  let results = $state({});

  let checks = $derived(
    CHECKS.filter((axis) => wiz.surfaces.some((s) => s.axes[axis])),
  );
</script>

<p>{$i18n.t("setupWizardGyroIntro")}</p>

{#if wiz.setupModeActive}
  <div class="setup-on">{$i18n.t("setupWizardSetupModeTurnOff")}</div>
{/if}

<ul class="checks">
  {#each checks as axis (axis)}
    <li>
      <span class="text">{$i18n.t(`setupWizardGyroCheck_${axis}`)}</span>
      <span class="buttons">
        <button class="btn" onclick={() => (results[axis] = "ok")}>
          {$i18n.t("setupWizardDirectionCorrect")}
        </button>
        <button class="btn" onclick={() => (results[axis] = "wrong")}>
          {$i18n.t("setupWizardDirectionWrong")}
        </button>
      </span>
      {#if results[axis] === "ok"}
        <span class="good">{$i18n.t("setupWizardDone")}</span>
      {/if}
    </li>
  {/each}
</ul>

{#if Object.values(results).includes("wrong")}
  <div class="note">{$i18n.t("setupWizardGyroWrong")}</div>
{/if}

<table class="rows">
  <tbody>
    {#each wiz.surfaces as surface (surface.servo)}
      <tr>
        <td class="name">{wiz.surfaceLabel(surface)}</td>
        <td><LivePulse servo={surface.servo} /></td>
      </tr>
    {/each}
  </tbody>
</table>

<style lang="scss">
  .setup-on {
    padding: 8px 12px;
    border-left: 3px solid var(--color-status-bad);
    border-radius: var(--radius-xs);
    background-color: var(--color-surface);
    max-width: 70ch;
    font-weight: 600;
  }

  .btn {
    @extend %button;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .checks {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 12px;
    }
  }

  .text {
    flex: 1 1 360px;
    min-width: 0;
  }

  .buttons {
    display: flex;
    gap: 4px;
  }

  .note {
    padding: 8px 12px;
    border-left: 3px solid var(--color-status-bad);
    background-color: var(--color-surface);
    border-radius: var(--radius-xs);
    max-width: 70ch;
  }

  .rows td {
    padding: 4px 12px 4px 0;
  }

  .name {
    font-weight: 600;
    white-space: nowrap;
  }

  .good {
    color: var(--color-status-good);
  }
</style>
