<script>
  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import { getProfile } from "@/js/profile.svelte.js";
  import { getField, isVisible } from "@/js/relevance.js";

  // Three-tier disclosure wrapper.
  //
  //   <Tier level="expert">…</Tier>                  tier only
  //   <Tier level="standard" when={when.hasFlaps}>…  tier x relevance predicate
  //   <Tier id="servos.table.rate">…                 resolved from the registry
  //
  // `when` may be a boolean or a function(profile) -> boolean. `id` looks the
  // field up in the field registry; explicit `level`/`when` props override
  // whatever the registry says. Unregistered ids fall back to standard/always
  // so a missing registration can never hide a field.
  //
  // When an `id` is given the children are wrapped in a display:contents
  // span carrying data-field-id, so settings search can scroll to the field
  // and reveal it regardless of tier or relevance (CONFIGURATOR.revealedFieldId).
  let { children, fallback, level, when, id } = $props();

  let def = $derived(id ? getField(id) : null);
  let tier = $derived(level ?? def?.tier ?? "standard");
  let predicate = $derived(when ?? def?.when ?? true);

  let revealed = $derived(!!id && CONFIGURATOR.revealedFieldId === id);

  let show = $derived(
    revealed ||
      isVisible(
        { tier, when: predicate },
        getProfile(),
        CONFIGURATOR.disclosureLevel,
      ),
  );
</script>

{#if show}
  {#if id}
    <span class="tier" class:revealed data-field-id={id}>
      {@render children?.()}
    </span>
  {:else}
    {@render children?.()}
  {/if}
{:else if fallback}
  {@render fallback()}
{/if}

<style lang="scss">
  .tier {
    display: contents;
  }

  // Highlight a field that search jumped to; the wrapper itself has no box,
  // so the ring goes on its direct children.
  .revealed > :global(*) {
    box-shadow: 0 0 0 3px var(--color-focus-ring);
    border-radius: var(--radius-sm);
  }
</style>
