<script>
  // An outrunner motor from the side with its prop. `propOff`: the prop is
  // dashed and crossed out in red ("take the prop off"). `spinning`: an
  // arrow turns around the bell. Decorative; the text next to it says the
  // same.
  let { propOff = false, spinning = false } = $props();
</script>

<svg
  viewBox="0 0 120 84"
  class="motor-art"
  aria-hidden="true"
  focusable="false"
>
  <ellipse
    class={["prop", propOff && "off"]}
    cx="60"
    cy="13"
    rx="52"
    ry="4.5"
  />
  <rect class="body" x="56" y="6" width="8" height="18" rx="2" />
  <rect class="bell" x="36" y="24" width="48" height="30" rx="4" />
  {#each [44, 52, 60, 68, 76] as x (x)}
    <line class="stripe" x1={x} y1="28" x2={x} y2="50" />
  {/each}
  <rect class="body" x="32" y="54" width="56" height="8" rx="2" />
  <rect class="body" x="22" y="62" width="76" height="6" rx="2" />
  <path class="wire" d="M88 58 C100 58 102 74 116 76" />
  <path class="wire accent" d="M88 60 C98 62 100 80 112 82" />

  {#if propOff}
    <line class="no" x1="14" y1="4" x2="106" y2="22" />
    <line class="no" x1="14" y1="22" x2="106" y2="4" />
  {/if}

  {#if spinning}
    <g class="spin">
      <path class="turn" d="M28 39 A32 14 0 0 1 92 39" />
      <path class="turn-head" d="M88 33 L95 39 L86 41 Z" />
    </g>
  {/if}
</svg>

<style lang="scss">
  .motor-art {
    display: block;
    width: 140px;
    height: auto;
    flex: none;
    overflow: visible;
    color: var(--color-text-muted);
  }

  .body {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.5;
  }

  .bell {
    fill: var(--color-accent-soft);
    stroke: var(--color-accent-500);
    stroke-width: 1.6;
  }

  .stripe {
    stroke: var(--color-accent-500);
    stroke-width: 1;
    opacity: 0.5;
  }

  .prop {
    fill: currentColor;
    opacity: 0.8;

    &.off {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.2;
      stroke-dasharray: 4 3;
      opacity: 0.6;
    }
  }

  .wire {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;

    &.accent {
      stroke: var(--color-accent-500);
    }
  }

  .no {
    stroke: var(--color-status-bad);
    stroke-width: 3.5;
    stroke-linecap: round;
  }

  .turn {
    fill: none;
    stroke: var(--color-text);
    stroke-width: 2;
    stroke-linecap: round;
  }

  .turn-head {
    fill: var(--color-text);
  }

  .spin {
    animation: pulse 0.6s ease-in-out infinite alternate;
  }

  @keyframes pulse {
    from {
      opacity: 0.35;
    }

    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }
</style>
