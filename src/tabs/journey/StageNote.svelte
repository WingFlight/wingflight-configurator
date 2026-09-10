<script>
  // Small explanatory block used inside stage bodies.
  let { children, tone = "info" } = $props();
</script>

<div class={["note", tone]}>
  {@render children?.()}
</div>

<style lang="scss">
  .note {
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-soft);
    background: var(--color-surface-float, var(--color-surface));
    font-size: 0.85rem;
    color: var(--color-text-soft);
    line-height: 1.45;

    :global(p) {
      margin: 0 0 6px;
    }

    :global(p:last-child) {
      margin-bottom: 0;
    }

    :global(ol),
    :global(ul) {
      margin: 4px 0 0;
      padding-left: 1.2em;
    }
  }

  .warning {
    border-color: color-mix(in srgb, var(--color-status-bad) 45%, transparent);
    background: color-mix(
      in srgb,
      var(--color-status-bad) 8%,
      var(--color-surface)
    );
    color: var(--color-text);
  }
</style>
