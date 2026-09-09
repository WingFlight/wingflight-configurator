<script>
  import { slide } from "svelte/transition";

  import { i18n } from "@/js/i18n.js";

  let { children, label } = $props();
</script>

<div class="container">
  {#if label}
    <div transition:slide class="header">
      {$i18n.t(label)}
    </div>
  {/if}
  <div class="content">{@render children?.()}</div>
</div>

<style lang="scss">
  .header {
    padding: 10px 8px 4px;
    margin: 0 4px 4px;

    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;

    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border-soft);
  }

  @media only screen and (max-width: 480px) {
    .content > :global(*) + :global(*) {
      border-top: 1px solid var(--color-border);
    }
  }
</style>
