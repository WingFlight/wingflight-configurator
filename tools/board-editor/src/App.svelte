<script>
  /**
   * File: tools/board-editor/src/App.svelte
   * The board editor's frame: a toolbar that owns the file, the
   * placement canvas and the configurator's own preview in the middle,
   * and the inspectors down the right.
   */
  import BoardPanel from "./components/BoardPanel.svelte";
  import ConnectorPanel from "./components/ConnectorPanel.svelte";
  import EditorCanvas from "./components/EditorCanvas.svelte";
  import PortsPanel from "./components/PortsPanel.svelte";
  import PreviewPanel from "./components/PreviewPanel.svelte";
  import ReceiverPanel from "./components/ReceiverPanel.svelte";
  import ViewPanel from "./components/ViewPanel.svelte";
  import { getEditorState } from "./lib/editor_state.svelte.js";
  // A worked example that uses every part of the schema at once: three
  // views, a CAD background, named connectors and a split UART.
  import example from "../examples/example-three-view.json";

  const editor = getEditorState();

  let theme = $state(
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );

  $effect(() => {
    document.documentElement.dataset.theme = theme;
  });

  $effect(() => {
    editor.load();
  });

  // With auto-save on there is normally nothing to lose, but a profile
  // that does not validate is held back deliberately, and that is
  // exactly when a closed tab would cost work.
  $effect(() => {
    const guard = (event) => {
      if (!editor.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  });

  // What the toolbar says about the file, in the order it matters.
  let saveState = $derived.by(() => {
    if (editor.offline) return { text: "not saving", tone: "warn" };
    if (editor.status === "saving") return { text: "saving…", tone: "busy" };
    if (editor.errors.length) {
      return {
        text: `held back · ${editor.errors.length} error(s)`,
        tone: "warn",
      };
    }
    if (editor.dirty) {
      return {
        text: editor.autoSave ? "saving shortly" : "unsaved",
        tone: "busy",
      };
    }
    return { text: editor.savedAt ? "saved" : "no changes", tone: "ok" };
  });

  async function onImport(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      editor.importFile(JSON.parse(await file.text()));
    } catch (error) {
      editor.error = `That file is not a profile file: ${error.message}`;
    } finally {
      event.currentTarget.value = "";
    }
  }

  function download() {
    const blob = new Blob([editor.asJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "board_profiles.json";
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<header>
  <h1>Board editor</h1>
  <span class="file">src/tabs/journey/board_profiles.json</span>
  <span class="state {saveState.tone}">{saveState.text}</span>
  <div class="grow"></div>
  <label class="auto" title="Write changes to the file on their own, once the
profile validates and editing has paused">
    <input type="checkbox" bind:checked={editor.autoSave} />
    Auto-save
  </label>
  <button disabled={!editor.canUndo} onclick={() => editor.undo()}>Undo</button>
  <button disabled={!editor.canRedo} onclick={() => editor.redo()}>Redo</button>
  <button onclick={() => editor.importFile(example)}>Example</button>
  <label class="load">
    Load file…
    <input type="file" accept=".json,application/json" onchange={onImport} />
  </label>
  <button onclick={download}>Download</button>
  <button
    class="primary"
    disabled={editor.status === "saving" || editor.offline || !editor.dirty}
    onclick={() => editor.save()}
  >
    {editor.status === "saving" ? "Saving…" : "Save now"}
  </button>
  <button
    class="theme"
    onclick={() => (theme = theme === "dark" ? "light" : "dark")}
    aria-label="Switch theme"
  >
    {theme === "dark" ? "☀" : "☾"}
  </button>
</header>

{#if editor.error}
  <p class="banner error">{editor.error}</p>
{:else if editor.message}
  <p class="banner ok">{editor.message}</p>
{/if}

{#if editor.problems.length}
  <ul class="problems">
    {#each editor.problems as problem, index (index)}
      <li class={problem.level}>
        <strong>{problem.level}</strong>
        {problem.message}
      </li>
    {/each}
  </ul>
{/if}

<main>
  <div class="work">
    {#if editor.board}
      <EditorCanvas />
      <PreviewPanel />
    {:else}
      <p class="empty">
        No board open. Pick one from the catalogue on the right to start
        drawing it, or load a profile file.
      </p>
    {/if}
  </div>
  <aside>
    <BoardPanel />
    <ViewPanel />
    <ConnectorPanel />
    <ReceiverPanel />
    <PortsPanel />
  </aside>
</main>

<style lang="scss">
  :global(body) {
    margin: 0;
    background: var(--color-bg);
    color: var(--color-text);
    font-family:
      "Open Sans",
      system-ui,
      -apple-system,
      sans-serif;
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    position: sticky;
    top: 0;
    z-index: 2;
  }

  h1 {
    margin: 0;
    font-size: 0.95rem;
  }

  .file {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .state {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;

    &.ok {
      color: var(--color-status-good);
    }

    &.busy {
      color: var(--color-text-muted);
    }

    &.warn {
      color: var(--color-yellow-500);
    }
  }

  .auto {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .grow {
    flex: 1;
  }

  button {
    @extend %button;
    font-size: 0.75rem;
  }

  .primary {
    @extend %button-primary;
    font-size: 0.75rem;
  }

  .theme {
    width: 2rem;
  }

  .load {
    @extend %button;
    font-size: 0.75rem;
    cursor: pointer;

    input {
      display: none;
    }
  }

  .banner {
    margin: 0;
    padding: 8px 14px;
    font-size: 0.8rem;

    &.error {
      background: var(--color-red-100);
      color: var(--color-red-900);
    }

    &.ok {
      color: var(--color-text-muted);
    }
  }

  .problems {
    list-style: none;
    margin: 0;
    padding: 6px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.75rem;
    border-bottom: 1px solid var(--color-border);

    .error {
      color: var(--color-red-500);
    }

    .warning {
      color: var(--color-yellow-500);
    }
  }

  main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 14px;
    padding: 14px;
    align-items: start;
  }

  .work {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .empty {
    margin: 0;
    padding: 40px 20px;
    text-align: center;
    color: var(--color-text-muted);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-sm);
  }

  aside {
    display: flex;
    flex-direction: column;
    gap: 14px;
    position: sticky;
    top: 56px;
    max-height: calc(100vh - 70px);
    overflow-y: auto;
    padding-right: 4px;
  }

  @media (max-width: 1100px) {
    main {
      grid-template-columns: 1fr;
    }

    aside {
      position: static;
      max-height: none;
    }
  }
</style>
