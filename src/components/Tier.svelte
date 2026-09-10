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
  let { children, fallback, level, when, id } = $props();

  let def = $derived(id ? getField(id) : null);
  let tier = $derived(level ?? def?.tier ?? "standard");
  let predicate = $derived(when ?? def?.when ?? true);

  let show = $derived(
    isVisible(
      { tier, when: predicate },
      getProfile(),
      CONFIGURATOR.disclosureLevel,
    ),
  );
</script>

{#if show}
  {@render children?.()}
{:else if fallback}
  {@render fallback()}
{/if}
