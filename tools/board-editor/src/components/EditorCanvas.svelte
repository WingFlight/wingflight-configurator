<script>
  /**
   * File: tools/board-editor/src/components/EditorCanvas.svelte
   * Where the board gets laid out: the view's background at its real
   * size, a millimetre grid over it, and the things an author moves.
   *
   * What you drag is a connector, not a pin. A connector owns its
   * positions and spaces them at its own pitch, so placing one places
   * all of them at once and they stay in line
   * (tools/board-editor/REQUIREMENTS.md, R1). The USB socket and each
   * built-in receiver drag the same way.
   *
   * Coordinates are the profile's own millimetres throughout. Screen
   * pixels are converted through the SVG's own transform, so the
   * numbers being dragged are the numbers that get written.
   */
  import {
    connectorBounds,
    connectorLabelAnchor,
    connectorPinPositions,
  } from "@/js/boardview/connectors.js";

  import { getEditorState } from "~editor/lib/editor_state.svelte.js";

  const editor = getEditorState();

  const MARGIN = 6;
  const PAD_RADIUS = 1.3;

  let svgElement = $state(null);
  let dragging = $state(null);

  let view = $derived(editor.view);
  let viewBox = $derived(
    view
      ? `${-MARGIN} ${-MARGIN} ${view.width + 2 * MARGIN} ${view.height + 2 * MARGIN}`
      : "0 0 1 1",
  );

  // A grid fine enough to place against but coarse enough to see
  // through: minor lines every millimetre, major every five.
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

  let placed = $derived(
    editor.connectorsHere.map((connector) => ({
      connector,
      box: connectorBounds(connector),
      places: connectorPinPositions(connector),
      // The name follows the run of positions rather than the
      // unrotated box, so turning a connector takes its label with it.
      labelAt: connectorLabelAnchor(connector, 3, editor.view),
    })),
  );

  let receiversHere = $derived(
    (editor.board?.receivers ?? []).filter(
      (receiver) => receiver.view === editor.viewId,
    ),
  );

  function toBoard(event) {
    const point = svgElement.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(svgElement.getScreenCTM().inverse());
    return { x: local.x, y: local.y };
  }

  function startDrag(event, kind, id, anchor) {
    event.stopPropagation();
    const start = toBoard(event);
    dragging = {
      kind,
      id,
      offsetX: anchor.x - start.x,
      offsetY: anchor.y - start.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!dragging) return;
    const point = toBoard(event);
    // The undo entry is taken on the first real move, not on the
    // press, so a click that only selects leaves nothing to undo.
    if (!dragging.moved) {
      dragging.moved = true;
      editor.beginConnectorDrag();
    }
    const x = point.x + dragging.offsetX;
    const y = point.y + dragging.offsetY;
    if (dragging.kind === "connector") {
      editor.dragConnector(dragging.id, x, y);
    } else if (dragging.kind === "usb") {
      editor.dragUsb(x, y);
    } else if (dragging.kind === "receiver") {
      editor.setReceiverField(dragging.id, "x", editor.snapped(x));
      editor.setReceiverField(dragging.id, "y", editor.snapped(y));
    }
  }

  function onPointerUp() {
    dragging = null;
  }

  // Arrow keys nudge the selected connector by one snap step, shift by
  // five, which is how you get a connector exactly onto its row.
  function onKeyDown(event) {
    const connector = editor.selectedConnector;
    if (!connector || connector.view !== editor.viewId) return;
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
    editor.moveConnector(
      connector.id,
      connector.x + move[0],
      connector.y + move[1],
    );
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="wrap">
  <div class="tools">
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
      Drag a connector to move it with all its pins. Arrow keys nudge, shift for
      five steps.
    </span>
  </div>

  {#if view}
    <svg
      bind:this={svgElement}
      class="canvas"
      {viewBox}
      role="application"
      aria-label="Board layout"
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
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

      {#if view.usb}
        <rect
          class="usb"
          x={view.usb.x}
          y={view.usb.y}
          width={view.usb.width}
          height={view.usb.height}
          rx="0.8"
          role="button"
          tabindex="0"
          aria-label="USB socket"
          onpointerdown={(event) =>
            startDrag(event, "usb", "usb", { x: view.usb.x, y: view.usb.y })}
        />
      {/if}

      {#each receiversHere as receiver (receiver.id)}
        <g
          class="receiver"
          role="button"
          tabindex="0"
          aria-label={receiver.label ?? "Receiver"}
          onpointerdown={(event) =>
            startDrag(event, "receiver", receiver.id, {
              x: receiver.x,
              y: receiver.y,
            })}
        >
          <rect
            x={receiver.x}
            y={receiver.y}
            width={receiver.width}
            height={receiver.height}
            rx="0.6"
          />
          <text
            x={receiver.x + receiver.width / 2}
            y={receiver.y + receiver.height / 2 + 0.6}
          >
            {receiver.protocol ?? receiver.label ?? "RX"}
          </text>
        </g>
      {/each}

      {#each placed as item (item.connector.id)}
        {@const selected = editor.selectedConnectorId === item.connector.id}
        <g
          class={["connector", `kind-${item.connector.kind}`, selected && "on"]}
          role="button"
          tabindex="0"
          aria-label={`${item.connector.label ?? item.connector.id}, ${item.connector.pins.length} positions`}
          onpointerdown={(event) => {
            editor.selectedConnectorId = item.connector.id;
            startDrag(event, "connector", item.connector.id, {
              x: item.connector.x,
              y: item.connector.y,
            });
          }}
        >
          <rect
            class="shell"
            x={item.box.x}
            y={item.box.y}
            width={item.box.width}
            height={item.box.height}
            rx="0.5"
            transform={item.box.rotation
              ? `rotate(${item.box.rotation} ${item.box.originX} ${item.box.originY})`
              : null}
          />
          {#each item.connector.pins as pin, index (pin.position)}
            {@const place = item.places[index]}
            {#if pin.pin}
              <circle
                class="dot signal"
                cx={place.x}
                cy={place.y}
                r={PAD_RADIUS}
              />
            {:else if pin.net}
              <rect
                class={["dot", "net", pin.net === "GND" && "ground"]}
                x={place.x - PAD_RADIUS}
                y={place.y - PAD_RADIUS}
                width={PAD_RADIUS * 2}
                height={PAD_RADIUS * 2}
                rx="0.3"
              />
            {:else}
              <circle
                class="dot empty"
                cx={place.x}
                cy={place.y}
                r={PAD_RADIUS}
              />
            {/if}
          {/each}
          <!-- A ring round position 1: which end is pin 1 is the thing
               a connector drawing has to get across. -->
          <circle
            class="first"
            cx={item.places[0]?.x ?? item.connector.x}
            cy={item.places[0]?.y ?? item.connector.y}
            r={PAD_RADIUS + 1}
          />
          <text
            class="tag"
            x={item.labelAt.x}
            y={item.labelAt.y}
            text-anchor={item.labelAt.anchor}
          >
            {item.connector.label ?? item.connector.id}
          </text>
        </g>
      {/each}
    </svg>

    <p class="readout">
      {view.width} × {view.height} mm · {editor.connectorsHere.length} connectors,
      {editor.padsHere.length} positions on this view
      {#if editor.selectedConnector && editor.selectedConnector.view === editor.viewId}
        · {editor.selectedConnector.label ?? editor.selectedConnector.id} at
        {editor.selectedConnector.x.toFixed(2)}, {editor.selectedConnector.y.toFixed(
          2,
        )}
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

  .usb {
    fill: var(--color-neutral-400);
    stroke: var(--color-border);
    stroke-width: 0.3;
    cursor: grab;
  }

  .receiver {
    cursor: grab;

    rect {
      fill: var(--color-neutral-300);
      stroke: var(--color-border);
      stroke-width: 0.25;
    }

    text {
      fill: var(--color-text-muted);
      font-size: 1.6px;
      font-weight: 600;
      text-anchor: middle;
      pointer-events: none;
    }
  }

  .connector {
    cursor: grab;

    .shell {
      fill: var(--color-neutral-200);
      stroke: var(--color-border);
      stroke-width: 0.2;
    }

    &.kind-solder .shell {
      fill: none;
      stroke-dasharray: 0.9 0.7;
    }

    &.on .shell {
      stroke: var(--color-border-accent);
      stroke-width: 0.5;
    }

    .dot {
      stroke: var(--color-surface);
      stroke-width: 0.2;
    }

    .signal {
      fill: var(--color-accent-500);
    }

    .net {
      fill: var(--color-yellow-500);

      &.ground {
        fill: var(--color-neutral-600);
      }
    }

    .empty {
      fill: none;
      stroke: var(--color-border);
      stroke-width: 0.2;
    }

    .first {
      fill: none;
      stroke: var(--color-text-muted);
      stroke-width: 0.2;
      pointer-events: none;
    }

    .tag {
      fill: var(--color-text);
      font-size: 1.5px;
      font-weight: 600;
      pointer-events: none;
    }
  }

  .readout {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
