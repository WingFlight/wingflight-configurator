<script>
  import { i18n } from "@/js/i18n.js";

  // Badge vocabulary: notStarted / inProgress / needsAttention / verified /
  // notApplicable. There is deliberately no plain "done".
  let { badge, compact = false } = $props();

  const ICONS = {
    notStarted: "○",
    inProgress: "◔",
    needsAttention: "!",
    verified: "✓",
    notApplicable: "–",
  };
</script>

<span
  class={["badge", badge, compact && "compact"]}
  title={$i18n.t(`journeyBadge.${badge}`)}
>
  <span class="icon" aria-hidden="true">{ICONS[badge] ?? "○"}</span>
  {#if !compact}
    <span class="label">{$i18n.t(`journeyBadge.${badge}`)}</span>
  {/if}
</span>

<style lang="scss">
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px 2px 4px;
    border-radius: var(--radius-pill);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
    border: 1px solid var(--color-border-soft);
    color: var(--color-text-soft);
    background: var(--color-surface-alt, var(--color-surface));

    &.compact {
      padding: 0;
      width: 22px;
      height: 22px;
      justify-content: center;
    }
  }

  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 0.75rem;
    line-height: 1;
    background: var(--color-neutral-300);
    color: var(--color-neutral-900);
  }

  .verified {
    color: var(--color-status-good);
    border-color: color-mix(in srgb, var(--color-status-good) 40%, transparent);

    .icon {
      background: var(--color-status-good);
      color: white;
    }
  }

  .needsAttention {
    color: var(--color-status-bad);
    border-color: color-mix(in srgb, var(--color-status-bad) 40%, transparent);

    .icon {
      background: var(--color-status-bad);
      color: white;
    }
  }

  .inProgress .icon {
    background: var(--color-accent-500);
    color: var(--color-accent-fg);
  }

  .notApplicable {
    opacity: 0.7;
  }
</style>
