<!-- A stick box with the stick in one corner and the other corners marked:
     "try full stick on two axes at once". Decorative; the text next to it
     says the same. -->
<svg
  viewBox="0 0 48 48"
  class="stick-corners"
  aria-hidden="true"
  focusable="false"
>
  <rect class="box" x="3" y="3" width="42" height="42" rx="8" />
  <line class="cross" x1="24" y1="9" x2="24" y2="39" />
  <line class="cross" x1="9" y1="24" x2="39" y2="24" />
  <rect class="path" x="12" y="12" width="24" height="24" rx="2" />
  <circle class="corner" cx="12" cy="12" r="3.5" />
  <circle class="corner" cx="12" cy="36" r="3.5" />
  <circle class="corner" cx="36" cy="36" r="3.5" />
  <line class="stick" x1="24" y1="24" x2="36" y2="12" />
  <circle class="knob" cx="36" cy="12" r="4.5" />
</svg>

<style lang="scss">
  .stick-corners {
    display: block;
    width: 64px;
    height: 64px;
    flex: none;
    color: var(--color-text-muted);
  }

  .box {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.6;
  }

  .cross {
    stroke: currentColor;
    stroke-width: 0.8;
    opacity: 0.4;
  }

  .path {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 1;
    stroke-dasharray: 2.5 2;
    opacity: 0.7;
  }

  .corner {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 1.4;
    stroke-dasharray: 2 1.5;
  }

  .stick {
    stroke: var(--color-accent-500);
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  .knob {
    fill: var(--color-accent-500);
  }
</style>
