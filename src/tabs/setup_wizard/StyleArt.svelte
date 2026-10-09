<script>
  // A small model on the kind of flight path each style is for: gentle
  // turns (trainer), a loop (sport), a hover (3D). Decorative; the card's
  // text names the style.
  let { style } = $props();
</script>

{#snippet plane(x, y, angle)}
  <g transform="translate({x} {y}) rotate({angle})">
    <path
      class="body"
      d="M20 0 C19 -3 14 -3.5 8 -3.2 L-14 -1.5 L-20 -2.2 L-20 1.8 L8 3.2 C14 3.5 19 3 20 0 Z"
    />
    <path class="body" d="M-14 -1.5 L-19 -9 L-15.5 -9 L-8 -2 Z" />
    <ellipse class="wing" cx="6" cy="0" rx="8" ry="1.5" />
    <line class="prop" x1="21.5" y1="-6" x2="21.5" y2="6" />
  </g>
{/snippet}

<svg
  viewBox="0 0 120 64"
  class="style-art"
  aria-hidden="true"
  focusable="false"
>
  {#if style === "trainer"}
    <path class="path" d="M4 48 C24 36 40 34 56 40 S84 46 92 38" />
    {@render plane(98, 32, -14)}
  {:else if style === "sport"}
    <circle class="path" cx="56" cy="32" r="24" />
    <path class="path" d="M4 58 L42 56" />
    {@render plane(80, 34, -95)}
  {:else}
    <line class="ground" x1="20" y1="60" x2="100" y2="60" />
    <line class="path" x1="36" y1="52" x2="48" y2="52" />
    <line class="path" x1="72" y1="52" x2="84" y2="52" />
    {@render plane(60, 26, -90)}
    <path class="wash" d="M48 8 Q44 3 48 -1" />
    <path class="wash" d="M72 8 Q76 3 72 -1" />
  {/if}
</svg>

<style lang="scss">
  .style-art {
    display: block;
    width: 120px;
    height: auto;
    overflow: visible;
    color: var(--color-text-muted);
  }

  .body {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.2;
    stroke-linejoin: round;
  }

  .wing {
    fill: var(--color-accent-500);
  }

  .prop {
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
  }

  .path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-dasharray: 4 3;
    stroke-linecap: round;
    opacity: 0.7;
  }

  .ground {
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    opacity: 0.6;
  }

  .wash {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
    stroke-linecap: round;
    opacity: 0.5;
  }
</style>
