<script>
  /**
   * File: tools/board-editor/src/components/ConnectorPanel.svelte
   * The connectors, their positions, and what each position carries.
   *
   * This is where a board stops being a scatter of pads and becomes a
   * set of plugs: a label the user will read, a pin count, a pitch,
   * and one row per physical position saying whether it is a signal, a
   * ground, a power rail, or nothing at all
   * (tools/board-editor/REQUIREMENTS.md, R1 and R2).
   */
  import {
    CONNECTOR_KINDS,
    KNOWN_NETS,
    pinRole,
  } from "@/js/boardview/connectors.js";

  import { getEditorState } from "~editor/lib/editor_state.svelte.js";

  const editor = getEditorState();

  let newLabel = $state("");
  let newKind = $state("port");
  let newCount = $state(4);

  let connector = $derived(editor.selectedConnector);

  /**
   * What the author said a position should carry, while they are still
   * filling it in.
   *
   * The stored data has no "role": a position carries a pin, or a net,
   * or nothing, and the role is read back from that. That is right for
   * the file and wrong for the form. Choosing "signal" on a fresh
   * position writes nothing, so the position was still empty, the
   * dropdown snapped back to "nothing" and no pin box ever appeared.
   * The intent is remembered here until a value makes it real.
   */
  let intended = $state({});

  const intendKey = (position) => `${connector?.id}:${position}`;

  function roleOf(pin) {
    const stored = pinRole(pin);
    // A position that carries something has settled the question; an
    // empty one falls back to whatever the author last asked for.
    return stored === "empty" ? (intended[intendKey(pin.position)] ?? stored) : stored;
  }

  function setRole(position, role) {
    if (!connector) return;
    intended[intendKey(position)] = role;
    if (role === "net") {
      editor.setConnectorPin(connector.id, position, "net", "GND");
    } else {
      // Clearing both is what makes it empty; for "signal" the pin box
      // then appears, waiting for a pin.
      editor.setConnectorPin(connector.id, position, "pin", "");
      editor.setConnectorPin(connector.id, position, "net", "");
    }
  }
</script>

<section>
  <h2>Connectors</h2>

  <div class="row">
    <input placeholder="Label, e.g. Port A" bind:value={newLabel} />
    <select bind:value={newKind}>
      {#each CONNECTOR_KINDS as kind (kind)}
        <option value={kind}>{kind}</option>
      {/each}
    </select>
    <input type="number" min="1" max="60" bind:value={newCount} title="Positions" />
    <button
      onclick={() => {
        editor.addConnector({
          label: newLabel.trim(),
          kind: newKind,
          count: Number(newCount) || 1,
        });
        newLabel = "";
      }}>Add</button
    >
  </div>

  <ul class="list">
    {#each editor.board?.connectors ?? [] as entry (entry.id)}
      <li>
        <button
          class={["entry", editor.selectedConnectorId === entry.id && "on"]}
          onclick={() => {
            editor.selectedConnectorId = entry.id;
            editor.viewId = entry.view;
          }}
        >
          <span class="name">{entry.label ?? entry.id}</span>
          <span class="meta">
            {entry.kind} · {entry.pins.length} pins · {entry.view}
          </span>
        </button>
      </li>
    {/each}
    {#if !editor.board?.connectors?.length}
      <li class="note">
        No connectors yet. Seeding a board from the catalogue creates one per
        port; add more for the plugs the catalogue cannot know about.
      </li>
    {/if}
  </ul>

  {#if connector}
    <h3>{connector.label ?? connector.id}</h3>

    <div class="pair">
      <label>
        Label
        <input
          value={connector.label ?? ""}
          placeholder="Port A"
          onchange={(event) =>
            editor.setConnectorField(
              connector.id,
              "label",
              event.currentTarget.value.trim() || null,
            )}
        />
      </label>
      <label>
        Kind
        <select
          value={connector.kind}
          onchange={(event) =>
            editor.setConnectorField(
              connector.id,
              "kind",
              event.currentTarget.value,
            )}
        >
          {#each CONNECTOR_KINDS as kind (kind)}
            <option value={kind}>{kind}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="pair">
      <label>
        x (mm)
        <input
          type="number"
          step="0.01"
          value={connector.x}
          onchange={(event) =>
            editor.setConnectorField(connector.id, "x", event.currentTarget.value)}
        />
      </label>
      <label>
        y (mm)
        <input
          type="number"
          step="0.01"
          value={connector.y}
          onchange={(event) =>
            editor.setConnectorField(connector.id, "y", event.currentTarget.value)}
        />
      </label>
    </div>

    <div class="pair">
      <label>
        Pitch (mm)
        <input
          type="number"
          step="0.01"
          min="0.1"
          value={connector.pitch}
          onchange={(event) =>
            editor.setConnectorField(
              connector.id,
              "pitch",
              event.currentTarget.value,
            )}
        />
      </label>
      <label>
        Runs (degrees)
        <select
          value={String(connector.rotation)}
          onchange={(event) =>
            editor.setConnectorField(
              connector.id,
              "rotation",
              event.currentTarget.value,
            )}
        >
          <option value="0">right →</option>
          <option value="90">down ↓</option>
          <option value="180">left ←</option>
          <option value="270">up ↑</option>
        </select>
      </label>
    </div>

    <div class="pair">
      <label>
        View
        <select
          value={connector.view}
          onchange={(event) =>
            editor.setConnectorField(
              connector.id,
              "view",
              event.currentTarget.value,
            )}
        >
          {#each Object.keys(editor.board.views) as id (id)}
            <option value={id}>{id}</option>
          {/each}
        </select>
      </label>
      <label>
        Labels read
        <select
          value={connector.labelSide}
          onchange={(event) =>
            editor.setConnectorField(
              connector.id,
              "labelSide",
              event.currentTarget.value,
            )}
        >
          <option value="auto">auto (nearest edge)</option>
          <option value="left">left</option>
          <option value="right">right</option>
          <option value="above">above</option>
          <option value="below">below</option>
        </select>
      </label>
    </div>

    <h4>Positions</h4>
    <table class="pins">
      <thead>
        <tr>
          <th>#</th>
          <th>Carries</th>
          <th>Value</th>
          <th>Label</th>
          <th colspan="3"></th>
        </tr>
      </thead>
      <tbody>
        {#each connector.pins as pin (pin.position)}
          {@const role = roleOf(pin)}
          <tr>
            <td class="pos">{pin.position}</td>
            <td>
              <select
                value={role}
                onchange={(event) =>
                  setRole(pin.position, event.currentTarget.value)}
              >
                <option value="signal">signal</option>
                <option value="net">power / ground</option>
                <option value="empty">nothing</option>
              </select>
            </td>
            <td>
              {#if role === "signal"}
                <input
                  value={pin.pin ?? ""}
                  placeholder="B06"
                  onchange={(event) =>
                    editor.setConnectorPin(
                      connector.id,
                      pin.position,
                      "pin",
                      event.currentTarget.value,
                    )}
                />
              {:else if role === "net"}
                <input
                  list="known-nets"
                  value={pin.net ?? ""}
                  placeholder="GND"
                  onchange={(event) =>
                    editor.setConnectorPin(
                      connector.id,
                      pin.position,
                      "net",
                      event.currentTarget.value,
                    )}
                />
              {:else}
                <span class="muted">—</span>
              {/if}
            </td>
            <td>
              <input
                value={pin.silkscreen ?? ""}
                placeholder={pin.net ?? "TX"}
                onchange={(event) =>
                  editor.setConnectorPin(
                    connector.id,
                    pin.position,
                    "silkscreen",
                    event.currentTarget.value.trim() || null,
                  )}
              />
            </td>
            <td>
              <button
                class="tiny"
                title="Move this position one earlier"
                disabled={pin.position === 1}
                onclick={() =>
                  editor.moveConnectorPin(connector.id, pin.position, -1)}
                >↑</button
              >
            </td>
            <td>
              <button
                class="tiny"
                title="Move this position one later"
                disabled={pin.position === connector.pins.length}
                onclick={() =>
                  editor.moveConnectorPin(connector.id, pin.position, 1)}
                >↓</button
              >
            </td>
            <td>
              <button
                class="danger tiny"
                title="Remove this position"
                onclick={() =>
                  editor.removeConnectorPin(connector.id, pin.position)}>×</button
              >
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <datalist id="known-nets">
      {#each KNOWN_NETS as net (net)}
        <option value={net}></option>
      {/each}
    </datalist>

    <div class="row">
      <button onclick={() => editor.addConnectorPins(connector.id, 1)}>
        Add position
      </button>
      <button
        title="Plugs are numbered from either end; this flips which is pin 1"
        onclick={() => editor.reverseConnectorPins(connector.id)}
      >
        Reverse
      </button>
      <button class="danger" onclick={() => editor.removeConnector(connector.id)}>
        Delete connector
      </button>
    </div>
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

  h3,
  h4 {
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

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .row {
    display: flex;
    gap: 6px;

    input[type="number"] {
      width: 3.4rem;
      flex: none;
    }

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
    min-width: 0;
  }

  button {
    @extend %button;
    font-size: 0.75rem;

    &.danger {
      color: var(--color-red-500);
    }

    &.tiny {
      padding: 1px 5px;
    }
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 150px;
    overflow-y: auto;
  }

  .entry {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    border: none;
    border-radius: var(--radius-xs);
    background: none;
    text-align: left;
    font-size: 0.75rem;
    padding: 3px 6px;

    &.on {
      background: var(--color-surface-raised);
    }

    .name {
      font-weight: 600;
      color: var(--color-text);
    }

    .meta {
      color: var(--color-text-muted);
    }
  }

  .pins {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;

    th {
      text-align: left;
      font-weight: 600;
      color: var(--color-text-disabled);
      padding-bottom: 2px;
    }

    td {
      padding: 1px 2px;
    }

    button.tiny {
      padding: 0 4px;
      line-height: 1.1;
    }

    .pos {
      width: 1.4rem;
      color: var(--color-text-muted);
      font-variant-numeric: tabular-nums;
    }

    input,
    select {
      width: 100%;
      padding: 1px 4px;
      font-size: 0.75rem;
    }
  }

  .muted {
    color: var(--color-text-disabled);
  }

  .note {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
</style>
