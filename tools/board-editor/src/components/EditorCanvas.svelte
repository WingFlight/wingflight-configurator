<script>
  /**
   * File: tools/board-editor/src/components/EditorCanvas.svelte
   * Where the pads get placed: the view's background at its real size,
   * a millimetre grid over it, and one draggable marker per pad.
   *
   * Coordinates are the profile's own millimetres throughout. Screen
   * pixels are converted through the SVG's own transform, so the
   * numbers the author drags are the numbers that get written.
   */
  import { getEditorState } from "~editor/lib/editor_state.svelte.js";

  let { onPick = null } = $props();

  const editor = getEditorState();

  const MARGIN = 6;
  const PAD_RADIUS = 1.3;

  let svgElement = $state(null);
  let dragging = $state(null);
  /** Clicking empty space adds a pad while this is on. */
  let addMode = $state(false);

  let view = $derived(editor.view);
  let viewBox = $derived(
    view
      ? `${-MARGIN} ${-MARGIN} ${view.width + 2 * MARGIN} ${view.height + 2 * MARGIN}`
      : "0 0 1 1",
  );

  // A grid fine enough to place against but coarse enough to see
  // through: minor lines at the snap step, major every 5 mm.
  let gridLines = $derived.by(() => {
    if (!view) return { minor: [], major: [] };
    const minor = [];
    const major = [];
    for (let x = 0; x <= view.width + 0.001; x += 1) {
      (x % 5 === 0 ? major : minor).push(["v", x]);
    }
    for (let y = 0; y <= view.height + 0.001; y += 1) {
      (y % 5 === 0 ? major : minor).push(["h", y]);
    }
    return { minor, major };
  });

  let headers = $derived(
    (editor.board?.headers ?? []).filter((header) => header.view === editor.viewId),
  );

  function toBoard(event) {
    const point = svgElement.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(svgElement.getScreenCTM().inverse());
    return { x: local.x, y: local.y };
  }

  function onPadPointerDown(event, pad) {
    event.stopPropagation();
    editor.selectedPin = pad.pin;
    onPick?.(pad.pin);
    const start = toBoard(event);
    dragging = {
      pin: pad.pin,
      offsetX: pad.x - start.x,
      offsetY: pad.y - start.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!dragging) return;
    const point = toBoard(event);
    // The undo entry is taken on the first real move, not on the press,
    // so a click that only selects leaves nothing to undo.
    if (!dragging.moved) {
      dragging.moved = true;
      editor.beginDrag();
    }
    editor.dragPad(
      dragging.pin,
      point.x + dragging.offsetX,
      point.y + dragging.offsetY,
    );
  }

  function onPointerUp() {
    if (dragging?.moved) editor.endDrag(dragging.pin);
    dragging = null;
  }

  function onCanvasClick(event) {
    if (!addMode || dragging) return;
    const point = toBoard(event);
    editor.addPad({ x: editor.snapped(point.x), y: editor.snapped(point.y) });
    addMode = false;
  }

  // Arrow keys nudge the selected pad by one snap step, shift by five,
  // which is how you get a pad exactly onto a 2.54 mm pitch.
  function onKeyDown(event) {
    const pad = editor.selectedPad;
    if (!pad || pad.view !== editor.viewId) return;
    const step = (editor.snap || 0.1) * (event.shiftKey ? 5 : 1);
    const moves = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    editor.movePad(pad.pin, pad.x + move[0], pad.y + move[1]);
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="wrap">
  <div class="tools">
    <button
      class={["tool", addMode && "on"]}
      onclick={() => (addMode = !addMode)}
      aria-pressed={addMode}
    >
      {addMode ? "Click the board to place" : "Add pad"}
    </button>
    <label>
      Snap
      <select
        value={String(editor.snap)}
        onchange={(event) => (editor.snap = Number(event.currentTarget.value))}
      >
        <option value="0">off</option>
        <option value="0.1">0.1 mm</option>
        <option value="0.254">0.254 mm</option>
        <option value="1.27">1.27 mm (half pitch)</option>
        <option value="2.54">2.54 mm (header pitch)</option>
      </select>
    </label>
    <span class="hint">
      Drag a pad to move it. Arrow keys nudge, shift for five steps.
    </span>
  </div>

  {#if view}
    <svg
      bind:this={svgElement}
      class={["canvas", addMode && "adding"]}
      {viewBox}
      role="application"
      aria-label="Board layout"
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onclick={onCanvasClick}
    >
      <rect
        class="pcb"
        x="0"
        y="0"
        width={view.width}
        height={view.height}
        rx="1.5"
      />
      {#if view.background}
        <image
          class="backdrop"
          href={view.background}
          x="0"
          y="0"
          width={view.width}
          height={view.height}
          opacity={view.backgroundOpacity}
          preserveAspectRatio="none"
        />
      {/if}

      <g class="grid minor">
        {#each gridLines.minor as [axis, at] (`${axis}${at}`)}
          {#if axis === "v"}
            <line x1={at} y1="0" x2={at} y2={view.height} />
          {:else}
            <line x1="0" y1={at} x2={view.width} y2={at} />
          {/if}
        {/each}
      </g>
      <g class="grid major">
        {#each gridLines.major as [axis, at] (`${axis}${at}`)}
          {#if axis === "v"}
            <line x1={at} y1="0" x2={at} y2={view.height} />
          {:else}
            <line x1="0" y1={at} x2={view.width} y2={at} />
          {/if}
        {/each}
      </g>

      {#each view.mountHoles as [hx, hy] (`${hx},${hy}`)}
        <circle class="hole" cx={hx} cy={hy} r="1.5" />
      {/each}

      {#each headers as header (header.id)}
        {@const own = editor.padsHere.filter((pad) => pad.header === header.id)}
        {#if own.length || header.width !== null}
          {@const box =
            header.width !== null && header.height !== null
              ? header
              : {
                  x: Math.min(...own.map((p) => p.x)) - 2.2,
                  y: Math.min(...own.map((p) => p.y)) - 2.2,
                  width:
                    Math.max(...own.map((p) => p.x)) -
                    Math.min(...own.map((p) => p.x)) +
                    4.4,
                  height:
                    Math.max(...own.map((p) => p.y)) -
                    Math.min(...own.map((p) => p.y)) +
                    4.4,
                }}
          <g class="header">
            <rect
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx="0.8"
            />
            <text x={box.x} y={box.y - 0.8}>{header.label ?? header.id}</text>
          </g>
        {/if}
      {/each}

      {#each editor.padsHere as pad (pad.pin)}
        <g
          class="pad group-{pad.group}"
          class:selected={editor.selectedPin === pad.pin}
          role="button"
          tabindex="0"
          aria-label={`${pad.silkscreen ?? pad.pin} at ${pad.x}, ${pad.y}`}
          onpointerdown={(event) => onPadPointerDown(event, pad)}
          onkeydown={(event) => {
            if (event.key === "Enter") {
              editor.selectedPin = pad.pin;
              onPick?.(pad.pin);
            }
          }}
        >
          <circle class="dot" cx={pad.x} cy={pad.y} r={PAD_RADIUS} />
          <text class="tag" x={pad.x} y={pad.y - 2}>
            {pad.silkscreen ?? pad.pin}
          </text>
        </g>
      {/each}
    </svg>

    <p class="readout">
      {view.width} × {view.height} mm · {editor.padsHere.length} pads on this view
      {#if editor.selectedPad && editor.selectedPad.view === editor.viewId}
        · selected {editor.selectedPad.silkscreen ?? editor.selectedPad.pin} at
        {editor.selectedPad.x.toFixed(2)}, {editor.selectedPad.y.toFixed(2)}
      {/if}
    </p>
  {:else}
    <p class="readout">This board has no {editor.viewId} view yet.</p>
  {/if}
</div>

<style lang="scss">
  .wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .tools {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 0.8rem;
  }

  .tool {
    @extend %button;

    &.on {
      border-color: var(--color-border-accent);
    }
  }

  .hint {
    color: var(--color-text-muted);
  }

  .canvas {
    display: block;
    width: 100%;
    max-width: 900px;
    height: auto;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    touch-action: none;

    &.adding {
      cursor: crosshair;
    }
  }

  .pcb {
    fill: var(--color-surface-sunken);
    stroke: var(--color-border);
    stroke-width: 0.3;
  }

  .backdrop {
    pointer-events: none;
  }

  .grid line {
    stroke: var(--color-border);
    pointer-events: none;
  }

  .grid.minor line {
    stroke-width: 0.05;
    opacity: 0.4;
  }

  .grid.major line {
    stroke-width: 0.1;
    opacity: 0.75;
  }

  .hole {
    fill: var(--color-bg);
    stroke: var(--color-border);
    stroke-width: 0.3;
  }

  .header {
    pointer-events: none;

    rect {
      fill: none;
      stroke: var(--color-border-accent);
      stroke-width: 0.2;
      stroke-dasharray: 0.9 0.7;
    }

    text {
      fill: var(--color-text-muted);
      font-size: 1.6px;
    }
  }

  .pad {
    cursor: grab;

    .dot {
      fill: var(--pad-color, var(--color-neutral-500));
      stroke: var(--color-surface);
      stroke-width: 0.25;
    }

    .tag {
      fill: var(--color-text);
      font-size: 1.4px;
      font-weight: 600;
      text-anchor: middle;
      pointer-events: none;
    }

    &.selected .dot {
      stroke: var(--color-border-accent);
      stroke-width: 0.6;
    }

    &.group-outputs {
      --pad-color: var(--color-accent-500);
    }
    &.group-uart {
      --pad-color: var(--color-pitch);
    }
    &.group-i2c {
      --pad-color: var(--color-yaw);
    }
    &.group-adc,
    &.group-power {
      --pad-color: var(--color-yellow-500);
    }
    &.group-led {
      --pad-color: var(--color-status-good);
    }
  }

  .readout {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
