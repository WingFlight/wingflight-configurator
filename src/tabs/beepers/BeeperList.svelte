<script>
  import { i18n } from "@/js/i18n.js";

  import Field from "@/components/Field.svelte";
  import Switch from "@/components/Switch.svelte";

  let { beepers, mask = $bindable(), idPrefix } = $props();

  const visible = beepers._beepers.filter((b) => b.visible);
</script>

<div class="beeper-list">
  {#each visible as beeper (beeper.bit)}
    <Field id={`${idPrefix}-${beeper.name}`} label={rowLabel}>
      {#snippet rowLabel()}
        <div class="beeper-label">
          <span class="name">{beeper.name}</span>
          <span class="desc">{$i18n.t(`beeper_${beeper.name}`)}</span>
        </div>
      {/snippet}
      <Switch
        id={`${idPrefix}-${beeper.name}`}
        bind:checked={
          () => !bit_check(mask, beeper.bit),
          (v) => {
            mask = v ? bit_clear(mask, beeper.bit) : bit_set(mask, beeper.bit);
          }
        }
      />
    </Field>
  {/each}
</div>

<style lang="scss">
  .beeper-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 0;
  }

  .name {
    font-weight: 600;
    font-size: 0.8rem;
  }

  .desc {
    font-size: 0.75rem;
    color: var(--color-text-soft);
  }
</style>
