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
  import {
    receiverFit,
    textWidth,
    titleLines,
  } from "@/js/boardview/label_layout.js";
  import { portName } from "@/js/boardview/port_map.js";
  import { receiverPlacement } from "@/js/boardview/schema.js";

  import { getEditorState } from "~editor/lib/editor_state.svelte.js";

  const editor = getEditorState();

  const MARGIN = 6;
  const PAD_RADIUS = 1.3;

  let svgElement = $state(null);
  let dragging = $state(null);

  let view = $derived(editor.view);

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

  // A connector name sits outside the board, and "Servo / motor
  // outputs" beside the left edge is far wider than the fixed margin:
  // the box grows to hold whatever the names actually need, instead of
  // cutting the first half of one off.
  const TAG_FONT = 1.5;
  // The same type as the configurator draws the name in, so a break
  // typed into it falls in the same place here as it does there.
  const TITLE_FONT = 2.6;
  const TITLE_LINE = 3.1;

  let titleRows = $derived.by(() => {
    if (!view?.title || view.title.show === "never") return [];
    const lines = titleLines(
      editor.board?.display,
      view.width - 4,
      TITLE_FONT,
    );
    const firstY = view.title.y - ((lines.length - 1) * TITLE_LINE) / 2;
    return lines.map((text, index) => ({
      text,
      y: firstY + index * TITLE_LINE,
    }));
  });

  // The two aerials, drawn the way the configurator draws them: the
  // author is choosing which edge they leave the board from, and has
  // to see where they end up.
  const AERIAL_LENGTH = 5;
  const AERIAL_SPREAD = 1.6;
  const RECEIVER_FONT = 1.6;
  const RECEIVER_LINE = 2.2;

  function aerialsFor(box) {
    const outX = box.x + box.width / 2 + (box.aerialX * box.width) / 2;
    const outY = box.y + box.height / 2 + (box.aerialY * box.height) / 2;
    const acrossX = box.aerialY === 0 ? 0 : 1;
    const acrossY = box.aerialY === 0 ? 1 : 0;
    return [-1, 1].map((end) => {
      const x1 = outX + acrossX * end * (box.width / 3);
      const y1 = outY + acrossY * end * (box.height / 3);
      return {
        x1,
        y1,
        x2: x1 + box.aerialX * AERIAL_LENGTH + acrossX * end * AERIAL_SPREAD,
        y2: y1 + box.aerialY * AERIAL_LENGTH + acrossY * end * AERIAL_SPREAD,
      };
    });
  }

  let receiversHere = $derived(
    (editor.board?.receivers ?? [])
      .filter((receiver) => receiver.view === editor.viewId && view)
      .map((receiver) => {
        // Which serial port it holds, said on the block itself: it is
        // the one thing about a built-in receiver the author cannot
        // see anywhere else on the drawing.
        const lines = [
          receiver.protocol ?? receiver.label ?? "RX",
          receiver.portIdentifier === null
            ? "no port"
            : portName(receiver.portIdentifier),
        ];
        const box = receiverPlacement(
          receiver,
          view,
          receiverFit(lines, RECEIVER_FONT, RECEIVER_LINE),
        );
        return { ...receiver, box, lines, aerials: aerialsFor(box) };
      }),
  );

  let box = $derived.by(() => {
    const room = { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN };
    if (!view) return room;
    for (const item of placed) {
      const { x, y, anchor } = item.labelAt;
      const width = textWidth(
        item.connector.label ?? item.connector.id,
        TAG_FONT,
      );
      const from = anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x;
      room.left = Math.max(room.left, -from + 1);
      room.right = Math.max(room.right, from + width - view.width + 1);
      room.top = Math.max(room.top, -(y - TAG_FONT) + 1);
      room.bottom = Math.max(room.bottom, y + TAG_FONT - view.height + 1);
    }
    // A receiver's aerials leave the board, and they are the thing the
    // author is placing, so they cannot be the thing that gets cut off.
    for (const receiver of receiversHere) {
      for (const aerial of receiver.aerials) {
        room.left = Math.max(room.left, -aerial.x2 + 1);
        room.right = Math.max(room.right, aerial.x2 - view.width + 1);
        room.top = Math.max(room.top, -aerial.y2 + 1);
        room.bottom = Math.max(room.bottom, aerial.y2 - view.height + 1);
      }
    }
    return room;
  });

  let viewBox = $derived(
    view
      ? `${-box.left} ${-box.top} ${view.width + box.left + box.right} ${view.height + box.top + box.bottom}`
      : "0 0 1 1",
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
    } else if (dragging.kind === "title") {
      editor.dragTitle(x, y);
    } else if (dragging.kind === "receiver") {
      // A receiver slides along the edge it is mounted on. Which edge
      // it is on is a decision, not something to fall out of a drag.
      const receiver = editor.board?.receivers.find(
        (entry) => entry.id === dragging.id,
      );
      if (receiver) {
        const vertical = receiver.side === "left" || receiver.side === "right";
        const extent = vertical ? view.height : view.width;
        const size = vertical ? receiver.height : receiver.width;
        const centre = (vertical ? y : x) + size / 2;
        editor.setReceiverField(
          dragging.id,
          "offset",
          extent ? Math.min(1, Math.max(0, centre / extent)) : 0.5,
        );
      }
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

      <!-- The board's name, draggable like everything else placed. -->
      {#if view.title && view.title.show !== "never"}
        <g
          class="title"
          role="button"
          tabindex="0"
          aria-label="Board name"
          onpointerdown={(event) =>
            startDrag(event, "title", "title", {
              x: view.title.x,
              y: view.title.y,
            })}
        >
          {#each titleRows as row, index (index)}
            <text x={view.title.x} y={row.y} text-anchor={view.title.anchor}>
              {row.text}
            </text>
          {/each}
        </g>
      {/if}

      {#each receiversHere as receiver (receiver.id)}
        <g
          class="receiver"
          role="button"
          tabindex="0"
          aria-label={receiver.label ?? "Receiver"}
          onpointerdown={(event) =>
            startDrag(event, "receiver", receiver.id, {
              x: receiver.box.x,
              y: receiver.box.y,
            })}
        >
          {#each receiver.aerials as aerial, index (index)}
            <line
              class="aerial"
              x1={aerial.x1}
              y1={aerial.y1}
              x2={aerial.x2}
              y2={aerial.y2}
            />
            <circle class="aerial" cx={aerial.x2} cy={aerial.y2} r="0.6" />
          {/each}
          <rect
            x={receiver.box.x}
            y={receiver.box.y}
            width={receiver.box.width}
            height={receiver.box.height}
            rx="0.6"
          />
          {#each receiver.lines as line, index (index)}
            <text
              x={receiver.box.x + receiver.box.width / 2}
              y={receiver.box.y +
                receiver.box.height / 2 +
                0.4 -
                ((receiver.lines.length - 1) * RECEIVER_LINE) / 2 +
                index * RECEIVER_LINE}
            >
              {line}
            </text>
          {/each}
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

  .title {
    cursor: grab;

    text {
      fill: var(--color-text-disabled);
      font-size: 2.6px;
      font-weight: 600;
    }
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

    .aerial {
      fill: var(--color-neutral-400);
      stroke: var(--color-neutral-400);
      stroke-width: 0.4;
      stroke-linecap: round;
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
