<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { Mixer } from "@/js/Mixer.js";

  let { onSelect } = $props();

  let dialogEl;

  export function open() {
    dialogEl.showModal();
  }

  function pick(type) {
    dialogEl.close();
    onSelect?.(type);
  }
</script>

<dialog bind:this={dialogEl}>
  <h3>{$i18n.t("mixerModelTypeTitle")}</h3>

  <div class="tiles" role="tablist" aria-label={$i18n.t("mixerModelTypeTitle")}>
    {#each Mixer.MODEL_TYPES as type (type.value)}
      {@const active = FC.MIXER_CONFIG.model_type === type.value}
      <button
        type="button"
        role="tab"
        class={["tile", active && "active"]}
        aria-selected={active}
        onclick={() => pick(type)}
      >
        <span class="thumb">
          {#each type.images as name (name)}
            <img
              src="/images/aircraft_shapes/{name}.svg"
              alt=""
              aria-hidden="true"
            />
          {/each}
          {#if type.images.length === 0}
            <span class="customIcon" aria-hidden="true">&#9881;</span>
          {/if}
        </span>
        <span class="label">{$i18n.t(type.labelKey)}</span>
      </button>
    {/each}
  </div>

  <div class="buttons">
    <button class="btn" onclick={() => dialogEl.close()}>
      {$i18n.t("mixerWizardCancel")}
    </button>
  </div>
</dialog>

<style lang="scss">
  dialog {
    width: 40em;
    max-width: calc(100vw - 2em);
    border-radius: var(--radius-lg);
  }

  h3 {
    margin-bottom: 0.75em;
  }

  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tile {
    @extend %button;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 104px;
    height: auto;
    padding: 8px;

    &.active {
      color: var(--color-text-inverse, #000);
      background-color: var(--color-accent, var(--accent));
    }
  }

  .thumb {
    position: relative;
    width: 100%;
    aspect-ratio: 103.58047 / 48.517796;

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
    font-size: 1.5rem;
  }

  .label {
    font-size: 0.7rem;
    font-weight: 500;
    text-align: center;
    white-space: normal;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    margin-top: 1.25em;
  }

  .btn {
    @extend %button;
  }

  @media only screen and (max-width: 575px) {
    dialog {
      width: calc(100% - 2em);
    }
  }
</style>
