<script>
  import { FC } from "@/js/fc.svelte.js";

  // Where one servo's Mid sits against the normal center of its band
  // (`centre`): the middle zone is within `warn` µs, the rest is "move the
  // horn instead". The pointer is Mid, the dot the live output, which should
  // sit on it while the wizard holds the servo.
  let { servo, centre, warn } = $props();

  // The bar spans twice the warning offset either side.
  const SPAN = 2;

  function along(offset) {
    const f = Math.max(-1, Math.min(1, offset / (warn * SPAN)));
    return 50 + f * 50;
  }

  let config = $derived(FC.SERVO_CONFIG[servo]);
  let pulse = $derived(FC.SERVO_DATA[servo] ?? 0);
  let mid = $derived(along(config.mid - centre));
  let live = $derived(pulse > 0 ? along(pulse - centre) : null);
  let far = $derived(Math.abs(config.mid - centre) > warn);
  let zone = 50 / SPAN;
</script>

<span class="gauge" aria-hidden="true">
  <span class="zone" style:left="{50 - zone}%" style:right="{50 - zone}%"
  ></span>
  <span class="centre"></span>
  {#if live !== null}
    <span class="dot" style:left="{live}%"></span>
  {/if}
  <span class={["pointer", far && "far"]} style:left="{mid}%"></span>
</span>

<style lang="scss">
  .gauge {
    position: relative;
    display: block;
    width: 100%;
    height: 14px;
    margin-top: 8px;
    border-radius: var(--radius-pill);
    background: repeating-linear-gradient(
      -45deg,
      var(--color-border-soft) 0 3px,
      color-mix(in srgb, var(--color-yellow-500) 22%, transparent) 3px 6px
    );
  }

  // Within the warning offset: fine-tune here.
  .zone {
    position: absolute;
    top: 0;
    bottom: 0;
    background-color: color-mix(
      in srgb,
      var(--color-status-good) 30%,
      var(--color-surface)
    );
  }

  .centre {
    position: absolute;
    left: 50%;
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
    background-color: var(--color-text);
  }

  .dot {
    position: absolute;
    top: 50%;
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    border-radius: 50%;
    background-color: var(--color-text);
    transition: left 0.1s linear;
  }

  // Mid: a downward triangle above the bar.
  .pointer {
    position: absolute;
    top: -9px;
    width: 0;
    height: 0;
    margin-left: -7px;
    border: 7px solid transparent;
    border-top-color: var(--color-accent-500);
    border-bottom: 0;
    transition: left 0.15s ease-out;

    &.far {
      border-top-color: var(--color-yellow-500);
    }
  }
</style>
