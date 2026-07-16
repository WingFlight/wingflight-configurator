<script>
  import {
    PLOT_SIZE,
    PADDING,
    GUTTER_X,
    GUTTER_Y,
    PLOT_INNER,
    ticks,
  } from "./util.js";

  let { curve, model, xMin, xMax, yMin, yMax, xAxisValue, yAxisValue, onEdit } =
    $props();

  let svgEl;
  let dragIndex = $state(null);
  let dragPoint = $state(null);

  let activePoints = $derived(curve.points.slice(0, curve.count));
  let xTicks = $derived(ticks(xMin, xMax, xAxisValue));
  let yTicks = $derived(ticks(yMin, yMax, yAxisValue));

  function toSvgX(x) {
    return GUTTER_X + PADDING + ((x - xMin) / (xMax - xMin)) * PLOT_INNER;
  }
  function toSvgY(y) {
    return PADDING + PLOT_INNER - ((y - yMin) / (yMax - yMin)) * PLOT_INNER;
  }
  function fromSvgX(sx) {
    return ((sx - GUTTER_X - PADDING) / PLOT_INNER) * (xMax - xMin) + xMin;
  }
  function fromSvgY(sy) {
    return ((PLOT_INNER - (sy - PADDING)) / PLOT_INNER) * (yMax - yMin) + yMin;
  }

  function svgPointFromEvent(event) {
    const pt = svgEl.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const transformed = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    return { x: fromSvgX(transformed.x), y: fromSvgY(transformed.y) };
  }

  let polylinePoints = $derived(
    activePoints.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(" "),
  );

  function onCirclePointerDown(index, event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragIndex = index;
    dragPoint = activePoints[index];
  }

  function onCirclePointerMove(index, event) {
    if (dragIndex !== index) return;
    const point = svgPointFromEvent(event);
    const clamped = model.clampPoint(
      curve,
      index,
      Math.round(point.x),
      Math.round(point.y),
    );
    // Mutate in place (not curve.points[index] = clamped) so activePoints -
    // which shares the same point objects - stays reactive without a
    // manual re-render trigger.
    Object.assign(curve.points[index], clamped);
    dragPoint = clamped;
    onEdit?.();
  }

  function onCirclePointerUp(index) {
    if (dragIndex !== index) return;
    dragIndex = null;
    dragPoint = null;
  }

  function onCircleContextMenu(index, event) {
    event.preventDefault();
    if (model.removePoint(curve, index)) onEdit?.();
  }

  function onSvgClick(event) {
    if (event.target !== svgEl) return; // clicked a point, not the background
    const point = svgPointFromEvent(event);
    if (model.addPoint(curve, Math.round(point.x), Math.round(point.y))) {
      onEdit?.();
    }
  }

  let coordLabelText = $derived(
    dragPoint ? `${Math.round(dragPoint.x)}, ${Math.round(dragPoint.y)}` : "",
  );
  let coordLabelX = $derived(dragPoint ? toSvgX(dragPoint.x) + 14 : 0);
  let coordLabelY = $derived(dragPoint ? toSvgY(dragPoint.y) : 0);
  let coordLabelWidth = $derived(coordLabelText.length * 7 + 8);
</script>

<svg
  bind:this={svgEl}
  class="curveSvg"
  viewBox="0 0 434 416"
  onclick={onSvgClick}
>
  {#each xTicks as v (v)}
    <line
      x1={toSvgX(v)}
      x2={toSvgX(v)}
      y1={0}
      y2={PLOT_SIZE}
      class={v === xAxisValue ? "curveAxis" : "curveGrid"}
    />
    <text
      x={toSvgX(v)}
      y={PLOT_SIZE + GUTTER_Y - 4}
      text-anchor="middle"
      class={v === xAxisValue
        ? "curveAxisLabel curveAxisLabelBold"
        : "curveAxisLabel"}
    >
      {Math.round(v)}
    </text>
  {/each}
  {#each yTicks as v (v)}
    <line
      y1={toSvgY(v)}
      y2={toSvgY(v)}
      x1={GUTTER_X}
      x2={GUTTER_X + PLOT_SIZE}
      class={v === yAxisValue ? "curveAxis" : "curveGrid"}
    />
    <text
      x={GUTTER_X - 6}
      y={toSvgY(v)}
      text-anchor="end"
      dominant-baseline="middle"
      class={v === yAxisValue
        ? "curveAxisLabel curveAxisLabelBold"
        : "curveAxisLabel"}
    >
      {Math.round(v)}
    </text>
  {/each}

  <polyline class="curveLine" points={polylinePoints} />

  {#each activePoints as point, index (index)}
    <circle
      class="curvePoint"
      r="6"
      cx={toSvgX(point.x)}
      cy={toSvgY(point.y)}
      onpointerdown={(e) => onCirclePointerDown(index, e)}
      onpointermove={(e) => onCirclePointerMove(index, e)}
      onpointerup={() => onCirclePointerUp(index)}
      oncontextmenu={(e) => onCircleContextMenu(index, e)}
    />
  {/each}

  {#if dragPoint}
    <rect
      class="curveCoordLabelBg"
      x={coordLabelX - 4}
      y={coordLabelY - 12}
      width={coordLabelWidth}
      height="20"
      rx="3"
    />
    <text
      class="curveCoordLabel"
      x={coordLabelX}
      y={coordLabelY}
      dominant-baseline="middle"
    >
      {coordLabelText}
    </text>
  {/if}
</svg>

<style lang="scss">
  .curveSvg {
    width: 100%;
    height: 100%;
    background-color: var(--color-surface-float, var(--color-surface));
    border: 1px solid var(--color-border);
    touch-action: none;
  }

  :global(.curveGrid) {
    stroke: var(--color-border-soft);
    stroke-width: 1;
  }

  :global(.curveAxis) {
    stroke: var(--color-border);
    stroke-width: 1.5;
  }

  :global(.curveAxisLabel) {
    font-size: 11px;
    fill: var(--color-text-soft);
    user-select: none;
    pointer-events: none;
  }

  :global(.curveAxisLabelBold) {
    font-weight: bold;
    fill: var(--color-text);
  }

  :global(.curveLine) {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 2;
  }

  :global(.curvePoint) {
    fill: var(--color-accent-500);
    stroke: var(--color-surface-float, var(--color-surface));
    stroke-width: 1.5;
    cursor: pointer;

    @media (hover: hover) {
      &:hover {
        fill: var(--color-yellow-500);
      }
    }
  }

  :global(.curveCoordLabel) {
    font-size: 13px;
    fill: white;
    pointer-events: none;
  }

  :global(.curveCoordLabelBg) {
    fill: #333;
    opacity: 0.85;
    pointer-events: none;
  }
</style>
