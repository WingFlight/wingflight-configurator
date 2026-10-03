<!-- A stick gimbal with its two trim bars, each trim moved a little off
     center: "the trims". Decorative; the text next to it explains. -->
<svg viewBox="0 0 120 86" class="trim-art" aria-hidden="true" focusable="false">
  <rect class="gimbal" x="24" y="4" width="62" height="62" rx="10" />
  <line class="cross" x1="55" y1="12" x2="55" y2="58" />
  <line class="cross" x1="32" y1="35" x2="78" y2="35" />
  <line class="stick" x1="55" y1="35" x2="55" y2="35" />
  <circle class="knob" cx="55" cy="35" r="6" />

  <!-- Horizontal trim, below. -->
  <rect class="bar" x="24" y="74" width="62" height="6" rx="3" />
  <line class="centre" x1="55" y1="72" x2="55" y2="82" />
  <rect class="mark" x="62" y="72" width="5" height="10" rx="1.5" />
  <path class="arrow" d="M18 77 L12 77 M14 74.5 L11.5 77 L14 79.5" />
  <path class="arrow" d="M92 77 L98 77 M96 74.5 L98.5 77 L96 79.5" />

  <!-- Vertical trim, beside. -->
  <rect class="bar" x="96" y="4" width="6" height="62" rx="3" />
  <line class="centre" x1="94" y1="35" x2="104" y2="35" />
  <rect class="mark" x="94" y="23" width="10" height="5" rx="1.5" />
</svg>

<style lang="scss">
  .trim-art {
    display: block;
    width: 130px;
    height: auto;
    flex: none;
    overflow: visible;
    color: var(--color-text-muted);
  }

  .gimbal {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.4;
  }

  .cross {
    stroke: currentColor;
    stroke-width: 0.8;
    opacity: 0.4;
  }

  .knob {
    fill: var(--color-text-muted);
  }

  .bar {
    fill: var(--color-surface-sunken);
    stroke: currentColor;
    stroke-width: 1;
  }

  .centre {
    stroke: currentColor;
    stroke-width: 1;
  }

  .mark {
    fill: var(--color-accent-500);
  }

  .arrow {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
