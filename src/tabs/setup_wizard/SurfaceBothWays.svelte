<script>
  // Side view of a tail section with the control surface drawn at both
  // ends of its travel, each with a numbered arrow: "check both ways".
  // Not labelled Min/Max on purpose: which way is Min depends on how the
  // servo is mounted. Decorative; the text next to it says the same.
  const HINGE = { x: 92, y: 36 };
  const THROW = 26;
</script>

{#snippet surface(angle, cls)}
  <path
    class={cls}
    transform="rotate({angle} {HINGE.x} {HINGE.y})"
    d="M92 31.5 L148 36 L92 40.5 Z"
  />
{/snippet}

<svg
  viewBox="0 0 160 72"
  class="both-ways"
  aria-hidden="true"
  focusable="false"
>
  {@render surface(-THROW, "ghost")}
  {@render surface(THROW, "ghost")}
  <path
    class="fixed"
    d="M8 36 C8 29 18 27 32 27 L92 31.5 L92 40.5 L32 45 C18 45 8 43 8 36 Z"
  />
  {@render surface(0, "moving")}
  <circle class="hinge" cx={HINGE.x} cy={HINGE.y} r="2" />

  <path class="arrow" d="M140 26 A50 50 0 0 0 136 10" />
  <path class="head" d="M132.5 11.5 L136 6 L139.5 12 Z" />
  <circle class="badge" cx="150" cy="14" r="7" />
  <text class="badge-text" x="150" y="17.5">1</text>

  <path class="arrow" d="M140 46 A50 50 0 0 1 136 62" />
  <path class="head" d="M132.5 60.5 L136 66 L139.5 60 Z" />
  <circle class="badge" cx="150" cy="58" r="7" />
  <text class="badge-text" x="150" y="61.5">2</text>
</svg>

<style lang="scss">
  .both-ways {
    display: block;
    width: 150px;
    height: auto;
    flex: none;
    overflow: visible;
    color: var(--color-text-muted);
  }

  .fixed {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linejoin: round;
  }

  .moving {
    fill: var(--color-accent-500);
  }

  .ghost {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 1.2;
    stroke-dasharray: 3 2;
  }

  .hinge {
    fill: currentColor;
  }

  .arrow {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 1.8;
    stroke-linecap: round;
  }

  .head {
    fill: var(--color-accent-500);
  }

  .badge {
    fill: var(--color-accent-500);
  }

  .badge-text {
    fill: var(--color-accent-fg);
    font-size: 9px;
    font-weight: 700;
    text-anchor: middle;
  }
</style>
