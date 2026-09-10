<script>
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import {
    deflectionFor,
    layersFor,
    placedSurfaces,
    polygonPoints,
    surfaceTransform,
  } from "@/js/airframe/geometry.js";

  // The airframe canvas: the mixer wizard's layered artwork promoted to a
  // persistent, interactive component. Every control surface is a hit region
  // carrying its output, pad and live deflection from FC.SERVO_DATA.
  //
  // Props
  //   profile   Aircraft Profile (derived; may be a preview built from wizard
  //             options -- see previewProfile in the mixer dialogs)
  //   live      animate from FC.SERVO_DATA / FC.SERVO_CONFIG
  //   selected  surface id to highlight
  //   onSelect  (surface) => void
  //   compact   smaller labels, no legend
  let {
    profile,
    live = false,
    selected = null,
    onSelect,
    compact = false,
  } = $props();

  let layers = $derived(layersFor(profile));
  let placement = $derived(placedSurfaces(profile));

  // Pad state per output label ("S1") from the CLI reader, when available.
  let padState = $derived.by(() => {
    const out = {};
    if (!Array.isArray(profile?.padsInUse)) return out;
    const conflicted = new Set((profile.conflicts ?? []).map((c) => c.pin));
    for (const pad of profile.padsInUse) {
      if (pad.key)
        out[pad.key] = {
          pin: pad.pin,
          silkscreen: pad.silkscreen,
          conflicted: conflicted.has(pad.pin),
        };
    }
    return out;
  });

  function deflection(surface) {
    if (!live) return { deviation: 0, angle: 0 };
    const pulse = FC.SERVO_DATA?.[surface.output - 1];
    return deflectionFor(pulse, FC.SERVO_CONFIG?.[surface.output - 1]);
  }

  function stateOf(surface) {
    const pad = padState[surface.label];
    if (pad?.conflicted) return "conflicted";
    return "assigned";
  }

  function label(surface) {
    const pad = padState[surface.label];
    const padText = pad
      ? ` · ${pad.silkscreen ?? ""} ${pad.pin}`.trimEnd()
      : "";
    return `${surface.label}${padText}`;
  }

  function title(p) {
    const s = p.surface;
    const d = deflection(s);
    const role = $i18n.t(`journeyRole.${s.role}`);
    const side =
      s.side && s.side !== "center" && s.side !== "both"
        ? ` (${$i18n.t(`journeySide.${s.side}`)})`
        : "";
    const pad = padState[s.label];
    const padText = pad ? ` · ${pad.silkscreen ?? ""} ${pad.pin}` : "";
    const pulse = live
      ? ` · ${FC.SERVO_DATA?.[s.output - 1] ?? "–"} µs (${d.angle >= 0 ? "+" : ""}${d.angle.toFixed(0)}°)`
      : "";
    return `${role}${side} · ${s.label}${padText}${pulse}`;
  }

  function select(surface) {
    onSelect?.(surface);
  }

  function onKey(e, surface) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(surface);
    }
  }

  function labelPos(polygon) {
    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }
</script>

<div class={["canvas", compact && "compact"]}>
  <svg
    viewBox={`0 0 ${layers.viewBox.w} ${layers.viewBox.h}`}
    role="img"
    aria-label={$i18n.t("airframeCanvasLabel")}
  >
    {#each layers.files as file (file)}
      <image
        href={`/images/aircraft_shapes/${file}.svg`}
        x="0"
        y="0"
        width={layers.viewBox.w}
        height={layers.viewBox.h}
      />
    {/each}

    {#each placement.unassigned as u (u.key)}
      <polygon
        class="surface unassigned"
        points={polygonPoints(u.geometry.polygon)}
      >
        <title
          >{$i18n.t("airframeCanvasUnassigned", {
            surface: $i18n.t(`journeySurface.${u.key}`),
          })}</title
        >
      </polygon>
    {/each}

    {#each placement.placed as p (p.key)}
      {@const d = deflection(p.surface)}
      {@const signed = d.deviation * p.geometry.sign}
      {@const pos = labelPos(p.geometry.polygon)}
      <g
        class={[
          "hit",
          stateOf(p.surface),
          selected === p.surface.id && "selected",
          signed > 0.05 && "up",
          signed < -0.05 && "down",
        ]}
        role="button"
        tabindex="0"
        aria-label={title(p)}
        onclick={() => select(p.surface)}
        onkeydown={(e) => onKey(e, p.surface)}
      >
        <title>{title(p)}</title>
        <polygon
          class="surface"
          points={polygonPoints(p.geometry.polygon)}
          transform={surfaceTransform(p.geometry, d.angle * p.geometry.sign)}
        />
        <line
          class="hinge"
          x1={p.geometry.hinge[0][0]}
          y1={p.geometry.hinge[0][1]}
          x2={p.geometry.hinge[1][0]}
          y2={p.geometry.hinge[1][1]}
        />
        <text
          class="label"
          x={pos.x}
          y={pos.y}
          text-anchor="middle"
          dominant-baseline="central">{label(p.surface)}</text
        >
      </g>
    {/each}

    {#each placement.motors as m, i (i)}
      {@const motor = profile?.motors?.[i]}
      {#if motor}
        <g class="motor">
          <circle cx={m.x} cy={m.y} r="2.4" />
          <text
            class="label"
            x={m.x}
            y={m.y}
            text-anchor="middle"
            dominant-baseline="central">{motor.label}</text
          >
        </g>
      {/if}
    {/each}
  </svg>

  {#if placement.unplaced.length > 0}
    <ul class="unplaced">
      {#each placement.unplaced as s (s.id)}
        <li>
          <button
            class={["chip", selected === s.id && "selected"]}
            onclick={() => select(s)}
          >
            {$i18n.t(`journeyRole.${s.role}`)} · {s.label}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if !compact}
    <div class="legend">
      <span><i class="sw assigned"></i>{$i18n.t("airframeCanvasAssigned")}</span
      >
      <span
        ><i class="sw unassigned"></i>{$i18n.t(
          "airframeCanvasUnassignedLegend",
        )}</span
      >
      <span
        ><i class="sw conflicted"></i>{$i18n.t(
          "airframeCanvasConflicted",
        )}</span
      >
      {#if live}
        <span class="live">{$i18n.t("airframeCanvasLive")}</span>
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  .canvas {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  svg {
    width: 100%;
    height: auto;
    display: block;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface-float, var(--color-surface));
    padding: 6px;
    box-sizing: border-box;
    overflow: visible;
  }

  .surface {
    fill: var(--color-accent-500);
    fill-opacity: 0.55;
    stroke: var(--color-accent-700);
    stroke-width: 0.35;
    transition:
      transform var(--animation-speed) linear,
      fill var(--animation-speed);
  }

  .unassigned {
    fill: var(--color-neutral-400);
    fill-opacity: 0.35;
    stroke: var(--color-neutral-600);
    stroke-dasharray: 1 0.8;
  }

  .hit {
    cursor: pointer;
    outline: none;

    &:hover .surface,
    &:focus-visible .surface {
      fill-opacity: 0.85;
    }

    &:focus-visible .surface {
      stroke: var(--color-focus-ring);
      stroke-width: 0.8;
    }

    &.selected .surface {
      stroke: var(--color-text);
      stroke-width: 0.7;
      fill-opacity: 0.9;
    }

    &.conflicted .surface {
      fill: var(--color-status-bad);
      stroke: var(--color-red-900);
    }

    &.up .surface {
      fill: var(--color-accent-300);
    }

    &.down .surface {
      fill: var(--color-accent-800);
    }
  }

  .hinge {
    stroke: var(--color-text);
    stroke-width: 0.25;
    stroke-opacity: 0.6;
  }

  .label {
    font-size: 2.6px;
    font-weight: 700;
    fill: var(--color-text);
    pointer-events: none;
    paint-order: stroke;
    stroke: var(--color-surface);
    stroke-width: 0.6;
    stroke-linejoin: round;
  }

  .compact .label {
    font-size: 2.2px;
  }

  .motor circle {
    fill: var(--color-neutral-700);
    stroke: var(--color-neutral-900);
    stroke-width: 0.3;
  }

  .motor .label {
    fill: white;
    stroke: none;
    font-size: 2px;
  }

  .unplaced {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    @extend %button;
    &.selected {
      border-color: var(--color-accent-500);
    }
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    font-size: 0.72rem;
    color: var(--color-text-muted);

    span {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
  }

  .sw {
    display: inline-block;
    width: 12px;
    height: 8px;
    border-radius: 2px;
    background: var(--color-accent-500);

    &.unassigned {
      background: var(--color-neutral-400);
      border: 1px dashed var(--color-neutral-600);
    }

    &.conflicted {
      background: var(--color-status-bad);
    }
  }

  .live {
    color: var(--color-status-good);
    font-weight: 600;
  }

  @media (prefers-reduced-motion: reduce) {
    .surface {
      transition: none;
    }
  }
</style>
