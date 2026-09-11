<script>
  /**
   * File: tools/board-editor/src/components/BoardPanel.svelte
   * Which board is being edited, what it is called, and which target
   * names the configurator should match it against.
   *
   * The seed button is the shortcut that makes a new profile
   * practical: it reads the firmware target next door and creates a
   * pad for every pin the target defines, so the work left is dragging
   * them onto the drawing rather than typing seventy pin names.
   */
  import { getTarget, getTargets } from "~editor/lib/api.js";
  import { getEditorState } from "~editor/lib/editor_state.svelte.js";

  const editor = getEditorState();

  let targets = $state([]);
  let chosenTarget = $state("");
  let seeding = $state(false);
  let seedError = $state(null);
  let newBoardId = $state("");

  $effect(() => {
    getTargets()
      .then((result) => (targets = result.targets ?? []))
      .catch(() => (targets = []));
  });

  async function seed() {
    if (!chosenTarget) return;
    seeding = true;
    seedError = null;
    try {
      editor.seedFromTarget(await getTarget(chosenTarget));
    } catch (error) {
      seedError = String(error.message ?? error);
    } finally {
      seeding = false;
    }
  }
</script>

<section>
  <h2>Board</h2>

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
    </select>
  </label>

  <div class="row">
    <input
      placeholder="New board id, e.g. MATEKF405SE"
      bind:value={newBoardId}
    />
    <button
      onclick={() => {
        editor.addBoard(newBoardId.trim().toUpperCase());
        newBoardId = "";
      }}>Add</button
    >
    <button
      class="danger"
      disabled={editor.boards.length <= 1}
      onclick={() => editor.removeBoard()}>Delete</button
    >
  </div>

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
      <input
        value={editor.board.display}
        onchange={(event) =>
          editor.setBoardField("display", event.currentTarget.value)}
      />
    </label>
    <label>
      MCU
      <input
        value={editor.board.mcu ?? ""}
        placeholder="STM32F405"
        onchange={(event) =>
          editor.setBoardField("mcu", event.currentTarget.value.trim() || null)}
      />
    </label>
    <label>
      Matches target name
      <input
        value={editor.board.match.targetName.join(", ")}
        onchange={(event) =>
          editor.setBoardField("targetName", event.currentTarget.value)}
      />
    </label>
    <label>
      Matches board design
      <input
        value={editor.board.match.boardDesign.join(", ")}
        onchange={(event) =>
          editor.setBoardField("boardDesign", event.currentTarget.value)}
      />
    </label>
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

    <h3>Seed from firmware target</h3>
    <div class="row">
      <select bind:value={chosenTarget}>
        <option value="">Choose a target…</option>
        {#each targets as target (target)}
          <option value={target}>{target}</option>
        {/each}
      </select>
      <button disabled={!chosenTarget || seeding} onclick={seed}>
        {seeding ? "Reading…" : "Seed"}
      </button>
    </div>
    <p class="note">
      Creates a pad for every pin the target defines, stacked in the
      top-left corner for you to drag into place. Pads that already exist
      are left alone.
    </p>
    {#if seedError}<p class="error">{seedError}</p>{/if}
    {#if !targets.length}
      <p class="note">
        No firmware checkout found next to this one, so seeding is
        unavailable. Expected ../wingflight-firmware.
      </p>
    {/if}
  {/if}
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
    align-items: center;
    gap: 6px;
  }

  .row {
    display: flex;
    gap: 6px;

    input,
    select {
      flex: 1;
      min-width: 0;
    }
  }

  input,
  select {
    padding: 3px 6px;
    font-size: 0.8rem;
  }

  button {
    @extend %button;
    font-size: 0.75rem;

    &.danger {
      color: var(--color-red-500);
    }
  }

  .note {
    margin: 0;
    font-size: 0.72rem;
    color: var(--color-text-disabled);
  }

  .error {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-red-500);
  }
</style>
