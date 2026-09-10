<script>
  /**
   * File: src/components/BoardCanvas.svelte
   * Top-down drawing of the connected flight controller, from a board
   * profile (src/tabs/journey/board_profiles.json): a rounded PCB
   * outline with mount holes and the USB connector at the top, and one
   * clickable, keyboard-reachable pad per profile entry, coloured by
   * group and marked assigned / unassigned / conflicted. Every pad's
   * label and tooltip carry the silkscreen name AND the canonical
   * pin/resource together, never one instead of the other.
   */
  import { i18n } from "@/js/i18n.js";
  import { formatPadLabel } from "@/js/remap_fc/reference_design_labels.js";

  /**
   * @typedef {Object} Props
   * @property {?import("@/js/remap_fc/board_profiles.js").BoardProfile} profile
   * @property {{pin: string, key: string, resource: string, critical?: boolean}[]} padsInUse
   * @property {{pin: string, kind: string, detail: string}[]} conflicts
   * @property {?string} selectedPin
   * @property {(pin: string) => void} onSelectPad
   */
  let {
    profile = null,
    padsInUse = [],
    conflicts = [],
    selectedPin = null,
    onSelectPad,
  } = $props();

  // Drawing units are millimetres; MARGIN leaves room for labels that
  // hang outside the PCB edge.
  const MARGIN = 7;
  const PAD_RADIUS = 1.5;

  let width = $derived(profile?.outline?.width ?? 56);
  let height = $derived(profile?.outline?.height ?? 36);
  let viewBox = $derived(
    `${-MARGIN} ${-MARGIN} ${width + 2 * MARGIN} ${height + 2 * MARGIN}`,
  );

  let assignedByPin = $derived(
    Object.fromEntries((padsInUse ?? []).map((entry) => [entry.pin, entry])),
  );
  let conflictsByPin = $derived.by(() => {
    const byPin = {};
    for (const conflict of conflicts ?? []) {
      (byPin[conflict.pin] ??= []).push(conflict);
    }
    return byPin;
  });

  let pads = $derived(
    (profile?.pads ?? []).map((pad) => {
      const assigned = assignedByPin[pad.pin] ?? null;
      const padConflicts = conflictsByPin[pad.pin] ?? [];
      const state = padConflicts.length
        ? "conflict"
        : assigned
          ? "assigned"
          : "unassigned";
      const title = formatPadLabel({
        silkscreen: pad.silkscreen,
        pin: pad.pin,
        optionKey: assigned?.key ?? null,
        unassignedText: $i18n.t("wiringPadUnassigned"),
      });
      return {
        ...pad,
        assigned,
        conflicts: padConflicts,
        state,
        title: padConflicts.length
          ? `${title} — ${padConflicts.map((c) => c.detail).join("; ")}`
          : title,
        // Labels above the pad for the top row, below for everything else,
        // so nothing lands on top of the pad itself.
        labelAbove: pad.y < height / 2,
      };
    }),
  );

  const GROUPS = ["outputs", "uart", "i2c", "adc", "power", "led", "other"];

  function select(pin) {
    onSelectPad?.(pin);
  }

  function onKey(event, pin) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(pin);
    }
  }
</script>

{#if !profile}
  <p class="unrecognised">{$i18n.t("wiringBoardUnrecognised")}</p>
{:else}
  <figure class="board">
    <svg
      class="canvas"
      {viewBox}
      role="group"
      aria-label={profile.display}
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- PCB -->
      <rect class="pcb" x="0" y="0" {width} {height} rx="2.5" ry="2.5" />
      <!-- USB connector at the top edge -->
      <rect
        class="usb"
        x={width / 2 - 4.5}
        y="-1.8"
        width="9"
        height="3.6"
        rx="0.8"
      />
      <text class="usb-label" x={width / 2} y="-3">USB</text>
      <!-- Mount holes -->
      {#each profile.outline?.mountHoles ?? [] as [hx, hy] (`${hx},${hy}`)}
        <circle class="hole" cx={hx} cy={hy} r="1.5" />
      {/each}
      <!-- Board name -->
      <text class="board-name" x={width / 2} y={height / 2}>
        {profile.display}
      </text>

      <!-- Pads -->
      {#each pads as pad (pad.pin)}
        <g
          class="pad group-{pad.group} state-{pad.state}"
          class:selected={selectedPin === pad.pin}
          class:bottom-side={pad.side === "bottom"}
          class:critical={pad.assigned?.critical}
          role="button"
          tabindex="0"
          aria-label={pad.title}
          aria-pressed={selectedPin === pad.pin}
          onclick={() => select(pad.pin)}
          onkeydown={(event) => onKey(event, pad.pin)}
        >
          <title>{pad.title}</title>
          <circle class="hit" cx={pad.x} cy={pad.y} r={PAD_RADIUS + 1.6} />
          <circle class="dot" cx={pad.x} cy={pad.y} r={PAD_RADIUS} />
          {#if pad.state === "conflict"}
            <circle class="badge" cx={pad.x + 1.8} cy={pad.y - 1.8} r="1.1" />
            <text class="badge-text" x={pad.x + 1.8} y={pad.y - 1.35}>!</text>
          {/if}
          <text
            class="silk"
            x={pad.x}
            y={pad.labelAbove ? pad.y - 2.6 : pad.y + 4.3}
          >
            {pad.silkscreen}
          </text>
          <text
            class="res"
            x={pad.x}
            y={pad.labelAbove ? pad.y - 5.2 : pad.y + 6.6}
          >
            {pad.assigned ? pad.assigned.key : pad.pin}
          </text>
        </g>
      {/each}
    </svg>

    <figcaption class="legend" aria-label={$i18n.t("wiringLegendTitle")}>
      {#each GROUPS as group (group)}
        <span class="chip group-{group}">
          <span class="swatch"></span>
          {$i18n.t(`wiringLegend_${group}`)}
        </span>
      {/each}
      <span class="chip state-assigned">
        <span class="swatch"></span>
        {$i18n.t("wiringLegendAssigned")}
      </span>
      <span class="chip state-unassigned">
        <span class="swatch"></span>
        {$i18n.t("wiringLegendUnassigned")}
      </span>
      <span class="chip state-conflict">
        <span class="swatch"></span>
        {$i18n.t("wiringLegendConflict")}
      </span>
      {#if profile.coordinatesSchematic}
        <span class="schematic-note">{$i18n.t("wiringSchematicNote")}</span>
      {/if}
    </figcaption>
  </figure>
{/if}

<style lang="scss">
  .board {
    margin: 0;
    // Group colours: only existing theme tokens, so both themes keep the
    // pads legible without a second palette.
    --pad-outputs: var(--color-accent-500);
    --pad-uart: var(--color-pitch);
    --pad-i2c: var(--color-yaw);
    --pad-adc: var(--color-yellow-500);
    --pad-power: var(--color-yellow-500);
    --pad-led: var(--color-status-good);
    --pad-other: var(--color-neutral-500);
    --pad-conflict: var(--color-red-500);
  }

  .canvas {
    display: block;
    width: 100%;
    max-width: 720px;
    height: auto;
    margin: 0 auto;
    font-family: inherit;
    overflow: visible;
  }

  .pcb {
    fill: var(--color-surface-sunken);
    stroke: var(--color-border);
    stroke-width: 0.4;
  }

  .usb {
    fill: var(--color-neutral-400);
    stroke: var(--color-border);
    stroke-width: 0.3;
  }

  .usb-label,
  .board-name {
    fill: var(--color-text-muted);
    text-anchor: middle;
    font-size: 2.2px;
    pointer-events: none;
  }

  .board-name {
    font-size: 2.6px;
    font-weight: 600;
    letter-spacing: 0.05em;
    fill: var(--color-text-disabled);
  }

  .hole {
    fill: var(--color-bg);
    stroke: var(--color-border);
    stroke-width: 0.3;
  }

  .pad {
    cursor: pointer;
    outline: none;

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

    .silk {
      fill: var(--color-text);
      font-size: 2.1px;
      font-weight: 600;
      text-anchor: middle;
      pointer-events: none;
    }

    .res {
      fill: var(--color-text-muted);
      font-size: 1.7px;
      text-anchor: middle;
      pointer-events: none;
    }

    .badge {
      fill: var(--pad-conflict);
    }

    .badge-text {
      fill: var(--color-accent-fg);
      font-size: 1.7px;
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
    &.group-other {
      --pad-color: var(--pad-other);
    }

    // Unassigned: hollow. Assigned: filled. Conflict: red ring.
    &.state-unassigned .dot {
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
      r: 2.1;
    }

    @media (hover: hover) {
      &:hover .dot {
        r: 1.9;
      }
    }
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    justify-content: center;
    margin-top: 8px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;

    .swatch {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--pad-color, var(--pad-other));
      border: 1.5px solid var(--pad-color, var(--pad-other));
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
    &.group-other {
      --pad-color: var(--pad-other);
    }
    &.state-assigned .swatch {
      --pad-color: var(--color-text-muted);
    }
    &.state-unassigned .swatch {
      --pad-color: var(--color-text-muted);
      background: var(--color-surface);
    }
    &.state-conflict .swatch {
      --pad-color: var(--pad-conflict);
      background: var(--color-surface);
    }
  }

  .schematic-note,
  .unrecognised {
    flex-basis: 100%;
    text-align: center;
    font-size: 0.72rem;
    color: var(--color-text-disabled);
  }

  .unrecognised {
    color: var(--color-text-muted);
    font-size: 0.85rem;
    padding: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .pad .dot {
      transition: none;
    }
  }
</style>
