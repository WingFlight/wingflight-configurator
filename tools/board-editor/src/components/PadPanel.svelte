<script>
  /**
   * File: tools/board-editor/src/components/PadPanel.svelte
   * Everything about one pad, plus the list of every pad on the board
   * so a pin can be found without hunting for it on the drawing.
   */
  import { PAD_GROUPS } from "@/js/boardview/schema.js";

  import { getEditorState } from "~editor/lib/editor_state.svelte.js";

  const editor = getEditorState();

  let filter = $state("");

  let listed = $derived(
    (editor.board?.pads ?? []).filter((pad) => {
      const needle = filter.trim().toUpperCase();
      if (!needle) return true;
      return (
        pad.pin.includes(needle) ||
        (pad.silkscreen ?? "").toUpperCase().includes(needle)
      );
    }),
  );

  let headerOptions = $derived(
    (editor.board?.headers ?? []).filter(
      (header) => header.view === editor.selectedPad?.view,
    ),
  );
</script>

<section>
  <h2>Pads</h2>

  {#if editor.selectedPad}
    {@const pad = editor.selectedPad}
    <div class="pair">
      <label>
        Pin
        <input
          value={pad.pin}
          onchange={(event) =>
            editor.setPadField(pad.pin, "pin", event.currentTarget.value)}
        />
      </label>
      <label>
        Silkscreen
        <input
          value={pad.silkscreen ?? ""}
          placeholder="TX1"
          onchange={(event) =>
            editor.setPadField(
              pad.pin,
              "silkscreen",
              event.currentTarget.value.trim() || null,
            )}
        />
      </label>
    </div>

    <div class="pair">
      <label>
        x (mm)
        <input
          type="number"
          step="0.01"
          value={pad.x}
          onchange={(event) =>
            editor.setPadField(pad.pin, "x", Number(event.currentTarget.value))}
        />
      </label>
      <label>
        y (mm)
        <input
          type="number"
          step="0.01"
          value={pad.y}
          onchange={(event) =>
            editor.setPadField(pad.pin, "y", Number(event.currentTarget.value))}
        />
      </label>
    </div>

    <div class="pair">
      <label>
        Group
        <select
          value={pad.group}
          onchange={(event) =>
            editor.setPadField(pad.pin, "group", event.currentTarget.value)}
        >
          {#each PAD_GROUPS as group (group)}
            <option value={group}>{group}</option>
          {/each}
        </select>
      </label>
      <label>
        View
        <select
          value={pad.view}
          onchange={(event) =>
            editor.setPadField(pad.pin, "view", event.currentTarget.value)}
        >
          {#each Object.keys(editor.board.views) as id (id)}
            <option value={id}>{id}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="pair">
      <label>
        PCB face
        <select
          value={pad.side}
          onchange={(event) =>
            editor.setPadField(pad.pin, "side", event.currentTarget.value)}
        >
          <option value="top">top</option>
          <option value="bottom">bottom</option>
        </select>
      </label>
      <label>
        Label runs
        <select
          value={pad.labelSide}
          onchange={(event) =>
            editor.setPadField(pad.pin, "labelSide", event.currentTarget.value)}
        >
          <option value="auto">auto (nearest edge)</option>
          <option value="left">left</option>
          <option value="right">right</option>
          <option value="above">above</option>
          <option value="below">below</option>
        </select>
      </label>
    </div>

    <label>
      Connector
      <select
        value={pad.header ?? ""}
        onchange={(event) =>
          editor.setPadField(
            pad.pin,
            "header",
            event.currentTarget.value || null,
          )}
      >
        <option value="">none</option>
        {#each headerOptions as header (header.id)}
          <option value={header.id}>{header.label ?? header.id}</option>
        {/each}
      </select>
    </label>

    <label class="check">
      <input
        type="checkbox"
        checked={pad.reserved}
        onchange={(event) =>
          editor.setPadField(pad.pin, "reserved", event.currentTarget.checked)}
      />
      Reserved: drawn but never offered for reassignment
    </label>

    <button class="danger" onclick={() => editor.removePad(pad.pin)}>
      Delete pad
    </button>
  {:else}
    <p class="note">Select a pad on the drawing, or from the list below.</p>
  {/if}

  <h3>All pads ({editor.board?.pads?.length ?? 0})</h3>
  <input class="filter" placeholder="Filter by pin or silkscreen" bind:value={filter} />
  <ul class="list">
    {#each listed as pad (pad.pin)}
      <li>
        <button
          class={["entry", editor.selectedPin === pad.pin && "on"]}
          onclick={() => {
            editor.selectedPin = pad.pin;
            editor.viewId = pad.view;
          }}
        >
          <span class="silk">{pad.silkscreen ?? "—"}</span>
          <span class="pin">{pad.pin}</span>
          <span class="meta">{pad.group} · {pad.view}</span>
        </button>
      </li>
    {/each}
  </ul>
</section>

<style lang="scss">
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h2 {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  h3 {
    margin: 8px 0 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  label.check {
    flex-direction: row;
    align-items: flex-start;
    gap: 6px;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  input,
  select {
    padding: 3px 6px;
    font-size: 0.8rem;
    min-width: 0;
  }

  button {
    @extend %button;
    font-size: 0.75rem;

    &.danger {
      color: var(--color-red-500);
    }
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .entry {
    display: grid;
    grid-template-columns: 3.5rem 3rem 1fr;
    gap: 6px;
    width: 100%;
    border: none;
    border-radius: 0;
    background: none;
    text-align: left;
    font-size: 0.75rem;
    padding: 3px 6px;

    &.on {
      background: var(--color-surface-raised);
    }

    .silk {
      font-weight: 600;
      color: var(--color-text);
    }

    .pin,
    .meta {
      color: var(--color-text-muted);
    }
  }

  .note {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
</style>
