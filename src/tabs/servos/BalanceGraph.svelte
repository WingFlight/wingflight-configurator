<script>
  import { ServoBalanceCurve } from "@/js/ServoBalanceCurve.js";

  // One servo's balance curve, drawn like the Balance channels screen on
  // ETHOS: the servo's mixer output along X (-100..100%), the balance offset
  // along Y (+-10%). The marker is where the servo is now: held there by the
  // tool, or moved by the sticks.
  //
  // onSelect(index): a point was clicked (the tool holds the servos there).
  // onDrag(index, y): a point was dragged to offset y (curve units).
  // onKey(event): keys while the graph has focus (nudge, next point).
  let {
    title,
    curve,
    selected = null,
    nearest = null,
    markerX = null,
    holding = false,
    active = false,
    info = null,
    onSelect,
    onDrag,
    onDragEnd,
    onKey,
    onFocus,
    children,
  } = $props();

  // Wide and short: the offsets are small, so the curve needs little height,
  // and a group of four still fits on one screen.
  const W = 1600;
  const H = 120;
  const PAD = 8;

  let svgEl;
  let dragIndex = $state(null);

  let points = $derived(curve.points.slice(0, curve.count));

  function sx(x) {
    return (
      PAD +
      ((x - ServoBalanceCurve.X_MIN) /
        (ServoBalanceCurve.X_MAX - ServoBalanceCurve.X_MIN)) *
        (W - 2 * PAD)
    );
  }

  function sy(y) {
    return (
      PAD +
      (1 -
        (y - ServoBalanceCurve.Y_MIN) /
          (ServoBalanceCurve.Y_MAX - ServoBalanceCurve.Y_MIN)) *
        (H - 2 * PAD)
    );
  }

  function yFromEvent(event) {
    const pt = svgEl.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const local = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    const t = 1 - (local.y - PAD) / (H - 2 * PAD);
    const y =
      ServoBalanceCurve.Y_MIN +
      t * (ServoBalanceCurve.Y_MAX - ServoBalanceCurve.Y_MIN);
    return Math.round(
      Math.min(Math.max(y, ServoBalanceCurve.Y_MIN), ServoBalanceCurve.Y_MAX),
    );
  }

  function pointerDown(index, event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragIndex = index;
    svgEl.parentElement.focus();
    onSelect?.(index);
  }

  function pointerMove(index, event) {
    if (dragIndex !== index) return;
    onDrag?.(index, yFromEvent(event));
  }

  function pointerUp(index) {
    if (dragIndex !== index) return;
    dragIndex = null;
    onDragEnd?.(index);
  }

  const quarters = [-750, -500, -250, 250, 500, 750];
  const halves = [-50, 50];

  let polyline = $derived(points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" "));

  // The info box sits by the marker, on whichever side has room.
  // The info box is about the selected point, so it sits by that point.
  let infoX = $derived(
    selected !== null
      ? sx(points[selected].x)
      : markerX === null
        ? sx(0)
        : sx(markerX),
  );
  let infoLeft = $derived(infoX > W - 240);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class={["graph", active && "active"]}
  tabindex="0"
  role="group"
  aria-label={title}
  onkeydown={(e) => onKey?.(e)}
  onfocus={() => onFocus?.()}
>
  <div class="head">
    <span class="title">{title}</span>
    {@render children?.()}
  </div>
  <svg bind:this={svgEl} viewBox="0 0 {W} {H}">
    <rect
      class="plot"
      x={PAD}
      y={PAD}
      width={W - 2 * PAD}
      height={H - 2 * PAD}
    />
    {#each quarters as x (x)}
      <line class="grid" x1={sx(x)} x2={sx(x)} y1={PAD} y2={H - PAD} />
    {/each}
    {#each halves as y (y)}
      <line class="grid" x1={PAD} x2={W - PAD} y1={sy(y)} y2={sy(y)} />
    {/each}
    <line class="axis" x1={sx(0)} x2={sx(0)} y1={PAD} y2={H - PAD} />
    <line class="axis" x1={PAD} x2={W - PAD} y1={sy(0)} y2={sy(0)} />

    <text class="label" x={W - PAD - 6} y={PAD + 16} text-anchor="end"
      >+10%</text
    >
    <text class="label" x={PAD + 6} y={H - PAD - 6}>−10%</text>
    <text class="label" x={sx(0) + 6} y={sy(0) + 16}>0%</text>

    {#if markerX !== null}
      <line
        class={["marker", holding && "holding"]}
        x1={sx(markerX)}
        x2={sx(markerX)}
        y1={PAD}
        y2={H - PAD}
      />
    {/if}

    <polyline class="curve" points={polyline} />

    {#each points as point, i (i)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <circle
        class={[
          "point",
          selected === i && "selected",
          selected !== i && nearest === i && "nearest",
        ]}
        cx={sx(point.x)}
        cy={sy(point.y)}
        r={selected === i ? 9 : 6}
        onpointerdown={(e) => pointerDown(i, e)}
        onpointermove={(e) => pointerMove(i, e)}
        onpointerup={() => pointerUp(i)}
        onpointercancel={() => pointerUp(i)}
      />
    {/each}
  </svg>
  {#if info}
    <div
      class="info"
      style:left={infoLeft ? null : `${(infoX / W) * 100}%`}
      style:right={infoLeft ? `${(1 - infoX / W) * 100}%` : null}
    >
      {#each info as line (line)}
        <span>{line}</span>
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .graph {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 8px 6px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    outline: none;

    &.active,
    &:focus-visible {
      border-color: var(--color-accent-500);
      box-shadow: 0 0 0 1px var(--color-accent-500);
    }
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 1.6em;
  }

  .title {
    font-weight: 600;
    flex-grow: 1;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    touch-action: none;
  }

  .plot {
    fill: var(--color-surface-sunken, var(--color-surface));
    stroke: var(--color-border);
    vector-effect: non-scaling-stroke;
  }

  .grid {
    stroke: var(--color-border);
    stroke-dasharray: 3 4;
    vector-effect: non-scaling-stroke;
  }

  .axis {
    stroke: var(--color-text-soft);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .label {
    fill: var(--color-text-soft);
    font-size: 13px;
  }

  .marker {
    stroke: var(--color-text-soft);
    stroke-width: 2;
    stroke-dasharray: 6 4;
    vector-effect: non-scaling-stroke;

    &.holding {
      stroke: var(--color-accent-500);
      stroke-dasharray: none;
    }
  }

  .curve {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
  }

  .point {
    fill: var(--color-surface);
    stroke: var(--color-accent-500);
    stroke-width: 2;
    cursor: ns-resize;
    vector-effect: non-scaling-stroke;

    &.nearest {
      fill: var(--color-accent-soft);
    }

    &.selected {
      fill: var(--color-accent-500);
    }
  }

  // Like the X / Δ box on the ETHOS screen.
  .info {
    position: absolute;
    top: 34px;
    display: flex;
    flex-direction: column;
    margin: 0 8px;
    padding: 2px 6px;
    border-radius: var(--radius-xs);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
</style>
