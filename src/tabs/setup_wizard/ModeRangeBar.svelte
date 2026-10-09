<script>
  import { CHANNEL_MIN, CHANNEL_MAX } from "./modeRanges.js";

  // One AUX channel from end to end: the mode's range shaded (green while
  // the mode is on) and a dot where the switch is now.
  let { start, end, value = null, active = false } = $props();

  function percent(us) {
    const clamped = Math.max(CHANNEL_MIN, Math.min(CHANNEL_MAX, us));
    return ((clamped - CHANNEL_MIN) / (CHANNEL_MAX - CHANNEL_MIN)) * 100;
  }
</script>

<span class="bar" aria-hidden="true">
  <span
    class={["range", active && "on"]}
    style:left="{percent(start)}%"
    style:right="{100 - percent(end)}%"
  ></span>
  <span class="mid"></span>
  {#if value > 0}
    <span class="dot" style:left="{percent(value)}%"></span>
  {/if}
</span>

<style lang="scss">
  .bar {
    position: relative;
    display: inline-block;
    width: 160px;
    height: 10px;
    border-radius: var(--radius-pill);
    background-color: var(--color-border-soft);
  }

  .range {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: var(--radius-pill);
    background-color: var(--color-text-muted);
    opacity: 0.5;
    transition:
      background-color var(--animation-speed),
      opacity var(--animation-speed);

    &.on {
      background-color: var(--color-status-good);
      opacity: 1;
    }
  }

  .mid {
    position: absolute;
    left: 50%;
    top: -2px;
    bottom: -2px;
    width: 1px;
    background-color: var(--color-text-muted);
  }

  .dot {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    border: 2px solid var(--color-surface);
    border-radius: 50%;
    background-color: var(--color-accent-500);
    box-shadow: 0 0 0 1px var(--color-accent-500);
    transition: left var(--animation-speed);
  }
</style>
