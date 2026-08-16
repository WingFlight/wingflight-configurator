<script>
  /**
   * File: src/tabs/remap_fc/remap_fc.svelte
   * UI for the "Remap FC" tab: a run button plus the CLI output log,
   * driven by remap_fc.js via the exported setRunning/setError/
   * appendOutput/reset functions.
   */

  import { i18n } from "@/js/i18n.js";
  import Page from "@/components/Page.svelte";

  /**
   * @typedef {Object} Props
   * @property {() => void} onRunClick - Called when the run button is pressed.
   */
  /** @type {Props} */
  const { onRunClick } = $props();

  let running = $state(false);
  let error = $state(null);
  let output = $state("");
  let hasRun = $state(false);
  /** @type {import("@/js/remap_fc/remap_table.js").RemapRow[]} */
  let remapTable = $state([]);

  // --- Functions below are called from remap_fc.js on the mounted
  // instance (e.g. `component.setRunning(true)`), the same way
  // Failsafe.svelte exposes onSave/onRevert/isDirty. ---

  export function setRunning(value) {
    running = value;
  }

  export function setError(message) {
    error = message;
  }

  /**
   * Appends the output of one CLI command to the displayed log.
   * @param {string} command
   * @param {string} text
   */
  export function appendOutput(command, text) {
    hasRun = true;
    output += `# ${command}\n${text}\n`;
  }

  /**
   * @param {import("@/js/remap_fc/remap_table.js").RemapRow[]} rows
   */
  export function setRemapTable(rows) {
    remapTable = rows;
  }

  export function reset() {
    output = "";
    error = null;
    hasRun = false;
    remapTable = [];
  }

  function onClick() {
    reset();
    onRunClick();
  }
</script>

{#snippet header()}
  <h1>{$i18n.t("tabRemapFC")}</h1>
{/snippet}

<Page {header} loading={false}>
  <div class="content">
    <p class="note">{$i18n.t("remapFcNote")}</p>

    <button class="btn run-btn" onclick={onClick} disabled={running}>
      {running ? $i18n.t("remapFcRunning") : $i18n.t("remapFcRunButton")}
    </button>

    {#if error}
      <div class="error_message">{error}</div>
    {/if}

    {#if remapTable.length}
      <table class="remap-table">
        <thead>
          <tr>
            <th>{$i18n.t("remapFcTableOption")}</th>
            <th>{$i18n.t("remapFcTableDefaultPin")}</th>
            <th></th>
            <th>{$i18n.t("remapFcTableCurrentOption")}</th>
          </tr>
        </thead>
        <tbody>
          {#each remapTable as row (row.option)}
            <tr>
              <td>{row.option}</td>
              <td>{row.defaultPin ?? "—"}</td>
              <td class="arrow">→</td>
              <td>{row.currentOption ?? "—"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if hasRun}
      <pre class="output">{output}</pre>
    {/if}
  </div>
</Page>

<style lang="scss">
  .content {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }

  .note {
    color: var(--textColor);
    opacity: 0.8;
  }

  .run-btn {
    @extend %button;
    align-self: flex-start;
  }

  .remap-table {
    border-collapse: collapse;

    th,
    td {
      padding: 4px 12px;
      text-align: left;
      border-bottom: 1px solid var(--subtleAccent);
    }

    th {
      color: var(--textColor);
      opacity: 0.8;
    }

    .arrow {
      opacity: 0.6;
    }
  }

  .output {
    background: var(--backgroundColor);
    border: 1px solid var(--subtleAccent);
    border-radius: 4px;
    padding: 12px;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 60vh;
    overflow-y: auto;
    font-family: monospace;
  }

  .error_message {
    color: #d9534f;
  }
</style>
