<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";

  import ModelTypeDialog from "./ModelTypeDialog.svelte";
  import ModelSetupDialog from "./ModelSetupDialog.svelte";

  let typeDialogRef;
  let setupDialogRef;

  // The type picked in ModelTypeDialog, pending confirmation via
  // ModelSetupDialog -- kept separate from FC.MIXER_CONFIG.model_type so the
  // active type doesn't change (and nothing is regenerated) unless the user
  // actually hits Apply there.
  let pendingValue = $state(null);

  let currentType = $derived(Mixer.modelTypeInfo(FC.MIXER_CONFIG.model_type));

  function onTypeSelected(type) {
    if (type.value === FC.MIXER_CONFIG.model_type) return;

    if (type.value === Mixer.MODEL_TYPE_CUSTOM) {
      // No rule generation applies to Custom -- it's the "don't touch my
      // rules" mode, so there's nothing to confirm or align.
      FC.MIXER_CONFIG.model_type = type.value;
      return;
    }

    // Switching between named types (or from Custom into one) can leave the
    // mix misaligned with the newly selected type unless rules are
    // regenerated for it, so route through the same dialog used for
    // "Edit Configuration" and only commit the type change if applied.
    pendingValue = type.value;
    setupDialogRef.open(type);
  }

  function onSetupApplied() {
    FC.MIXER_CONFIG.model_type = pendingValue;
    pendingValue = null;
  }

  function onSetupCancelled() {
    pendingValue = null;
  }
</script>

<div class="current">
  <span class="thumb">
    {#each currentType.images as name (name)}
      <img src="/images/aircraft_shapes/{name}.svg" alt="" aria-hidden="true" />
    {/each}
    {#if currentType.images.length === 0}
      <span class="customIcon" aria-hidden="true">&#9881;</span>
    {/if}
  </span>
  <span class="label">{$i18n.t(currentType.labelKey)}</span>
  <button class="changeBtn" onclick={() => typeDialogRef.open()}>
    {$i18n.t("mixerChangeModelType")}
  </button>
</div>

<ModelTypeDialog bind:this={typeDialogRef} onSelect={onTypeSelected} />
<ModelSetupDialog
  bind:this={setupDialogRef}
  onApply={onSetupApplied}
  onCancel={onSetupCancelled}
/>

<style lang="scss">
  .current {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: var(--section-gap);
    margin-bottom: var(--section-gap);
  }

  .thumb {
    position: relative;
    width: 76px;
    aspect-ratio: 103.58047 / 48.517796;
    flex-shrink: 0;

    img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }
  }

  .customIcon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 2rem;
  }

  .label {
    font-size: 1.1rem;
    font-weight: 600;
  }

  // Deliberately understated -- this is a rarely-used action (changing the
  // whole airframe type), not a primary control, so it shouldn't compete
  // visually with the actual mixer content below it.
  .changeBtn {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xs);
    padding: 6px 14px;
    font-size: 0.8rem;
    color: var(--color-text-soft);
    cursor: pointer;
    margin-left: 4px;

    &:hover {
      color: var(--color-text);
      border-color: var(--color-text-soft);
    }
  }
</style>
