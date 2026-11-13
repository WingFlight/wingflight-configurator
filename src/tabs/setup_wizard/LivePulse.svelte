<script>
  import { FC } from "@/js/fc.svelte.js";
  import { servoUsableTravel } from "@/js/servoLimits.js";

  // Live output of one servo, drawn against the Min/Max it can use either
  // side of Mid.
  let { servo } = $props();

  let config = $derived(FC.SERVO_CONFIG[servo]);
  let pulse = $derived(FC.SERVO_DATA[servo] ?? 0);
  // 0 means no reading yet (or a board that doesn't report it).
  let known = $derived(pulse > 0 && !!config);
  let offset = $derived(known ? pulse - config.mid : 0);
  let span = $derived.by(() => {
    if (!config) return 1;
    const usable = servoUsableTravel(config);
    return Math.max(usable.max, -usable.min, 1);
  });
  let fraction = $derived(Math.max(-1, Math.min(1, offset / span)));
</script>

<span class="pulse">
  <span class="track" aria-hidden="true">
    <span class="centre"></span>
    <span
      class="fill"
      style:left={fraction >= 0 ? "50%" : `${50 + fraction * 50}%`}
      style:width={`${Math.abs(fraction) * 50}%`}
    ></span>
  </span>
  <span class="reading">
    {#if known}
      {pulse} µs ({offset >= 0 ? "+" : ""}{offset})
    {:else}
      –
    {/if}
  </span>
</span>

<style lang="scss">
  .pulse {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-variant-numeric: tabular-nums;
    font-size: 0.9em;
  }

  .track {
    position: relative;
    width: 120px;
    height: 8px;
    border-radius: var(--radius-pill);
    background-color: var(--color-surface-sunken, var(--color-border-soft));
    overflow: hidden;
  }

  .centre {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 1px;
    background-color: var(--color-border);
  }

  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    background-color: var(--color-accent-500);
  }

  .reading {
    min-width: 11ch;
    color: var(--color-text-soft);
  }
</style>
