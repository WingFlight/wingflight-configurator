<script>
  // How to move the model for one gyro check (grey arrow) and how the
  // surfaces should answer (red). Roll seen from behind, pitch from the
  // side (nose right), yaw from above (nose up). Decorative; the check's
  // text says the same.
  let { axis } = $props();
</script>

<svg viewBox="0 0 120 76" class="gyro-art" aria-hidden="true" focusable="false">
  {#if axis === "roll"}
    <g transform="rotate(16 60 42)">
      <line class="wing" x1="14" y1="42" x2="106" y2="42" />
      <line class="fin" x1="60" y1="35" x2="60" y2="20" />
      <circle class="body" cx="60" cy="42" r="7" />
      <line class="react" x1="90" y1="43" x2="105" y2="50" />
      <line class="react" x1="15" y1="34" x2="30" y2="41" />
    </g>
    <path class="move" d="M98 10 A46 46 0 0 1 114 32" />
    <path class="move-head" d="M109.5 31 L115.5 38 L117.5 28.5 Z" />
  {:else if axis === "pitch"}
    <g transform="rotate(-16 60 40)">
      <path
        class="body"
        d="M100 40 C98 35 90 34 80 34.5 L30 37 L20 36 L20 42 L80 45 C90 45.5 98 45 100 40 Z"
      />
      <path class="body" d="M30 37 L22 24 L28 24 L40 36.5 Z" />
      <ellipse class="plain" cx="76" cy="40" rx="14" ry="2.2" />
      <ellipse class="plain" cx="28" cy="39.5" rx="7" ry="1.6" />
      <line class="react" x1="21" y1="39.5" x2="12" y2="46" />
    </g>
    <path class="move" d="M112 58 A40 40 0 0 0 114 28" />
    <path class="move-head" d="M109.5 30 L114.5 22 L118.5 30.5 Z" />
  {:else}
    <g transform="rotate(16 60 40)">
      <line class="wing" x1="22" y1="30" x2="98" y2="30" />
      <line class="wing" x1="47" y1="61" x2="73" y2="61" />
      <path
        class="body"
        d="M60 6 C64 9 64 14 63 20 L61.5 64 L58.5 64 L57 20 C56 14 56 9 60 6 Z"
      />
      <line class="react" x1="60" y1="64" x2="54" y2="73" />
    </g>
    <path class="move" d="M42 6 A40 40 0 0 1 82 3" />
    <path class="move-head" d="M80 -1 L88 5 L79 8 Z" />
  {/if}
</svg>

<style lang="scss">
  .gyro-art {
    display: block;
    width: 132px;
    height: auto;
    flex: none;
    overflow: visible;
    color: var(--color-text-muted);
  }

  .body {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  .plain {
    fill: currentColor;
    opacity: 0.5;
  }

  .wing,
  .fin {
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
  }

  .react {
    stroke: var(--color-accent-500);
    stroke-width: 4;
    stroke-linecap: round;
  }

  .move {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-dasharray: 5 3;
  }

  .move-head {
    fill: currentColor;
  }
</style>
