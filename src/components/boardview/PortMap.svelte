<script>
  /**
   * File: src/components/boardview/PortMap.svelte
   * "Where do I plug this in?" -- the flight controller drawn from
   * whichever side you need, with every serial port labelled by the
   * job it is currently doing.
   *
   * It draws a hand-made board profile when one matches the connected
   * board and a schematic synthesised from the board's own report when
   * none does. A port whose TX and RX come out in two different places
   * is shown as two marked pads tied together rather than as one,
   * because that is what the user has to wire.
   *
   * When nothing is known about where the pins are -- an undrawn board
   * that has not been read -- the port list still stands on its own and
   * says why there is no picture, which beats drawing an empty board.
   */
  import { resolveBoardView } from "@/js/boardview/board_views.js";
  import { describePortFunction } from "@/js/boardview/port_function.js";
  import { buildPortMap } from "@/js/boardview/port_map.js";
  import { VIEW_IDS } from "@/js/boardview/schema.js";
  import { FC } from "@/js/fc.svelte.js";
  import { i18n } from "@/js/i18n.js";
  import { getProfile } from "@/js/profile.svelte.js";

  import BoardViewCanvas from "./BoardViewCanvas.svelte";

  /**
   * @typedef {Object} Props
   * @property {?Object} [profile] normalised board view; resolved from
   *           the connected board when not given
   * @property {?Object} [hardwareMap] wiring session hardware map, used
   *           to place ports on a board with no profile
   * @property {{pin: string, key: string, resource: string}[]} [padsInUse]
   * @property {{pin: string, detail: string}[]} [conflicts]
   * @property {?string} [selectedPin]
   * @property {(pin: string) => void} [onSelectPad]
   * @property {boolean} [showPortList]
   * @property {boolean} [interactive]
   */
  let {
    profile = null,
    hardwareMap = null,
    padsInUse = [],
    conflicts = [],
    selectedPin = null,
    onSelectPad = null,
    showPortList = true,
    interactive = true,
  } = $props();

  // The pad groups worth a swatch. `internal` is deliberately absent:
  // it is drawn but never reassignable, so naming it in the key would
  // invite clicking it.
  const LEGEND_GROUPS = [
    "outputs",
    "uart",
    "i2c",
    "adc",
    "power",
    "led",
    "other",
  ];

  let serialPorts = $derived(FC.SERIAL_CONFIG?.ports ?? []);

  // Pads the wiring stage read off the board, shared through the
  // aircraft profile. Any tab showing this drawing benefits from them
  // once the board has been read once, without opening a CLI itself.
  let knownPads = $derived(
    padsInUse?.length ? padsInUse : (getProfile().padsInUse ?? []),
  );

  // buildPortMap and the schematic both want pins keyed by option key,
  // which is what a pad list already is.
  let pins = $derived(
    hardwareMap ??
      Object.fromEntries(knownPads.map((pad) => [pad.key, { pin: pad.pin }])),
  );

  let board = $derived(
    profile ??
      resolveBoardView({
        // The wiring stage matched a profile against the board it
        // actually read, which is the better answer where it exists.
        matched: getProfile().board?.profile ?? null,
        config: FC.CONFIG,
        hardwareMap: pins,
        serialPorts,
      }),
  );

  let portMap = $derived(
    buildPortMap({
      profile: board,
      serialPorts,
      hardwareMap: pins,
      describeFunction: (port) => describePortFunction(port, $i18n.t),
    }),
  );

  // Only offer a view the board actually has, top first.
  let availableViews = $derived(
    VIEW_IDS.filter((id) => board?.views?.[id]).map((id) => ({
      id,
      label: $i18n.t(`boardViewName_${id}`),
    })),
  );

  let viewId = $state("top");
  $effect(() => {
    if (availableViews.length && !availableViews.some((v) => v.id === viewId)) {
      viewId = availableViews[0].id;
    }
  });

  let activePortId = $state(null);

  // Where a line comes out, in the most specific terms available: the
  // connector if the profile names one, otherwise the view when there
  // is more than one to choose between, otherwise just the pin. Saying
  // "Top" on a board that only has a top view tells nobody anything.
  function whereIs(line) {
    if (!line.pin) return $i18n.t("boardViewLineMissing");
    if (!line.pad) return $i18n.t("boardViewLineUndrawn", { pin: line.pin });
    const header = (board?.headers ?? []).find(
      (entry) => entry.id === line.pad.header,
    );
    const place =
      header?.label ??
      (availableViews.length > 1
        ? $i18n.t(`boardViewName_${line.pad.view}`)
        : line.pin);
    const name = line.pad.silkscreen ?? line.pin;
    return name === place ? name : `${name} · ${place}`;
  }
</script>

{#if !board}
  <p class="empty">{$i18n.t("boardViewNoDrawing")}</p>
{:else}
  <figure class="portmap">
    {#if availableViews.length > 1}
      <div class="views" role="tablist" aria-label={$i18n.t("boardViewSwitch")}>
        {#each availableViews as view (view.id)}
          <button
            class={["view-tab", viewId === view.id && "active"]}
            role="tab"
            aria-selected={viewId === view.id}
            onclick={() => (viewId = view.id)}
          >
            {view.label}
          </button>
        {/each}
      </div>
    {/if}

    <BoardViewCanvas
      profile={board}
      {viewId}
      {portMap}
      {padsInUse}
      {conflicts}
      {selectedPin}
      {activePortId}
      {onSelectPad}
      {interactive}
      onHoverPort={(id) => (activePortId = id)}
    />

    <figcaption class="legend" aria-label={$i18n.t("wiringLegendTitle")}>
      {#each LEGEND_GROUPS as group (group)}
        <span class="chip group-{group}">
          <span class="swatch"></span>
          {$i18n.t(`wiringLegend_${group}`)}
        </span>
      {/each}
      <span class="chip state-assigned">
        <span class="swatch"></span>
        {$i18n.t("wiringLegendAssigned")}
      </span>
      <span class="chip state-free">
        <span class="swatch"></span>
        {$i18n.t("wiringLegendUnassigned")}
      </span>
      <span class="chip state-conflict">
        <span class="swatch"></span>
        {$i18n.t("wiringLegendConflict")}
      </span>
      {#if board.synthesised}
        <span class="note">{$i18n.t("boardViewSynthesised")}</span>
      {:else if board.coordinatesSchematic}
        <span class="note">{$i18n.t("wiringSchematicNote")}</span>
      {/if}
    </figcaption>
  </figure>
{/if}

{#if showPortList}
  <table class="ports">
    <thead>
      <tr>
        <th>{$i18n.t("boardViewPortColumn")}</th>
        <th>{$i18n.t("boardViewFunctionColumn")}</th>
        <th>TX</th>
        <th>RX</th>
      </tr>
    </thead>
    <tbody>
      {#each portMap as port (port.id)}
        <tr
          class={[
            activePortId === port.id && "active",
            !port.assigned && "off",
          ]}
          onmouseenter={() => (activePortId = port.id)}
          onmouseleave={() => (activePortId = null)}
        >
          <th scope="row">
            {port.label}
            {#if port.split}
              <span class="split-tag" title={$i18n.t("boardViewSplitHelp")}>
                {$i18n.t("boardViewSplit")}
              </span>
            {/if}
          </th>
          <td
            >{port.assigned
              ? port.functionLabel
              : $i18n.t("boardViewPortFree")}</td
          >
          {#each port.lines as line (line.role)}
            <td class="where">{whereIs(line)}</td>
          {/each}
        </tr>
      {/each}
      {#if !portMap.length}
        <tr><td colspan="4">{$i18n.t("boardViewNoPorts")}</td></tr>
      {/if}
    </tbody>
  </table>
{/if}

<style lang="scss">
  .portmap {
    margin: 0;
  }

  .views {
    display: flex;
    gap: 4px;
    justify-content: center;
    margin-bottom: 8px;
  }

  .view-tab {
    @extend %button;
    font-size: 0.75rem;
    padding: 3px 12px;

    &.active {
      border-color: var(--color-border-accent);
      color: var(--color-text);
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

    // Same tokens as the drawing, so a swatch and its pads match.
    --pad-outputs: var(--color-accent-500);
    --pad-uart: var(--color-pitch);
    --pad-i2c: var(--color-yaw);
    --pad-adc: var(--color-yellow-500);
    --pad-power: var(--color-yellow-500);
    --pad-led: var(--color-status-good);
    --pad-other: var(--color-neutral-500);
    --pad-conflict: var(--color-red-500);
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
    &.state-free .swatch {
      --pad-color: var(--color-text-muted);
      background: var(--color-surface);
    }
    &.state-conflict .swatch {
      --pad-color: var(--pad-conflict);
      background: var(--color-surface);
    }
  }

  .note {
    flex-basis: 100%;
    text-align: center;
    font-size: 0.72rem;
    color: var(--color-text-disabled);
  }

  .ports {
    width: 100%;
    margin-top: 10px;
    border-collapse: collapse;
    font-size: 0.8rem;

    th,
    td {
      text-align: left;
      padding: 4px 8px;
      border-bottom: 1px solid var(--color-border);
    }

    thead th {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    tbody tr.active {
      background: var(--color-surface-raised);
    }

    tbody tr.off td,
    tbody tr.off th {
      color: var(--color-text-muted);
    }

    .where {
      color: var(--color-text-muted);
      font-variant-numeric: tabular-nums;
    }
  }

  .split-tag {
    display: inline-block;
    margin-left: 6px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--color-pitch);
    color: var(--color-accent-fg);
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .empty {
    margin: 0;
    padding: 12px;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }
</style>
