<!-- A transmitter with both sticks held in the bottom-left corner: throttle
     and pitch low, roll and yaw left, so every channel is at its minimum.
     Decorative; the text next to it says the same. -->
<svg
  viewBox="0 0 160 92"
  class="sticks-art"
  aria-hidden="true"
  focusable="false"
>
  <line class="antenna" x1="132" y1="16" x2="146" y2="2" />
  <rect class="radio" x="6" y="16" width="148" height="72" rx="14" />

  {#each [44, 116] as cx (cx)}
    {@const cy = 52}
    <rect
      class="gimbal"
      x={cx - 24}
      y={cy - 24}
      width="48"
      height="48"
      rx="8"
    />
    <line class="cross" x1={cx} y1={cy - 18} x2={cx} y2={cy + 18} />
    <line class="cross" x1={cx - 18} y1={cy} x2={cx + 18} y2={cy} />
    <circle class="ghost" {cx} {cy} r="5" />
    <line class="stick" x1={cx} y1={cy} x2={cx - 15} y2={cy + 15} />
    <circle class="knob" cx={cx - 15} cy={cy + 15} r="5" />
  {/each}
</svg>

<style lang="scss">
  .sticks-art {
    display: block;
    width: 170px;
    height: auto;
    flex: none;
    overflow: visible;
    color: var(--color-text-muted);
  }

  .antenna {
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .radio {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.6;
  }

  .gimbal {
    fill: var(--color-surface-sunken);
    stroke: currentColor;
    stroke-width: 1.2;
  }

  .cross {
    stroke: currentColor;
    stroke-width: 0.8;
    opacity: 0.4;
  }

  .ghost {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 1.2;
    stroke-dasharray: 2 2;
    opacity: 0.7;
  }

  .stick {
    stroke: var(--color-text);
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  .knob {
    fill: var(--color-accent-500);
  }
</style>
