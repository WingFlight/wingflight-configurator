<script>
  /**
   * File: tools/board-editor/src/components/BoardPanel.svelte
   * Which board is being edited, what it is called, and which board
   * the configurator should match it to.
   *
   * The catalogue picker is the way in. WingFlight/wingflight-targets
   * carries a config for every board the firmware supports, and one
   * click turns any of them into a laid-out schematic: every pin in
   * the right group, every port joined to its two pads. Drawing a
   * board starts from a real board, never from an empty rectangle.
   */
  import { getTargetConfig, getTargets } from "~editor/lib/api.js";
  import { getEditorState } from "~editor/lib/editor_state.svelte.js";
  import { listTargets } from "@/js/boardview/unified_config.js";

  const editor = getEditorState();

  let targets = $state([]);
  let catalogueSource = $state(null);
  let catalogueError = $state(null);
  let loading = $state(false);
  let filter = $state("");
  let chosen = $state("");

  async function loadCatalogue({ refresh = false } = {}) {
    loading = true;
    catalogueError = null;
    try {
      const result = await getTargets({ refresh });
      targets = listTargets(result.entries);
      catalogueSource = result.source;
    } catch (error) {
      catalogueError = String(error.message ?? error);
      targets = [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    loadCatalogue();
  });

  // Four hundred-odd boards is a lot for one dropdown, so it is both
  // filtered and grouped by manufacturer. A filter matching exactly one
  // board selects it, which makes "type a board name, press the button"
  // the whole gesture.
  let matching = $derived.by(() => {
    const needle = filter.trim().toUpperCase();
    if (!needle) return targets;
    return targets.filter(
      (target) =>
        target.targetId.includes(needle) || target.boardName.includes(needle),
    );
  });

  let grouped = $derived.by(() => {
    // A plain object, not a Map: this is scratch state inside one
    // derivation, never anything the UI reads back.
    const byManufacturer = {};
    for (const target of matching) {
      (byManufacturer[target.manufacturerId] ??= []).push(target);
    }
    return Object.entries(byManufacturer);
  });

  $effect(() => {
    if (matching.length === 1) chosen = matching[0].targetId;
    else if (!matching.some((target) => target.targetId === chosen)) chosen = "";
  });

  let alreadyDrawn = $derived(
    new Set(editor.boards.map((board) => board.id)),
  );

  async function seed({ refresh = false } = {}) {
    if (!chosen) return;
    loading = true;
    catalogueError = null;
    try {
      editor.seedFromConfig(await getTargetConfig(chosen, { refresh }));
    } catch (error) {
      catalogueError = String(error.message ?? error);
    } finally {
      loading = false;
    }
  }
</script>

<section>
  <h2>Board from the catalogue</h2>

  <input
    class="filter"
    placeholder="Filter {targets.length || '…'} boards, e.g. MATEKH743"
    bind:value={filter}
  />


  <select bind:value={chosen} disabled={!matching.length}>
    <option value="">
      {matching.length
        ? `Choose one of ${matching.length} boards…`
        : "No board matches that filter"}
    </option>
    {#each grouped as [manufacturerId, boards] (manufacturerId)}
      <optgroup label={manufacturerId}>
        {#each boards as target (target.targetId)}
          <option value={target.targetId}>
            {target.boardName}{alreadyDrawn.has(target.targetId) ? " ✓" : ""}
          </option>
        {/each}
      </optgroup>
    {/each}
  </select>

  <div class="row">
    <button class="primary" disabled={!chosen || loading} onclick={() => seed()}>
      {#if loading}
        Working…
      {:else if alreadyDrawn.has(chosen)}
        Refresh from catalogue
      {:else}
        Create board
      {/if}
    </button>
    <button
      disabled={loading}
      title="Refetch the catalogue listing from GitHub"
      onclick={() => loadCatalogue({ refresh: true })}>Reload list</button
    >
  </div>

  <p class="note">
    {#if chosen}
      <!-- The options are grouped by manufacturer, so the closed
           dropdown shows only a board name; two manufacturers can use
           the same one, so the full id is named here. -->
      <strong>{chosen}</strong>.
    {/if}
    {#if alreadyDrawn.has(chosen)}
      Refreshing keeps every connector, position, view, receiver and background
      you have already set, and only adds or clears the pins the catalogue has
      changed.
    {:else}
      Creates a schematic with every pin the board reports, ready for you to
      load its outline and drag the connectors into place.
    {/if}
  </p>

  {#if catalogueError}
    <p class="error">{catalogueError}</p>
  {:else if catalogueSource === "stale"}
    <p class="warn">
      GitHub could not be reached, so this is the last catalogue listing that
      was cached. Individual boards you have opened before still work.
    </p>
  {/if}

  <h2>This board</h2>

  <label>
    Editing
    <select
      value={String(editor.index)}
      onchange={(event) => {
        editor.index = Number(event.currentTarget.value);
        editor.selectedPin = null;
      }}
    >
      {#each editor.boards as board, index (board.id + index)}
        <option value={String(index)}>{board.display || board.id}</option>
      {/each}
      {#if !editor.boards.length}
        <option value="0">nothing yet</option>
      {/if}
    </select>
  </label>

  {#if editor.board}
    <label>
      Id
      <input
        value={editor.board.id}
        onchange={(event) =>
          editor.setBoardField("id", event.currentTarget.value.trim())}
      />
    </label>
    <label>
      Shown as
      <textarea
        rows="2"
        value={editor.board.display}
        onchange={(event) =>
          editor.setBoardField("display", event.currentTarget.value)}
      ></textarea>
      <span class="hint">
        Press Enter for a line break. The drawing keeps the breaks you type
        and wraps anything still wider than the board.
      </span>
    </label>
    <label>
      MCU
      <input
        value={editor.board.mcu ?? ""}
        placeholder="STM32H743"
        onchange={(event) =>
          editor.setBoardField("mcu", event.currentTarget.value.trim() || null)}
      />
    </label>
    <div class="pair">
      <label>
        Matches manufacturer_id
        <input
          value={editor.board.match.manufacturerId.join(", ")}
          placeholder="MTKS"
          onchange={(event) =>
            editor.setBoardField("manufacturerId", event.currentTarget.value)}
        />
      </label>
      <label>
        Matches board_name
        <input
          value={editor.board.match.boardName.join(", ")}
          placeholder="MATEKH743"
          onchange={(event) =>
            editor.setBoardField("boardName", event.currentTarget.value)}
        />
      </label>
    </div>
    <label class="check">
      <input
        type="checkbox"
        checked={editor.board.coordinatesSchematic}
        onchange={(event) =>
          editor.setBoardField(
            "coordinatesSchematic",
            event.currentTarget.checked,
          )}
      />
      Coordinates are schematic, not measured
    </label>

    <button class="danger" onclick={() => editor.removeBoard()}>
      Delete this board
    </button>
  {:else}
    <p class="note">
      No board open. Pick one from the catalogue above to start drawing it.
    </p>
  {/if}
</section>

<style lang="scss">
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h2 {
    margin: 8px 0 0;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);

    &:first-child {
      margin-top: 0;
    }
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
    align-items: center;
    gap: 6px;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .row {
    display: flex;
    gap: 6px;

    button {
      flex: 1;
    }
  }

  input,
  textarea,
  select {
    padding: 3px 6px;
    font-size: 0.8rem;
    min-width: 0;
  }

  textarea {
    font-family: inherit;
    resize: vertical;
  }

  .hint {
    font-size: 0.7rem;
    color: var(--color-text-disabled);
  }

  select[size] {
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
  }

  button {
    @extend %button;
    font-size: 0.75rem;

    &.danger {
      color: var(--color-red-500);
    }
  }

  .primary {
    @extend %button-primary;
    font-size: 0.75rem;
  }

  .note {
    margin: 0;
    font-size: 0.72rem;
    color: var(--color-text-disabled);
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
