<!-- Two wing sections side by side, each with its aileron at full stick:
     one goes up a lot, the other down a little. The usual reason to
     fine-tune one surface and direction (aileron differential).
     Decorative; the text next to it explains. -->
{#snippet section(x, angle, arc)}
  <path
    class="ghost"
    transform="translate({x} 0)"
    d="M44 28.5 L74 31 L44 33.5 Z"
  />
  <path
    class="fixed"
    transform="translate({x} 0)"
    d="M4 31 C4 26 10 24 18 24 L44 28.5 L44 33.5 L18 38 C10 38 4 36 4 31 Z"
  />
  <path
    class="moving"
    transform="translate({x} 0) rotate({angle} 44 31)"
    d="M44 28.5 L74 31 L44 33.5 Z"
  />
  <path class="arc" transform="translate({x} 0)" d={arc} />
{/snippet}

<svg
  viewBox="0 0 170 62"
  class="differential"
  aria-hidden="true"
  focusable="false"
>
  {@render section(0, -28, "M76 31 A32 32 0 0 0 72.3 16")}
  {@render section(88, 12, "M76 31 A32 32 0 0 1 75.3 37.6")}
  <text class="label" x="40" y="58">↑ 100%</text>
  <text class="label" x="128" y="58">↓ 50%</text>
</svg>

<style lang="scss">
  .differential {
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
    stroke-width: 1.3;
    stroke-linejoin: round;
  }

  .ghost {
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
    stroke-dasharray: 3 2;
  }

  .moving {
    fill: var(--color-accent-500);
  }

  .arc {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 1.4;
  }

  .label {
    fill: currentColor;
    font-size: 9px;
    font-weight: 700;
    text-anchor: middle;
  }
</style>
