<script>
  import { slide } from "svelte/transition";

  import { createExpertSubsection } from "@/js/expert.svelte.js";
  import { i18n } from "@/js/i18n.js";

  // actions: optional snippet for a right-aligned action (e.g. a button) on
  // the label row itself - for something that acts specifically on this
  // subsection's own fields, as opposed to the whole Section header above it.
  let { children, label, actions } = $props();

  // Hidden (not unmounted, so the fields keep reporting) when basic mode
  // hides every field in it, so no heading is left over an empty group.
  const expert = createExpertSubsection();
  let allHidden = $derived(expert.items > 0 && expert.hidden === expert.items);
</script>

<div class="container" class:all-hidden={allHidden}>
  {#if label}
    <div transition:slide class="header">
      <span>{$i18n.t(label)}</span>
      {#if actions}
        <span class="actions">{@render actions()}</span>
      {/if}
    </div>
  {/if}
  <div class="content">{@render children?.()}</div>
</div>

<style lang="scss">
  .all-hidden {
    display: none;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 8px 4px;
    margin: 0 4px 4px;

    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;

    color: var(--color-text-muted);
    border-bottom: 1px solid var(--color-border-soft);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;

    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
  }

  @media only screen and (max-width: 480px) {
    .content > :global(*) + :global(*) {
      border-top: 1px solid var(--color-border);
    }
  }
</style>
