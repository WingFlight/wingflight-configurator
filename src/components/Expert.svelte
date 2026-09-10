<script>
  import Tier from "@/components/Tier.svelte";

  // Thin alias kept so existing tabs keep working: Expert content is the
  // top disclosure tier. New code should use <Tier level="…" when={…}>.
  let { children } = $props();
</script>

<Tier level="expert">
  {@render children?.()}
</Tier>
