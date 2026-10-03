<script>
  // A small model rotating about one axis: roll seen from behind, pitch
  // from the side, yaw from above. Decorative; the axis name is next to it.
  let { axis, size = 36 } = $props();
</script>

<svg
  viewBox="0 0 48 48"
  class="axis-icon"
  style:width="{size}px"
  style:height="{size}px"
  aria-hidden="true"
  focusable="false"
>
  {#if axis === "roll"}
    <g transform="rotate(-18 24 30)">
      <line class="wing" x1="5" y1="30" x2="43" y2="30" />
      <line class="body-line" x1="24" y1="26" x2="24" y2="18" />
      <circle class="body" cx="24" cy="30" r="4.5" />
    </g>
    <path class="arrow" d="M10 12 A18 18 0 0 1 36 9" />
    <path class="head" d="M33 4.5 L40 10 L32 12.5 Z" />
  {:else if axis === "pitch"}
    <g transform="rotate(-18 24 30)">
      <path class="body" d="M6 28 L40 28.5 C44 29 44 32 40 32.5 L6 32 Z" />
      <path class="body" d="M6 28 L4 20 L10 20 L14 28 Z" />
      <ellipse class="wing-fill" cx="26" cy="30.3" rx="7" ry="2" />
    </g>
    <path class="arrow" d="M44 40 A18 18 0 0 0 44 16" />
    <path class="head" d="M40 18.5 L44 11 L47.5 18.5 Z" />
  {:else}
    <g transform="rotate(18 24 28)">
      <line class="wing" x1="7" y1="24" x2="41" y2="24" />
      <line class="wing" x1="17" y1="40" x2="31" y2="40" />
      <path
        class="body"
        d="M24 9 C27 11 27 14 26.5 18 L25.5 42 L22.5 42 L21.5 18 C21 14 21 11 24 9 Z"
      />
    </g>
    <path class="arrow" d="M12 8 A20 20 0 0 1 38 9" />
    <path class="head" d="M35 4.5 L42 10.5 L34 12.5 Z" />
  {/if}
</svg>

<style lang="scss">
  .axis-icon {
    display: block;
    width: 36px;
    height: 36px;
    flex: none;
    overflow: visible;
    color: var(--color-text-muted);
  }

  .body {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linejoin: round;
  }

  .body-line {
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  .wing {
    stroke: var(--color-accent-500);
    stroke-width: 3.2;
    stroke-linecap: round;
  }

  .wing-fill {
    fill: var(--color-accent-500);
  }

  .arrow {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .head {
    fill: currentColor;
  }
</style>
