<script>
  import { getContext } from "svelte";

  import { i18n } from "@/js/i18n.js";

  import LivePulse from "./LivePulse.svelte";
  import GyroCheckArt from "./GyroCheckArt.svelte";

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

<div class="legend">
  <span class="key">
    <span class="swatch move"></span>
    {$i18n.t("setupWizardGyroLegendMove")}
  </span>
  <span class="key">
    <span class="swatch react"></span>
    {$i18n.t("setupWizardGyroLegendReact")}
  </span>
</div>

{#if wiz.setupModeActive}
  <div class="setup-on">{$i18n.t("setupWizardSetupModeTurnOff")}</div>
{/if}

<ol class="checks">
  {#each checks as axis, n (axis)}
    <li class={["check", results[axis]]}>
      <GyroCheckArt {axis} />
      <div class="check-text">
        <span class="check-title">
          <span class="index">{n + 1}</span>
          {$i18n.t(`setupWizardAxis_${axis}`)}
          {#if results[axis] === "ok"}
            <span class="good">
              <i class="fas fa-check" aria-hidden="true"></i>
              {$i18n.t("setupWizardDone")}
            </span>
          {/if}
        </span>
        <span>{$i18n.t(`setupWizardGyroCheck_${axis}`)}</span>
      </div>
      <span class="buttons">
        <button class="btn" onclick={() => (results[axis] = "ok")}>
          {$i18n.t("setupWizardDirectionCorrect")}
        </button>
        <button class="btn" onclick={() => (results[axis] = "wrong")}>
          {$i18n.t("setupWizardDirectionWrong")}
        </button>
      </span>
    </li>
  {/each}
</ol>

{#if Object.values(results).includes("wrong")}
  <div class="note">{$i18n.t("setupWizardGyroWrong")}</div>
{/if}

<div class="live">
  <span class="live-title">{$i18n.t("setupWizardGyroLive")}</span>
  {#each wiz.surfaces as surface (surface.servo)}
    <div class="live-row">
      <span class="name">{wiz.surfaceLabel(surface)}</span>
      <LivePulse servo={surface.servo} />
    </div>
  {/each}
</div>

<style lang="scss">
  .setup-on {
    padding: 10px 14px;
    border-left: 4px solid var(--color-status-bad);
    border-radius: var(--radius-xs);
    background-color: var(--color-surface-sunken);
    max-width: 70ch;
    font-weight: 600;
  }

  .btn {
    @extend %button;
    height: 2rem;
    padding: 0 16px;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--color-text-soft);
    font-size: 0.9em;
  }

  .legend {
    flex-wrap: wrap;
    gap: 6px 24px;
  }

  .key {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .swatch {
    width: 26px;

    &.move {
      border-top: 2.5px dashed var(--color-text-muted);
    }

    &.react {
      height: 4px;
      border-radius: 2px;
      background-color: var(--color-accent-500);
    }
  }

  .checks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .check {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 24px;
    padding: 12px 16px;
    border: 1px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
    transition: border-color var(--animation-speed);

    &.ok {
      border-color: var(--color-status-good);
    }

    &.wrong {
      border-color: var(--color-status-bad);
    }
  }

  .check-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1 1 280px;
    min-width: 0;
    max-width: 60ch;
  }

  .check-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
  }

  .index {
    flex: 0 0 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    border: 1px solid var(--color-border);
    font-size: 0.8em;
  }

  .buttons {
    display: flex;
    gap: 6px;
  }

  .good {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-status-good);
    font-size: 0.85em;
  }

  .note {
    padding: 10px 14px;
    border-left: 4px solid var(--color-status-bad);
    background-color: var(--color-surface-sunken);
    border-radius: var(--radius-xs);
    max-width: 70ch;
  }

  .live {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 16px;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
  }

  .live-title {
    margin-bottom: 2px;
    color: var(--color-text-soft);
    font-size: 0.85em;
    font-weight: 600;
  }

  .live-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .name {
    min-width: 11em;
    font-weight: 600;
    white-space: nowrap;
  }
</style>
