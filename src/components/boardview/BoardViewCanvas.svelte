<script>
  /**
   * File: src/components/boardview/BoardViewCanvas.svelte
   * One view of a flight controller: the board seen from the top, the
   * left or the right, with every pad drawn in place and labelled.
   *
   * The view may carry a background exported from CAD, in which case
   * the pads are drawn over it; with no background it falls back to a
   * plain outline, which is also what a synthesised schematic gets.
   * Either way the geometry is the profile's millimetre coordinates,
   * so the two agree.
   *
   * Labels never sit on top of each other: they are pushed out to the
   * margin and spread there by label_layout.js, with a leader line
   * back to any pad whose label had to move.
   */
  import { connectorBounds } from "@/js/boardview/connectors.js";
  import { groupForOptionKey } from "@/js/boardview/generic_layout.js";
  import {
    SUB_OFFSET,
    layoutLabels,
    marginsForLabels,
    wrapText,
  } from "@/js/boardview/label_layout.js";
  import { portsByPin } from "@/js/boardview/port_map.js";
  import { i18n } from "@/js/i18n.js";

  /**
   * @typedef {Object} Props
   * @property {Object} profile normalised board view profile
   * @property {string} viewId one of schema.js VIEW_IDS
   * @property {Object[]} [portMap] rows from buildPortMap()
   * @property {{pin: string, key: string, resource: string, critical?: boolean}[]} [padsInUse]
   * @property {{pin: string, detail: string}[]} [conflicts]
   * @property {?string} [selectedPin]
   * @property {?string} [activePortId] port to highlight, dimming the rest
   * @property {(pin: string) => void} [onSelectPad]
   * @property {(portId: ?string) => void} [onHoverPort]
   * @property {boolean} [interactive]
   */
  let {
    profile,
    viewId = "top",
    portMap = [],
    padsInUse = [],
    conflicts = [],
    selectedPin = null,
    activePortId = null,
    onSelectPad = null,
    onHoverPort = null,
    interactive = true,
  } = $props();

  // Drawing units are millimetres. MARGIN is only the slack a label may
  // slide *along* its edge; how far the box actually extends is measured
  // from the labels themselves, further down.
  const MARGIN_X = 16;
  const MARGIN_Y = 9;
  const PAD_RADIUS = 1.4;

  let view = $derived(profile?.views?.[viewId] ?? null);

  let portByPin = $derived(portsByPin(portMap));
  let assignedByPin = $derived(
    Object.fromEntries((padsInUse ?? []).map((entry) => [entry.pin, entry])),
  );
  let conflictByPin = $derived.by(() => {
    const byPin = {};
    for (const conflict of conflicts ?? []) {
      (byPin[conflict.pin] ??= []).push(conflict);
    }
    return byPin;
  });

  // Every drawn position on this view: a connector's pins and the
  // loose solder pads together.
  let padsHere = $derived(
    (profile?.allPads ?? profile?.pads ?? []).filter(
      (pad) => pad.view === viewId,
    ),
  );

  // Connector shells, drawn behind their pins so a plug reads as one
  // thing rather than a row of dots.
  let shells = $derived(
    (profile?.connectors ?? [])
      .filter(
        (connector) => connector.view === viewId && connector.pins.length > 0,
      )
      .map((connector) => ({
        id: connector.id,
        kind: connector.kind,
        label: connector.label,
        box: connectorBounds(connector),
      })),
  );

  let receiversHere = $derived(
    (profile?.receivers ?? []).filter((receiver) => receiver.view === viewId),
  );

  // The board's name, wrapped to fit the board and placed where the
  // profile puts it. `auto` means "only when no background carries it
  // already", which is what every profile did before it was placeable.
  const TITLE_FONT = 2.6;
  const TITLE_LINE = 3.1;

  let title = $derived.by(() => {
    if (!view || viewId !== "top") return null;
    const spec = view.title;
    if (!spec || spec.show === "never") return null;
    if (spec.show === "auto" && view.background) return null;

    const lines = wrapText(profile.display, view.width - 4, TITLE_FONT);
    if (!lines.length) return null;
    return {
      ...spec,
      lines,
      // Centred on the placement, so adding a line grows it both ways
      // rather than pushing it off the bottom.
      firstY: spec.y - ((lines.length - 1) * TITLE_LINE) / 2,
      lineHeight: TITLE_LINE,
    };
  });

  function padState(pad) {
    if (pad.role === "net") return "net";
    if (conflictByPin[pad.pin]?.length) return "conflict";
    const port = portByPin[pad.pin]?.port ?? null;
    if (port) return port.assigned ? "assigned" : "free";
    return assignedByPin[pad.pin] ? "assigned" : "free";
  }

  // A signal pad's colour follows whatever resource it turns out to
  // carry, so an author never has to keep a group in step with the
  // catalogue. An explicit group on the pin still wins.
  function padGroup(pad) {
    if (pad.group && pad.group !== "other") return pad.group;
    const key = portByPin[pad.pin]?.line
      ? "uart"
      : (assignedByPin[pad.pin]?.key ?? null);
    if (key === "uart") return "uart";
    return key ? groupForOptionKey(key) : (pad.group ?? "other");
  }

  // What a pad says. A port pad leads with its line ("TX" / "RX") and
  // names the port and what the port is set to underneath; any other
  // pad leads with its silkscreen and names its resource.
  function padText(pad) {
    // A ground or power position says what rail it is and which
    // connector it is on. That is the whole point of drawing it: it
    // tells the user which way round the plug goes.
    if (pad.role === "net") return { text: pad.net, sub: null };

    const entry = portByPin[pad.pin] ?? null;
    if (entry) {
      const { port, line } = entry;
      const head =
        pad.silkscreen ?? `${line.role.toUpperCase()}${port.identifier + 1}`;
      // Both names, never one instead of the other: the letter printed
      // on the board and the UART the firmware knows (R3).
      const port_name =
        port.label === port.name ? port.label : `${port.label} · ${port.name}`;
      const detail = port.internal
        ? `${port_name} · ${$i18n.t("boardViewPortInternal")}`
        : port.assigned
          ? `${port_name} · ${port.functionLabel}`
          : `${port_name} · ${$i18n.t("boardViewPortFree")}`;
      return { text: head, sub: detail };
    }

    const assigned = assignedByPin[pad.pin] ?? null;
    const head = pad.silkscreen ?? pad.pin;
    const sub = assigned?.resource ?? (pad.silkscreen ? pad.pin : null);
    return { text: head, sub: sub === head ? null : sub };
  }

  let decorated = $derived(
    padsHere.map((pad) => {
      const entry = portByPin[pad.pin] ?? null;
      const { text, sub } = padText(pad);
      const padConflicts = conflictByPin[pad.pin] ?? [];
      return {
        ...pad,
        text,
        sub,
        group: padGroup(pad),
        port: entry?.port ?? null,
        line: entry?.line ?? null,
        state: padState(pad),
        conflicts: padConflicts,
        critical: Boolean(assignedByPin[pad.pin]?.critical),
        title: [
          pad.connectorLabel && pad.position
            ? `${pad.connectorLabel} pin ${pad.position}`
            : null,
          text,
          sub,
          pad.pin,
          ...padConflicts.map((conflict) => conflict.detail),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    }),
  );

  // The USB connector sticks out of one edge, so labels on that edge
  // have to clear it or they land on top of it.
  const USB_DEPTH = 3.6;
  let usbSide = $derived(
    { top: "above", bottom: "below", left: "left", right: "right" }[
      view?.usb?.edge
    ] ?? null,
  );

  // A board has one B07 but many grounds, so the drawing keys a
  // position by where it is rather than by what is on it.
  const padKey = (pad) =>
    pad.connector ? `${pad.connector}:${pad.position}` : `pad:${pad.pin}`;

  let labelItems = $derived(
    decorated.map((pad) => ({
      id: padKey(pad),
      x: pad.x,
      y: pad.y,
      text: pad.text,
      sub: pad.sub,
      side: pad.labelSide,
    })),
  );

  let layoutArgs = $derived(
    view
      ? {
          view,
          items: labelItems,
          margin: { x: MARGIN_X, y: MARGIN_Y },
          clearance: usbSide ? { [usbSide]: USB_DEPTH } : {},
        }
      : null,
  );

  let labels = $derived(layoutArgs ? layoutLabels(layoutArgs) : []);

  // The box is whatever the drawing plus its labels actually need, so
  // a long function name widens the picture instead of being cut off.
  let margins = $derived(
    layoutArgs
      ? marginsForLabels({ view, items: labelItems, labels })
      : { left: 0, right: 0, top: 0, bottom: 0 },
  );

  let viewBox = $derived(
    view
      ? `${-margins.left} ${-margins.top} ${view.width + margins.left + margins.right} ${view.height + margins.top + margins.bottom}`
      : "0 0 1 1",
  );

  let labelByKey = $derived(
    Object.fromEntries(
      labels.filter(Boolean).map((label) => [label.id, label]),
    ),
  );

  // A port whose two pads are both on this view but on different
  // headers gets a tie line, so "these two belong together" is visible
  // rather than inferred from the label.
  let ties = $derived(
    (portMap ?? [])
      .filter((port) => port.split)
      .map((port) => port.lines.filter((line) => line.pad?.view === viewId))
      .filter((lines) => lines.length === 2)
      .map((lines) => ({
        id: `${lines[0].pin}-${lines[1].pin}`,
        from: lines[0].pad,
        to: lines[1].pad,
      })),
  );

  function isSelected(pad) {
    return Boolean(pad.pin) && pad.pin === selectedPin;
  }

  function dimmed(pad) {
    return Boolean(activePortId) && pad.port?.id !== activePortId;
  }

  function select(pin) {
    if (interactive) onSelectPad?.(pin);
  }

  function onKey(event, pin) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(pin);
    }
  }
</script>

{#if view}
  <svg
    class="canvas"
    {viewBox}
    role="group"
    aria-label={$i18n.t("boardViewCanvasLabel", {
      board: profile.display,
      view: $i18n.t(`boardViewName_${viewId}`),
    })}
    xmlns="http://www.w3.org/2000/svg"
  >
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
    {:else}
      <rect
        class="pcb"
        x="0"
        y="0"
        width={view.width}
        height={view.height}
        rx={viewId === "top" ? 2.5 : 0.8}
      />
      {#each view.mountHoles as [hx, hy] (`${hx},${hy}`)}
        <circle class="hole" cx={hx} cy={hy} r="1.5" />
      {/each}
    {/if}

    <!-- The board's name. Only on the top view: a side view is a 10 mm
         strip, and a name written across it lands on the pads rather
         than behind them. -->
    {#if title}
      <text class="board-name" text-anchor={title.anchor}>
        {#each title.lines as line, index (index)}
          <tspan x={title.x} y={title.firstY + index * title.lineHeight}>
            {line}
          </tspan>
        {/each}
      </text>
    {/if}

    <!-- USB, wherever the board actually puts it (R5) -->
    {#if view.usb}
      <rect
        class="usb"
        x={view.usb.x}
        y={view.usb.y}
        width={view.usb.width}
        height={view.usb.height}
        rx="0.8"
        transform={view.usb.rotation
          ? `rotate(${view.usb.rotation} ${view.usb.x + view.usb.width / 2} ${view.usb.y + view.usb.height / 2})`
          : null}
      />
    {/if}

    <!-- A receiver soldered to the board (R6) -->
    {#each receiversHere as receiver (receiver.id)}
      <g class="receiver">
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
        {#if receiver.antenna}
          <path
            class="antenna"
            d={`M ${receiver.x + receiver.width} ${receiver.y + receiver.height / 2} l 4 -2.5`}
          />
        {/if}
      </g>
    {/each}

    <!-- Connector shells -->
    {#each shells as shell (shell.id)}
      <g class="shell kind-{shell.kind}">
        <rect
          x={shell.box.x}
          y={shell.box.y}
          width={shell.box.width}
          height={shell.box.height}
          rx="0.5"
          transform={shell.box.rotation
            ? `rotate(${shell.box.rotation} ${shell.box.originX} ${shell.box.originY})`
            : null}
        />
      </g>
    {/each}

    <!-- Split ports: the two halves tied together -->
    {#each ties as tie (tie.id)}
      <path
        class="tie"
        d={`M ${tie.from.x} ${tie.from.y} L ${tie.to.x} ${tie.to.y}`}
      />
    {/each}

    <!-- Leader lines, drawn under the pads -->
    {#each labels.filter(Boolean) as label (label.id)}
      {#if label.leader}
        <path
          class="leader"
          d={`M ${label.leader[0][0]} ${label.leader[0][1]} L ${label.leader[1][0]} ${label.leader[1][1]}`}
        />
      {/if}
    {/each}

    <!-- Pads -->
    {#each decorated as pad (padKey(pad))}
      {@const label = labelByKey[padKey(pad)]}
      <g
        class="pad group-{pad.group} state-{pad.state} role-{pad.role ??
          'signal'}"
        class:selected={isSelected(pad)}
        class:bottom-side={pad.side === "bottom"}
        class:critical={pad.critical}
        class:dim={dimmed(pad)}
        class:static={!interactive}
        role={interactive && pad.role !== "net" ? "button" : "img"}
        tabindex={interactive && pad.role !== "net" ? 0 : null}
        aria-label={pad.title}
        aria-pressed={interactive && pad.role !== "net"
          ? isSelected(pad)
          : null}
        onclick={() => pad.role !== "net" && select(pad.pin)}
        onkeydown={(event) => pad.role !== "net" && onKey(event, pad.pin)}
        onmouseenter={() => onHoverPort?.(pad.port?.id ?? null)}
        onmouseleave={() => onHoverPort?.(null)}
        onfocus={() => onHoverPort?.(pad.port?.id ?? null)}
        onblur={() => onHoverPort?.(null)}
      >
        <title>{pad.title}</title>
        <circle class="hit" cx={pad.x} cy={pad.y} r={PAD_RADIUS + 1.8} />
        {#if pad.role === "net"}
          <!-- A rail is drawn square, so it never reads as something
               you could click through to reassign. -->
          <rect
            class="dot"
            x={pad.x - PAD_RADIUS}
            y={pad.y - PAD_RADIUS}
            width={PAD_RADIUS * 2}
            height={PAD_RADIUS * 2}
            rx="0.3"
          />
        {:else}
          <circle class="dot" cx={pad.x} cy={pad.y} r={PAD_RADIUS} />
        {/if}
        {#if pad.state === "conflict"}
          <circle class="badge" cx={pad.x + 1.7} cy={pad.y - 1.7} r="1.1" />
          <text class="badge-text" x={pad.x + 1.7} y={pad.y - 1.25}>!</text>
        {:else if pad.port?.split}
          <circle
            class="badge split"
            cx={pad.x + 1.7}
            cy={pad.y - 1.7}
            r="1.1"
          />
          <text class="badge-text" x={pad.x + 1.7} y={pad.y - 1.25}>⇄</text>
        {/if}
        {#if label}
          <text
            class="label"
            x={label.x}
            y={label.y}
            text-anchor={label.anchor}
          >
            {pad.text}
          </text>
          {#if pad.sub}
            <text
              class="sub"
              x={label.x}
              y={label.y + SUB_OFFSET}
              text-anchor={label.anchor}
            >
              {pad.sub}
            </text>
          {/if}
        {/if}
      </g>
    {/each}
  </svg>
{/if}

<style lang="scss">
  .canvas {
    display: block;
    width: 100%;
    max-width: 760px;
    height: auto;
    margin: 0 auto;
    font-family: inherit;
    overflow: visible;

    // Group colours reuse existing theme tokens, so both themes stay
    // legible without a second palette.
    --pad-outputs: var(--color-accent-500);
    --pad-uart: var(--color-pitch);
    --pad-i2c: var(--color-yaw);
    --pad-adc: var(--color-yellow-500);
    --pad-power: var(--color-yellow-500);
    --pad-led: var(--color-status-good);
    --pad-other: var(--color-neutral-500);
    --pad-internal: var(--color-neutral-500);
    --pad-ground: var(--color-neutral-600);
    --pad-conflict: var(--color-red-500);
  }

  .pcb {
    fill: var(--color-surface-sunken);
    stroke: var(--color-border);
    stroke-width: 0.4;
  }

  .backdrop {
    // A CAD export carries its own ink; the pads sit on top of it.
    pointer-events: none;
  }

  .usb {
    fill: var(--color-neutral-400);
    stroke: var(--color-border);
    stroke-width: 0.3;
  }

  .board-name {
    fill: var(--color-text-disabled);
    font-size: 2.6px;
    font-weight: 600;
    letter-spacing: 0.05em;
    pointer-events: none;
  }

  .hole {
    fill: var(--color-bg);
    stroke: var(--color-border);
    stroke-width: 0.3;
  }

  // A connector's shell. A port gets a solid body because it is a
  // plug you push a cable into; a pinheader gets an outline; bare
  // solder pads get nothing but a dashed hint.
  .shell rect {
    fill: var(--color-neutral-200);
    stroke: var(--color-border);
    stroke-width: 0.2;
  }

  .shell.kind-header rect {
    fill: none;
    stroke-width: 0.25;
  }

  .shell.kind-solder rect {
    fill: none;
    stroke-dasharray: 0.9 0.7;
    stroke-width: 0.2;
  }

  .receiver {
    rect {
      fill: var(--color-neutral-300);
      stroke: var(--color-border);
      stroke-width: 0.25;
    }

    text {
      fill: var(--color-text-muted);
      font-size: 1.8px;
      font-weight: 600;
      text-anchor: middle;
      pointer-events: none;
    }

    .antenna {
      stroke: var(--color-neutral-500);
      stroke-width: 0.4;
      fill: none;
      stroke-linecap: round;
    }
  }

  .tie {
    stroke: var(--color-pitch);
    stroke-width: 0.3;
    stroke-dasharray: 1.2 0.9;
    fill: none;
    opacity: 0.7;
  }

  .leader {
    stroke: var(--color-border);
    stroke-width: 0.2;
    fill: none;
  }

  .pad {
    cursor: pointer;
    outline: none;
    transition: opacity var(--animation-speed);

    &.static {
      cursor: default;
    }

    &.dim {
      opacity: 0.28;
    }

    .hit {
      fill: transparent;
    }

    .dot {
      fill: var(--pad-color, var(--pad-other));
      stroke: var(--pad-color, var(--pad-other));
      stroke-width: 0.5;
      transition:
        r var(--animation-speed),
        stroke-width var(--animation-speed);
    }

    .label {
      fill: var(--color-text);
      font-size: 2.1px;
      font-weight: 600;
      pointer-events: none;
    }

    .sub {
      fill: var(--color-text-muted);
      font-size: 1.7px;
      pointer-events: none;
    }

    .badge {
      fill: var(--pad-conflict);

      &.split {
        fill: var(--color-pitch);
      }
    }

    .badge-text {
      fill: var(--color-accent-fg);
      font-size: 1.6px;
      font-weight: 700;
      text-anchor: middle;
      pointer-events: none;
    }

    &.group-outputs {
      --pad-color: var(--pad-outputs);
    }
    &.group-uart {
      --pad-color: var(--pad-uart);
    }
    &.group-i2c {
      --pad-color: var(--pad-i2c);
    }
    &.group-adc {
      --pad-color: var(--pad-adc);
    }
    &.group-power {
      --pad-color: var(--pad-power);
    }
    &.group-led {
      --pad-color: var(--pad-led);
    }
    &.group-other,
    &.group-internal {
      --pad-color: var(--pad-other);
    }
    &.group-ground {
      --pad-color: var(--pad-ground);
    }

    &.role-net {
      cursor: default;
    }

    // Free: hollow. Assigned: filled. Conflict: red ring.
    &.state-free .dot {
      fill: var(--color-surface);
    }
    &.state-conflict .dot {
      stroke: var(--pad-conflict);
      stroke-width: 0.8;
    }
    &.critical .dot {
      stroke-width: 0.8;
    }
    &.bottom-side .dot {
      stroke-dasharray: 0.8 0.5;
    }

    &.selected .dot,
    &:focus-visible .dot {
      stroke: var(--color-border-accent);
      stroke-width: 1;
      r: 2;
    }

    @media (hover: hover) {
      &:not(.static):hover .dot {
        r: 1.9;
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pad,
    .pad .dot {
      transition: none;
    }
  }
</style>
