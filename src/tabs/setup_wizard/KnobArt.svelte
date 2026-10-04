<script>
  // A rotary knob on a `min`-`max` % scale, pointing at `value`.
  // Decorative; the value is written next to it.
  let { value = 100, min = 25, max = 200 } = $props();

  const CX = 50;
  const CY = 48;
  const R = 34;
  // The scale runs from 225 degrees (min) round to -45 degrees (max).
  const FROM = 225;
  const SWEEP = 270;

  function point(deg, r) {
    const rad = (deg * Math.PI) / 180;
    return [CX + r * Math.cos(rad), CY - r * Math.sin(rad)];
  }

  function angle(v) {
    const f = Math.max(0, Math.min(1, (v - min) / (max - min)));
    return FROM - f * SWEEP;
  }

  const [ax, ay] = point(FROM, R);
  const [bx, by] = point(FROM - SWEEP, R);
  const arc = `M${ax} ${ay} A${R} ${R} 0 1 1 ${bx} ${by}`;
  const ticks = [min, (min + max) / 2, max].map((v) => ({
    v,
    inner: point(angle(v), R - 6),
    outer: point(angle(v), R + 4),
  }));

  let tip = $derived(point(angle(value), R - 12));
</script>

<svg viewBox="0 0 100 92" class="knob-art" aria-hidden="true" focusable="false">
  <path class="scale" d={arc} />
  {#each ticks as t (t.v)}
    <line
      class="tick"
      x1={t.inner[0]}
      y1={t.inner[1]}
      x2={t.outer[0]}
      y2={t.outer[1]}
    />
  {/each}
  <text class="label" x={CX} y="10">{(min + max) / 2}%</text>
  <text class="label" x="12" y="90">{min}%</text>
  <text class="label" x="88" y="90">{max}%</text>
  <circle class="knob" cx={CX} cy={CY} r={R - 10} />
  <line class="pointer" x1={CX} y1={CY} x2={tip[0]} y2={tip[1]} />
</svg>

<style lang="scss">
  .knob-art {
    display: block;
    width: 100px;
    height: auto;
    flex: none;
    overflow: visible;
    color: var(--color-text-muted);
  }

  .scale {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0.5;
  }

  .tick {
    stroke: currentColor;
    stroke-width: 1.5;
  }

  .label {
    fill: currentColor;
    font-size: 9px;
    font-weight: 600;
    text-anchor: middle;
  }

  .knob {
    fill: var(--color-surface);
    stroke: currentColor;
    stroke-width: 1.6;
  }

  .pointer {
    stroke: var(--color-accent-500);
    stroke-width: 3;
    stroke-linecap: round;
    transition: all 0.15s ease-out;
  }
</style>
