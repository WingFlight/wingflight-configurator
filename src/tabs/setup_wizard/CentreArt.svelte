<!-- Side view of a tail section with its servo and linkage at neutral: the
     servo horn square to the pushrod (1) and the surface in line with the
     fixed part (2). Decorative; the tips next to it say the same. -->
<svg
  viewBox="0 0 200 90"
  class="centre-art"
  aria-hidden="true"
  focusable="false"
>
  <!-- In-line reference along the chord. -->
  <line class="guide" x1="4" y1="40" x2="196" y2="40" />

  <path
    class="fixed"
    d="M8 40 C8 34 18 32 32 32 L120 37 L120 43 L32 48 C18 48 8 46 8 40 Z"
  />
  <path class="surface" d="M120 37 L186 40 L120 43 Z" />
  <circle class="hinge" cx="120" cy="40" r="2" />

  <!-- Control horn on the surface, pushrod, servo horn and servo. -->
  <path class="horn" d="M131 41.5 L134 54 L139 54 L139 41 Z" />
  <line class="rod" x1="40" y1="52" x2="136" y2="52" />
  <rect class="servo" x="28" y="62" width="40" height="20" rx="3" />
  <rect class="horn" x="37" y="50" width="6" height="14" rx="3" />
  <circle class="spline" cx="40" cy="62" r="2.6" />
  <path class="square" d="M40 57 L45 57 L45 52" />

  <circle class="badge" cx="18" cy="62" r="7" />
  <text class="badge-text" x="18" y="65.5">1</text>
  <circle class="badge" cx="186" cy="24" r="7" />
  <text class="badge-text" x="186" y="27.5">2</text>
</svg>

<style lang="scss">
  .centre-art {
    display: block;
    width: 200px;
    height: auto;
    flex: none;
    overflow: visible;
    color: var(--color-text-muted);
  }

  .guide {
    stroke: var(--color-status-good);
    stroke-width: 1.2;
    stroke-dasharray: 4 3;
  }

  .fixed,
  .servo {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linejoin: round;
  }

  .surface {
    fill: var(--color-accent-500);
  }

  .hinge,
  .spline {
    fill: currentColor;
  }

  .horn {
    fill: var(--color-accent-soft);
    stroke: var(--color-accent-500);
    stroke-width: 1.2;
  }

  .rod {
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }

  .square {
    fill: none;
    stroke: var(--color-status-good);
    stroke-width: 1.4;
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
