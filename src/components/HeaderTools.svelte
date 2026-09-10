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
    // Span the status boxes above and push the level control to their right
    // edge, so the strip lines up with the row it sits under instead of
    // stopping short of it.
    width: 100%;
    height: 26px;
    color: var(--chrome-fg);
  }

  .level {
    margin-left: auto;
  }

  .level {
    display: flex;
    align-items: center;
    flex-shrink: 0;
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

  // On the phone/tablet header the strip is revealed on its own full-width
  // row, so it can use touch-sized controls rather than the desktop chrome
  // sizing.
  @media all and (max-width: 1100px) {
    .tools {
      width: 100%;
      height: 34px;
      gap: 12px;
    }

    .level {
      font-size: 12px;
    }

    select {
      width: 128px;
      height: 32px;
      font-size: 13px;
    }
  }
</style>
