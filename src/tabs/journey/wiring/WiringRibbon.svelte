<script>
  /**
   * File: src/tabs/journey/wiring/WiringRibbon.svelte
   * Two-column ribbon: board pads (silkscreen + pin + resource) on the
   * left, airframe surfaces on the right, with an SVG connector from
   * each output pad to the surface that output drives.
   */
  import { i18n } from "@/js/i18n.js";

  /**
   * @typedef {Object} Surface
   * @property {string} id
   * @property {string} label
   * @property {number} output 1-based servo or motor number
   * @property {"servo"|"motor"} kind
   */

  /**
   * @typedef {Object} Props
   * @property {{pin: string, silkscreen: ?string, resource: string, key: string, critical?: boolean}[]} padsInUse
   * @property {Surface[]} surfaces
   */
  let { padsInUse = [], surfaces = [] } = $props();

  const ROW = 30;
  // Must match the column headers' height and the .wires height below, or
  // the connectors are drawn offset from the rows they join (and stretched,
  // since the svg scales to fit with preserveAspectRatio="none").
  const HEADER = 24;
  const WIDTH = 100; // percentage-based viewBox width

  function keyForSurface(surface) {
    return `${surface.kind === "motor" ? "M" : "S"}${surface.output}`;
  }

  // Only output pads take part (motors, servos); other pads (UART, ADC)
  // have no airframe surface to connect to.
  let outputPads = $derived(
    (padsInUse ?? []).filter((pad) => /^(M|S)\d+$/.test(pad.key)),
  );

  let left = $derived(
    outputPads.map((pad, index) => ({
      ...pad,
      y: HEADER + index * ROW,
      surface:
        (surfaces ?? []).find((s) => keyForSurface(s) === pad.key) ?? null,
    })),
  );

  let right = $derived(
    (surfaces ?? []).map((surface, index) => ({
      ...surface,
      key: keyForSurface(surface),
      y: HEADER + index * ROW,
      pad: outputPads.find((pad) => pad.key === keyForSurface(surface)) ?? null,
    })),
  );

  let links = $derived(
    left
      .filter((pad) => pad.surface)
      .map((pad) => {
        const target = right.find((s) => s.id === pad.surface.id);
        return {
          id: `${pad.key}-${pad.surface.id}`,
          y1: pad.y,
          y2: target.y,
          critical: pad.critical,
        };
      }),
  );

  let height = $derived(HEADER + ROW * Math.max(left.length, right.length, 1));
</script>

{#if left.length === 0 && right.length === 0}
  <p class="empty">{$i18n.t("wiringRibbonEmpty")}</p>
{:else}
  <div class="ribbon" style="--rows: {Math.max(left.length, right.length, 1)}">
    <div class="column pads">
      <h4>{$i18n.t("wiringRibbonPads")}</h4>
      {#each left as pad (pad.key)}
        <div
          class="row"
          class:unwired={!pad.surface}
          class:critical={pad.critical}
        >
          {#if pad.silkscreen}<span class="silk">{pad.silkscreen}</span>{/if}
          <span class="pin">{pad.pin}</span>
          <span class="res">{pad.resource}</span>
          {#if !pad.surface}
            <span class="note">{$i18n.t("wiringRibbonNoSurface")}</span>
          {/if}
        </div>
      {/each}
    </div>

    <svg
      class="wires"
      viewBox="0 0 {WIDTH} {height}"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {#each links as link (link.id)}
        <path
          class="wire"
          class:critical={link.critical}
          d="M 0 {link.y1 + ROW / 2} C {WIDTH * 0.5} {link.y1 +
            ROW / 2}, {WIDTH * 0.5} {link.y2 + ROW / 2}, {WIDTH} {link.y2 +
            ROW / 2}"
        />
      {/each}
    </svg>

    <div class="column surfaces">
      <h4>{$i18n.t("wiringRibbonSurfaces")}</h4>
      {#each right as surface (surface.id)}
        <div class="row" class:unwired={!surface.pad}>
          <span class="label">{surface.label}</span>
          <span class="res">{surface.key}</span>
          {#if !surface.pad}
            <span class="note">{$i18n.t("wiringRibbonUnwired")}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style lang="scss">
  .ribbon {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 80px minmax(0, 1fr);
    align-items: start;
    font-size: 0.8rem;
  }

  .column h4 {
    height: 24px;
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 8px;
    border-bottom: 1px solid var(--color-border-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &.unwired {
      color: var(--color-text-disabled);
    }

    &.critical .silk {
      color: var(--color-red-500);
    }
  }

  .pads .row {
    justify-content: flex-end;
  }

  .silk,
  .label {
    font-weight: 600;
  }

  .pin,
  .res {
    font-family: monospace;
    color: var(--color-text-muted);
  }

  .note {
    font-size: 0.7rem;
    color: var(--color-text-disabled);
  }

  .wires {
    width: 100%;
    height: calc(24px + 30px * var(--rows));
    overflow: visible;
  }

  .wire {
    fill: none;
    stroke: var(--color-accent-500);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;

    &.critical {
      stroke: var(--color-red-500);
    }
  }

  .empty {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-text-muted);
  }
</style>
