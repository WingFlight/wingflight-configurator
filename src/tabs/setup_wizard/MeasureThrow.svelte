<!-- Side view of a tail section with the surface at full throw, a ruler at
     the trailing edge and the distance measured marked. Decorative; the
     steps next to it say the same. -->
<svg viewBox="0 0 170 84" class="measure" aria-hidden="true" focusable="false">
  <path class="neutral" d="M84 40.5 L144 45 L84 49.5 Z" />
  <path
    class="fixed"
    d="M8 45 C8 38 18 36 32 36 L84 40.5 L84 49.5 L32 54 C18 54 8 52 8 45 Z"
  />
  <path
    class="moving"
    transform="rotate(-22 84 45)"
    d="M84 40.5 L144 45 L84 49.5 Z"
  />
  <circle class="hinge" cx="84" cy="45" r="2" />

  <rect class="ruler" x="150" y="6" width="12" height="72" rx="1.5" />
  {#each Array.from({ length: 14 }, (_, i) => 10 + i * 5) as y, i (y)}
    <line class="tick" x1="150" y1={y} x2={i % 2 ? 155 : 158} y2={y} />
  {/each}

  <line class="dim" x1="140" y1="45" x2="140" y2="25" />
  <path class="head" d="M137 28.5 L140 22.5 L143 28.5 Z" />
  <path class="head" d="M137 41.5 L140 47.5 L143 41.5 Z" />
  <line class="guide" x1="137" y1="22.5" x2="150" y2="22.5" />
  <line class="guide" x1="144" y1="45" x2="150" y2="45" />
</svg>

<style lang="scss">
  .measure {
    display: block;
    width: 170px;
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

  .neutral {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
    stroke-dasharray: 3 2;
  }

  .moving {
    fill: var(--color-accent-500);
  }

  .hinge {
    fill: currentColor;
  }

  .ruler {
    fill: var(--color-yellow-100);
    stroke: currentColor;
    stroke-width: 1.2;
  }

  .tick {
    stroke: currentColor;
    stroke-width: 1;
  }

  .dim {
    stroke: var(--color-accent-500);
    stroke-width: 1.6;
  }

  .head {
    fill: var(--color-accent-500);
  }

  .guide {
    stroke: var(--color-accent-500);
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }
</style>
