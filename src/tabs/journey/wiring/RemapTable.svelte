<script>
  /**
   * File: src/tabs/journey/wiring/RemapTable.svelte
   * The raw remap table -- every managed resource with its pin,
   * silkscreen label, default pin, timer and DMA -- as a compact table.
   * Meant to live inside the wiring stage's Expert-tier drawer.
   */
  import { i18n } from "@/js/i18n.js";

  /**
   * @typedef {Object} Props
   * @property {ReturnType<typeof import("@/js/remap_fc/wiring_session.svelte.js").getWiringSession>} session
   */
  let { session } = $props();

  let rows = $derived(session.tableRows ?? []);
</script>

{#if rows.length === 0}
  <p class="empty">{$i18n.t("wiringTableEmpty")}</p>
{:else}
  <div class="wrap">
    <table class="remap">
      <thead>
        <tr>
          <th>{$i18n.t("wiringTableResource")}</th>
          <th>{$i18n.t("wiringTableSilkscreen")}</th>
          <th>{$i18n.t("wiringTablePin")}</th>
          <th>{$i18n.t("wiringTableDefaultPin")}</th>
          <th>{$i18n.t("wiringTableTimer")}</th>
          <th>{$i18n.t("wiringTableDma")}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.key)}
          <tr class:changed={!row.isDefault} class:unassigned={!row.pin}>
            <td>
              <span class="key">{row.key}</span>
              <span class="res">{row.resource}</span>
            </td>
            <td>{row.silkscreen ?? "—"}</td>
            <td class="mono">{row.pin ?? $i18n.t("wiringPadUnassigned")}</td>
            <td class="mono">{row.defaultPin ?? "—"}</td>
            <td class="mono">{row.timer ?? "—"}</td>
            <td class="mono">{row.dma ?? "—"}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style lang="scss">
  .wrap {
    overflow-x: auto;
  }

  .remap {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;

    th,
    td {
      padding: 3px 8px;
      text-align: left;
      white-space: nowrap;
      border-bottom: 1px solid var(--color-border-soft);
    }

    th {
      color: var(--color-text-muted);
      font-weight: 600;
    }

    .key {
      font-weight: 600;
      margin-right: 6px;
    }

    .res {
      color: var(--color-text-muted);
      font-family: monospace;
    }

    .mono {
      font-family: monospace;
    }

    .changed td {
      color: var(--color-accent-700);
    }

    .unassigned td {
      color: var(--color-text-disabled);
    }
  }

  .empty {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-text-muted);
  }
</style>
