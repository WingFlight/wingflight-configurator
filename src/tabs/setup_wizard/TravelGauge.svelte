<script>
  import { FC } from "@/js/fc.svelte.js";

  // One servo's travel either side of Mid: the binding limit on each side
  // (thick marks), how far full stick reaches (fill), anything past the
  // limit (red, in the zone outside the marks) and where the servo is now
  // (dot). Each side is drawn against its own limit, so the marks always
  // sit at the same place and 100% means "exactly at the limit".
  let { servo, reach } = $props();

  // Half the bar is LIMIT_AT of the way to the end: the rest shows overshoot,
  // up to OVER_MAX times the limit.
  const LIMIT_AT = 0.8;
  const OVER_MAX = 1.25;

  function along(fraction, side) {
    const f = Math.min(Math.max(fraction, 0), OVER_MAX);
    return 50 + side * f * LIMIT_AT * 50;
  }

  let config = $derived(FC.SERVO_CONFIG[servo]);
  let pulse = $derived(FC.SERVO_DATA[servo] ?? 0);
  let live = $derived.by(() => {
    if (!(pulse > 0) || !config) return null;
    const offset = pulse - config.mid;
    const limit = offset >= 0 ? config.max : -config.min;
    if (!(limit > 0)) return 50;
    return along(Math.abs(offset) / limit, offset >= 0 ? 1 : -1);
  });
</script>

<span class="gauge" aria-hidden="true">
  <span class="over left"></span>
  <span class="over right"></span>
  {#each [{ s: reach.neg, dir: -1 }, { s: reach.pos, dir: 1 }] as { s, dir } (dir)}
    <!-- Inside the limit: centre to reach. Past it: limit to reach. -->
    {@const inside = along(Math.min(s.fraction, 1), dir)}
    {@const limitAt = along(1, dir)}
    {@const end = along(s.fraction, dir)}
    <span
      class="fill"
      style:left="{Math.min(50, inside)}%"
      style:right="{100 - Math.max(50, inside)}%"
    ></span>
    {#if s.fraction > 1}
      <span
        class="fill clips"
        style:left="{Math.min(limitAt, end)}%"
        style:right="{100 - Math.max(limitAt, end)}%"
      ></span>
    {/if}
    <span class="limit" style:left="{limitAt}%"></span>
  {/each}
  <span class="centre"></span>
  {#if live !== null}
    <span class="dot" style:left="{live}%"></span>
  {/if}
</span>

<style lang="scss">
  .gauge {
    position: relative;
    display: block;
    width: 100%;
    height: 14px;
    border-radius: var(--radius-pill);
    background-color: var(--color-border-soft);
  }

  // Past the binding limit: the zone the surface can't reach.
  .over {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 10%;
    background: repeating-linear-gradient(
      -45deg,
      transparent 0 3px,
      color-mix(in srgb, var(--color-status-bad) 25%, transparent) 3px 6px
    );

    &.left {
      left: 0;
      border-radius: var(--radius-pill) 0 0 var(--radius-pill);
    }

    &.right {
      right: 0;
      border-radius: 0 var(--radius-pill) var(--radius-pill) 0;
    }
  }

  .fill {
    position: absolute;
    top: 3px;
    bottom: 3px;
    background-color: var(--color-accent-500);
    opacity: 0.85;

    &.clips {
      background-color: var(--color-status-bad);
      opacity: 1;
    }
  }

  .limit {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 4px;
    margin-left: -2px;
    border-radius: 2px;
    background-color: var(--color-text-muted);
  }

  .centre {
    position: absolute;
    left: 50%;
    top: -2px;
    bottom: -2px;
    width: 1px;
    background-color: var(--color-text);
  }

  .dot {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    border: 2px solid var(--color-surface);
    border-radius: 50%;
    background-color: var(--color-text);
    box-shadow: 0 0 0 1px var(--color-text);
    transition: left 0.1s linear;
  }
</style>
