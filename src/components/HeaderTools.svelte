<script>
  import {
    CONFIGURATOR,
    setDisclosureLevel,
  } from "@/js/configurator.svelte.js";
  import { i18n } from "@/js/i18n.js";

  import SettingsSearch from "@/components/SettingsSearch.svelte";

  // The two connected-only header controls, as one strip in the top bar
  // under the status boxes: settings search, and the detail level that
  // decides how much of the configuration each tab shows.
  //
  // Both are hidden while disconnected, which is what the expert-mode toggle
  // this replaced did (it lived inside the dataflash box, which is itself
  // only shown on connect).
  let level = $derived(CONFIGURATOR.disclosureLevel);

  function onLevelChange(event) {
    // Every tab resolves its tiers reactively through <Tier> and the field
    // registry, so changing the level needs no tab reload.
    setDisclosureLevel(event.currentTarget.value);
  }
</script>

{#if CONFIGURATOR.connectionValid}
  <div class="tools">
    <SettingsSearch />
    <label class="level">
      <span class="label">{$i18n.t("disclosureLevel")}</span>
      <select
        value={level}
        onchange={onLevelChange}
        title={$i18n.t("disclosureLevelHelp")}
      >
        <option value="essential">{$i18n.t("disclosureLevelEssential")}</option>
        <option value="standard">{$i18n.t("disclosureLevelStandard")}</option>
        <option value="expert">{$i18n.t("disclosureLevelExpert")}</option>
      </select>
    </label>
  </div>
{/if}

<style lang="scss">
  .tools {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 26px;
    color: var(--chrome-fg);
  }

  .level {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    line-height: 1;
    white-space: nowrap;
  }

  .label {
    color: var(--chrome-fg-muted);
  }

  select {
    width: 96px;
    height: 24px;
    font-size: 11px;
    padding: 0 4px;
  }
</style>
