<script>
  import { untrack } from "svelte";

  import { CONFIGURATOR } from "@/js/configurator.svelte.js";
  import { getExpertSection, getExpertSubsection } from "@/js/expert.svelte.js";

  // Settings only experts need. They are hidden while expert mode is off,
  // unless `changed` is true (the FC holds a non-default value the pilot
  // should still see) or the enclosing Section's advanced settings have been
  // revealed. counted: include this block in the Section's hidden count; turn
  // it off for all but one of the blocks that make up a single setting (e.g.
  // the cells of a table column).
  let { children, changed = false, counted = true } = $props();

  const section = getExpertSection();
  const subsection = getExpertSubsection();

  // Once shown because of a changed value, stay shown so the field doesn't
  // vanish while it is being edited back to its default.
  let keep = $state(false);
  $effect.pre(() => {
    if (changed) keep = true;
  });

  let basicHidden = $derived(!CONFIGURATOR.expertMode && !changed && !keep);

  $effect(() => {
    if (subsection && counted) {
      untrack(() => subsection.items++);
      return () => untrack(() => subsection.items--);
    }
  });

  let hiddenNow = $derived(basicHidden && !section?.revealed);
  $effect(() => {
    if (subsection && counted && hiddenNow) {
      untrack(() => subsection.hidden++);
      return () => untrack(() => subsection.hidden--);
    }
  });

  $effect(() => {
    if (section && counted && basicHidden) {
      untrack(() => section.hidden++);
      return () => untrack(() => section.hidden--);
    }
  });
</script>

{#if !hiddenNow}
  {@render children?.()}
{/if}
