<script>
  import { i18n } from "@/js/i18n.js";

  import StageNote from "../StageNote.svelte";

  // Placeholder until the board canvas / pin mapping port (P3) lands. Kept
  // as the single integration point so the stage does not change shape.
  let { mode = "canvas" } = $props();
</script>

{#if mode === "canvas"}
  <StageNote>
    <p>{$i18n.t("journeyWiring.canvasPending")}</p>
  </StageNote>
{:else}
  <StageNote>
    <p>{$i18n.t("journeyWiring.tablePending")}</p>
  </StageNote>
{/if}
