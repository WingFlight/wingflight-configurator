<script>
  import { getContext } from "svelte";

  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";

  const wiz = getContext("setupWizard");

  // Permanent box IDs (wingflight-firmware msp/msp_box.c).
  const MODES = [
    { id: 0, key: "arm", required: true },
    { id: 12, key: "setup", required: false },
    { id: 59, key: "gyroOff", required: false },
  ];

  // A mode has a switch when any range for it covers part of the channel.
  function assigned(id) {
    return FC.MODE_RANGES.some(
      (r) => r.id === id && r.range.start < r.range.end,
    );
  }
</script>

<p>{$i18n.t("setupWizardModesIntro")}</p>

<ul class="modes">
  {#each MODES as mode (mode.id)}
    {@const has = assigned(mode.id)}
    <li>
      <span class={["state", has ? "good" : mode.required ? "bad" : "muted"]}>
        {has
          ? $i18n.t("setupWizardModesAssigned")
          : $i18n.t("setupWizardModesNotAssigned")}
      </span>
      <span>
        <strong>{$i18n.t(`setupWizardModes_${mode.key}`)}</strong>
        {$i18n.t(`setupWizardModesHelp_${mode.key}`)}
      </span>
    </li>
  {/each}
</ul>

<div>
  <button class="btn" onclick={() => wiz.openTab("auxiliary")}>
    {$i18n.t("setupWizardOpenModes")}
  </button>
</div>

<style lang="scss">
  .btn {
    @extend %button;
  }

  p {
    margin: 0;
    max-width: 70ch;
  }

  .modes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;

    li {
      display: grid;
      grid-template-columns: 9em minmax(0, 1fr);
      gap: 12px;
      max-width: 80ch;
    }
  }

  .state {
    font-size: 0.9em;
    font-weight: 600;
  }

  .good {
    color: var(--color-status-good);
  }

  .bad {
    color: var(--color-status-bad);
  }

  .muted {
    color: var(--color-text-soft);
  }
</style>
