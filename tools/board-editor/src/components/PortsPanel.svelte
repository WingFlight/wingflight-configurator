<script>
  /**
   * File: tools/board-editor/src/components/PortsPanel.svelte
   * The serial ports: which TX and RX pin each one is, and which
   * serial identifier the firmware knows it by.
   *
   * A port's *label* is what the board prints -- "Port A" -- and is
   * edited here too, because both names have to be right: the letter
   * is what a user looks for, the identifier is what the firmware's
   * serial configuration is keyed to (REQUIREMENTS.md, R3).
   *
   * A port is its TX pin and its RX pin, nothing more. Whether it is
   * "split" is worked out from where those two pins landed, and shown
   * back here as it will appear in the configurator, so an author can
   * see straight away whether the drawing says what the board does.
   */
  import { buildPortMap } from "@/js/boardview/port_map.js";

  import { getEditorState } from "~editor/lib/editor_state.svelte.js";

  const editor = getEditorState();

  // Every signal position on the board, named by where it is, so
  // choosing a port's TX is picking a physical place on a plug.
  let pinOptions = $derived(
    (editor.board?.allPads ?? [])
      .filter((pad) => pad.pin)
      .map((pad) => ({
        pin: pad.pin,
        label: pad.connectorLabel
          ? `${pad.silkscreen ?? pad.pin} · ${pad.connectorLabel} pin ${pad.position}`
          : `${pad.silkscreen ?? pad.pin} (${pad.pin})`,
      })),
  );

  // The same computation the configurator runs, so "split" here means
  // split there.
  let derivedPorts = $derived(
    buildPortMap({
      profile: editor.board,
      serialPorts: (editor.board?.ports ?? []).map((port) => ({
        identifier: port.identifier,
        functionMask: 0,
      })),
    }),
  );

  let layoutById = $derived(
    Object.fromEntries(derivedPorts.map((port) => [port.id, port])),
  );

  function whereLines(port) {
    const row = layoutById[port.id];
    if (!row) return "";
    return row.lines
      .filter((line) => line.pad)
      .map((line) => `${line.role.toUpperCase()} on ${line.pad.view}`)
      .join(", ");
  }
</script>

<section>
  <h2>Serial ports</h2>
  <button onclick={() => editor.addPort()}>Add port</button>

  {#each editor.board?.ports ?? [] as port (port.id)}
    {@const row = layoutById[port.id]}
    <div class="port">
      <div class="pair">
        <label>
          Label
          <input
            value={port.label ?? ""}
            onchange={(event) =>
              editor.setPortField(port.id, "label", event.currentTarget.value)}
          />
        </label>
        <label>
          Serial identifier
          <input
            type="number"
            min="0"
            value={port.identifier ?? ""}
            onchange={(event) =>
              editor.setPortField(
                port.id,
                "identifier",
                event.currentTarget.value,
              )}
          />
        </label>
      </div>
      <div class="pair">
        {#each ["tx", "rx"] as line (line)}
          <label>
            {line.toUpperCase()} pin
            <select
              value={port[line] ?? ""}
              onchange={(event) =>
                editor.setPortField(port.id, line, event.currentTarget.value)}
            >
              <option value="">not broken out</option>
              {#each pinOptions as option (option.pin)}
                <option value={option.pin}>{option.label}</option>
              {/each}
            </select>
          </label>
        {/each}
      </div>
      <label>
        Layout
        <select
          value={port.split === null ? "auto" : port.split ? "split" : "together"}
          onchange={(event) =>
            editor.setPortField(port.id, "split", event.currentTarget.value)}
        >
          <option value="auto">work it out from the pad positions</option>
          <option value="together">always one connector</option>
          <option value="split">always two places</option>
        </select>
      </label>
      <p class="verdict">
        Drawn as: <strong>{row?.layout ?? "—"}</strong>
        {#if whereLines(port)}· {whereLines(port)}{/if}
      </p>
      <button class="danger" onclick={() => editor.removePort(port.id)}>
        Delete port
      </button>
    </div>
  {/each}

  {#if !editor.board?.ports?.length}
    <p class="note">
      No ports yet. Seeding from a firmware target creates one per UART.
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

  .row {
    display: flex;
    gap: 6px;

    input {
      flex: 1;
      min-width: 0;
    }
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
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .header-row {
    display: grid;
    grid-template-columns: 1fr 5rem 1.8rem;
    gap: 4px;
  }

  .port {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .verdict {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .note {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
</style>
