<script>
  // A transmitter (screen pod on top, two gimbals). `use` false: crossed out,
  // "don't use the radio on this step". `use` true: right stick pushed over
  // and a tick, "use your radio here". Decorative; the text next to it says
  // the same.
  let { use = false } = $props();
</script>

<svg
  viewBox="0 0 80 64"
  class="radio-icon"
  aria-hidden="true"
  focusable="false"
>
  <line class="line" x1="15" y1="21" x2="11" y2="11" />
  <line class="line" x1="65" y1="21" x2="69" y2="11" />
  <rect class="body" x="5" y="19" width="70" height="40" rx="11" />
  <rect class="body" x="24" y="3" width="32" height="20" rx="4" />
  <rect class="screen" x="27.5" y="6.5" width="25" height="13" rx="1.5" />
  <circle class="gimbal" cx="21" cy="39" r="11" />
  <circle class="gimbal" cx="59" cy="39" r="11" />
  <rect class="housing" x="15" y="35" width="12" height="8" rx="1.5" />
  <rect class="housing" x="53" y="35" width="12" height="8" rx="1.5" />
  <circle class="knob" cx="21" cy="39" r="2.4" />
  <circle class="small" cx="40" cy="38" r="4" />
  {#if use}
    <line class="stick" x1="59" y1="39" x2="66" y2="39" />
    <circle class="knob pushed" cx="66" cy="39" r="3" />
    <circle class="yes" cx="70" cy="56" r="9" />
    <path class="tick" d="M65.5 56 L69 59.5 L75 52.5" />
  {:else}
    <circle class="knob" cx="59" cy="39" r="2.4" />
    <circle class="no" cx="40" cy="32" r="29" />
    <line class="no" x1="19.5" y1="11.5" x2="60.5" y2="52.5" />
  {/if}
</svg>

<style lang="scss">
  .radio-icon {
    display: block;
    width: 72px;
    height: auto;
    flex: none;
    overflow: visible;
    color: var(--color-text-muted);
  }

  .body {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.8;
  }

  .screen {
    fill: var(--color-border-soft);
    stroke: currentColor;
    stroke-width: 1.2;
  }

  .gimbal {
    fill: var(--color-surface-sunken);
    stroke: currentColor;
    stroke-width: 1.6;
  }

  .housing,
  .small {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
  }

  .line {
    stroke: currentColor;
    stroke-width: 2.6;
    stroke-linecap: round;
  }

  .knob {
    fill: currentColor;

    &.pushed {
      fill: var(--color-accent-500);
    }
  }

  .stick {
    stroke: var(--color-accent-500);
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  .no {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 4;
    stroke-linecap: round;
    opacity: 0.9;
  }

  .yes {
    fill: var(--color-status-good);
    stroke: var(--color-surface);
    stroke-width: 2;
  }

  .tick {
    fill: none;
    stroke: #fff;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
