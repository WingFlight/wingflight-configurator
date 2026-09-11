<script>
  /**
   * File: tools/board-editor/src/components/PreviewPanel.svelte
   * The drawing as the configurator will render it.
   *
   * This deliberately mounts the app's own component rather than a
   * lookalike, so labels, leader lines and split markers are exactly
   * what a user will see. The port assignments are made up here -- the
   * editor has no flight controller attached -- and can be cycled so
   * an author can check that a long function name still fits.
   */
  import BoardViewCanvas from "@/components/boardview/BoardViewCanvas.svelte";
  import { buildPortMap } from "@/js/boardview/port_map.js";

  import { getEditorState } from "~editor/lib/editor_state.svelte.js";

  const editor = getEditorState();

  // A plausible set of jobs, so the preview shows the labels at the
  // length they will really be rather than all empty.
  const SAMPLES = [
    { label: "nothing assigned", masks: [] },
    {
      label: "typical wing",
      masks: [1, 64, 2, 1024, 32],
    },
    {
      label: "longest names",
      masks: [512, 1048576, 4194304, 2097152, 524288],
    },
  ];

  let sample = $state(1);

  let serialPorts = $derived(
    (editor.board?.ports ?? []).map((port, index) => ({
      identifier: port.identifier ?? index,
      functionMask: SAMPLES[sample].masks[index] ?? 0,
    })),
  );

  let portMap = $derived(
    buildPortMap({
      profile: editor.board,
      serialPorts,
      describeFunction: (port) =>
        ({
          1: "MSP",
          2: "GPS",
          32: "S.Port telemetry",
          64: "Serial RX",
          512: "MAVLink telemetry",
          1024: "ESC sensor",
          524288: "FBUS output",
          1048576: "S.Port master",
          2097152: "SRXL2 ESC telemetry",
          4194304: "Backup RX input",
        })[port?.functionMask] ?? "",
    }),
  );
</script>

<section>
  <div class="head">
    <h2>As the configurator draws it</h2>
    <select bind:value={sample}>
      {#each SAMPLES as entry, index (entry.label)}
        <option value={index}>{entry.label}</option>
      {/each}
    </select>
  </div>

  {#if editor.board && editor.view}
    <div class="frame">
      <BoardViewCanvas
        profile={editor.board}
        viewId={editor.viewId}
        {portMap}
        selectedPin={editor.selectedPin}
        onSelectPad={(pin) => (editor.selectedPin = pin)}
      />
    </div>
  {/if}
</section>

<style lang="scss">
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h2 {
    margin: 0;
    flex: 1;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  select {
    padding: 3px 6px;
    font-size: 0.75rem;
  }

  .frame {
    padding: 10px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
</style>
