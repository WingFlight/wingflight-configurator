<script>
  /**
   * File: tools/board-editor/src/components/ViewPanel.svelte
   * The top, left and right drawings: their extents in millimetres,
   * their CAD backgrounds, mount holes and where the USB connector is.
   *
   * Importing a background sets the view's extent from the file's own
   * size when the export carries one, which is the whole reason to
   * export at 1:1 with millimetre units: every pad placed afterwards
   * is then in real millimetres.
   */
  import { VIEW_IDS } from "@/js/boardview/schema.js";

  import { putBackground } from "~editor/lib/api.js";
  import { getEditorState } from "~editor/lib/editor_state.svelte.js";
  import { backgroundName, readBoardSvg } from "~editor/lib/svg_import.js";

  const editor = getEditorState();

  let importWarning = $state(null);
  let importError = $state(null);
  // Writable derived: it follows the view until the author types, and
  // goes back to following it when they switch view.
  let holeText = $derived(
    (editor.view?.mountHoles ?? []).map(([x, y]) => `${x},${y}`).join(" "),
  );

  async function onFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    importWarning = null;
    importError = null;

    const parsed = readBoardSvg(await file.text());
    if (!parsed.svg) {
      importError = parsed.warning;
      return;
    }

    const name = backgroundName(editor.board.id, editor.viewId);
    try {
      const { href } = await putBackground(name, parsed.svg);
      editor.edit((board) => {
        const view = board.views[editor.viewId];
        view.background = href;
        if (parsed.width && parsed.height) {
          view.width = parsed.width;
          view.height = parsed.height;
        }
      });
      importWarning = parsed.warning;
    } catch (error) {
      importError = String(error.message ?? error);
    } finally {
      event.currentTarget.value = "";
    }
  }

  function commitHoles() {
    const holes = holeText
      .split(/\s+/)
      .map((pair) => pair.split(",").map(Number))
      .filter((pair) => pair.length === 2 && pair.every(Number.isFinite));
    editor.setViewField("mountHoles", holes);
  }
</script>

<section>
  <h2>View</h2>

  <div class="tabs">
    {#each VIEW_IDS as id (id)}
      {#if editor.board?.views?.[id]}
        <button
          class={["tab", editor.viewId === id && "on"]}
          onclick={() => (editor.viewId = id)}>{id}</button
        >
      {:else}
        <button class="tab add" onclick={() => editor.addView(id)}>+ {id}</button>
      {/if}
    {/each}
  </div>

  {#if editor.view}
    <div class="pair">
      <label>
        Width (mm)
        <input
          type="number"
          step="0.1"
          value={editor.view.width}
          onchange={(event) =>
            editor.setViewField("width", Number(event.currentTarget.value))}
        />
      </label>
      <label>
        Height (mm)
        <input
          type="number"
          step="0.1"
          value={editor.view.height}
          onchange={(event) =>
            editor.setViewField("height", Number(event.currentTarget.value))}
        />
      </label>
    </div>

    <label>
      Background from CAD
      <input type="file" accept=".svg,image/svg+xml" onchange={onFile} />
    </label>
    {#if editor.view.background}
      <p class="note">
        Using {editor.view.background}
        <button class="link" onclick={() => editor.setViewField("background", null)}
          >remove</button
        >
      </p>
      <label>
        Background opacity
        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={editor.view.backgroundOpacity}
          onchange={(event) =>
            editor.setViewField(
              "backgroundOpacity",
              Number(event.currentTarget.value),
            )}
        />
      </label>
    {/if}
    {#if importWarning}<p class="warn">{importWarning}</p>{/if}
    {#if importError}<p class="error">{importError}</p>{/if}

    <label>
      Mount holes (x,y pairs)
      <input
        bind:value={holeText}
        placeholder="3,3 53,3 3,33 53,33"
        onchange={commitHoles}
      />
    </label>

    {#if editor.viewId !== "top"}
      {@const holds = editor.viewContents(editor.viewId)}
      <button class="danger" onclick={() => editor.removeView(editor.viewId)}>
        Delete the {editor.viewId} view
      </button>
      <p class="note holds">
        {#if holds.connectors || holds.pads || holds.receivers}
          Takes what is drawn on it with it: {holds.connectors} connector(s),
          {holds.pads} loose pad(s), {holds.receivers} receiver(s). Undo puts
          them back.
        {:else}
          Nothing is drawn on it yet.
        {/if}
      </p>
    {/if}

    {#if editor.viewId === "top" && editor.view.title}
      <h3>Board name</h3>
      <label>
        Shown
        <select
          value={editor.view.title.show}
          onchange={(event) =>
            editor.setTitleField("show", event.currentTarget.value)}
        >
          <option value="auto">only without a background</option>
          <option value="always">always</option>
          <option value="never">never</option>
        </select>
      </label>
      {#if editor.view.title.show !== "never"}
        <div class="pair">
          <label>
            x (mm)
            <input
              type="number"
              step="0.1"
              value={editor.view.title.x}
              onchange={(event) =>
                editor.setTitleField("x", event.currentTarget.value)}
            />
          </label>
          <label>
            y (mm)
            <input
              type="number"
              step="0.1"
              value={editor.view.title.y}
              onchange={(event) =>
                editor.setTitleField("y", event.currentTarget.value)}
            />
          </label>
        </div>
        <label>
          Aligned
          <select
            value={editor.view.title.anchor}
            onchange={(event) =>
              editor.setTitleField("anchor", event.currentTarget.value)}
          >
            <option value="middle">centred on that point</option>
            <option value="start">starting at it</option>
            <option value="end">ending at it</option>
          </select>
        </label>
        <p class="note">
          Drag it on the drawing, or type its position here. A name too long for
          the board is wrapped onto more lines.
        </p>
      {/if}
    {/if}

    {#if editor.viewId !== "top"}
      <button class="danger" onclick={() => editor.removeView(editor.viewId)}>
        Delete this view and its connectors
      </button>
    {/if}
  {/if}
</section>

<style lang="scss">
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h3 {
    margin: 8px 0 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  h2 {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .tabs {
    display: flex;
    gap: 4px;
  }

  .tab {
    @extend %button;
    flex: 1;
    font-size: 0.75rem;
    text-transform: capitalize;

    &.on {
      border-color: var(--color-border-accent);
    }

    &.add {
      color: var(--color-text-disabled);
    }
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
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

  .link {
    border: none;
    background: none;
    padding: 0;
    color: var(--color-accent-500);
    text-decoration: underline;
    cursor: pointer;
  }

  .note {
    margin: 0;
    font-size: 0.72rem;
    color: var(--color-text-disabled);
    word-break: break-all;

    // Prose, not a file path: break it between words.
    &.holds {
      word-break: normal;
    }
  }

  .warn {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-yellow-500);
  }

  .error {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-red-500);
  }
</style>
