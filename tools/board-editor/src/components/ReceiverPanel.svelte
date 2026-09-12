<script>
  /**
   * File: tools/board-editor/src/components/ReceiverPanel.svelte
   * Receivers soldered to the board, and where the USB socket is.
   *
   * Both are things the user can see on the board that are not pins.
   * A built-in receiver also occupies a serial port they can never
   * wire, which is why it has to be declared rather than merely drawn
   * (tools/board-editor/REQUIREMENTS.md, R5 and R6).
   */
  import { getEditorState } from "~editor/lib/editor_state.svelte.js";

  const editor = getEditorState();

  const PROTOCOLS = ["CRSF", "ELRS", "FBUS", "SBUS", "FPORT", "GHST", "SRXL2"];

  let ports = $derived(editor.board?.ports ?? []);
  let usb = $derived(editor.view?.usb ?? null);
</script>

<section>
  <h2>USB socket</h2>
  {#if editor.view}
    {#if usb}
      <div class="pair">
        <label>
          x (mm)
          <input
            type="number"
            step="0.1"
            value={usb.x}
            onchange={(event) =>
              editor.setUsbField("x", event.currentTarget.value)}
          />
        </label>
        <label>
          y (mm)
          <input
            type="number"
            step="0.1"
            value={usb.y}
            onchange={(event) =>
              editor.setUsbField("y", event.currentTarget.value)}
          />
        </label>
      </div>
      <div class="pair">
        <label>
          width (mm)
          <input
            type="number"
            step="0.1"
            value={usb.width}
            onchange={(event) =>
              editor.setUsbField("width", event.currentTarget.value)}
          />
        </label>
        <label>
          height (mm)
          <input
            type="number"
            step="0.1"
            value={usb.height}
            onchange={(event) =>
              editor.setUsbField("height", event.currentTarget.value)}
          />
        </label>
      </div>
      <p class="note">Drag it on the drawing, or type its position here.</p>
      <button class="danger" onclick={() => editor.setUsb(false)}>
        No USB on this view
      </button>
    {:else}
      <button onclick={() => editor.setUsb(true)}>Place a USB socket</button>
    {/if}
  {/if}

  <h2>Built-in receiver</h2>
  {#each editor.board?.receivers ?? [] as receiver (receiver.id)}
    <div class="card">
      <div class="pair">
        <label>
          Label
          <input
            value={receiver.label ?? ""}
            placeholder="Built-in ELRS"
            onchange={(event) =>
              editor.setReceiverField(
                receiver.id,
                "label",
                event.currentTarget.value,
              )}
          />
        </label>
        <label>
          Protocol
          <input
            list="rx-protocols"
            value={receiver.protocol ?? ""}
            placeholder="CRSF"
            onchange={(event) =>
              editor.setReceiverField(
                receiver.id,
                "protocol",
                event.currentTarget.value.toUpperCase(),
              )}
          />
        </label>
      </div>
      <label>
        Occupies port
        <select
          value={receiver.portIdentifier === null
            ? ""
            : String(receiver.portIdentifier)}
          onchange={(event) =>
            editor.setReceiverField(
              receiver.id,
              "portIdentifier",
              event.currentTarget.value,
            )}
        >
          <option value="">none</option>
          {#each ports as port (port.id)}
            <option value={String(port.identifier)}>
              {port.label ?? port.id}
            </option>
          {/each}
        </select>
      </label>
      <div class="pair">
        <label>
          x (mm)
          <input
            type="number"
            step="0.1"
            value={receiver.x}
            onchange={(event) =>
              editor.setReceiverField(receiver.id, "x", event.currentTarget.value)}
          />
        </label>
        <label>
          y (mm)
          <input
            type="number"
            step="0.1"
            value={receiver.y}
            onchange={(event) =>
              editor.setReceiverField(receiver.id, "y", event.currentTarget.value)}
          />
        </label>
      </div>
      <div class="pair">
        <label>
          width (mm)
          <input
            type="number"
            step="0.1"
            value={receiver.width}
            onchange={(event) =>
              editor.setReceiverField(
                receiver.id,
                "width",
                event.currentTarget.value,
              )}
          />
        </label>
        <label>
          Antenna
          <select
            value={receiver.antenna ?? ""}
            onchange={(event) =>
              editor.setReceiverField(
                receiver.id,
                "antenna",
                event.currentTarget.value,
              )}
          >
            <option value="">on the board</option>
            <option value="ufl">u.FL pigtail</option>
            <option value="wire">bare wire</option>
          </select>
        </label>
      </div>
      <button class="danger" onclick={() => editor.removeReceiver(receiver.id)}>
        Delete receiver
      </button>
    </div>
  {/each}

  <datalist id="rx-protocols">
    {#each PROTOCOLS as protocol (protocol)}
      <option value={protocol}></option>
    {/each}
  </datalist>

  <button onclick={() => editor.addReceiver()}>Add receiver</button>
  {#if !editor.board?.receivers?.length}
    <p class="note">
      Only for a receiver soldered to the board. Declaring it stops the port
      list reporting its port as "not broken out", which would be wrong: the
      port is in use by hardware that is already connected.
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

  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
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

  .note {
    margin: 0;
    font-size: 0.72rem;
    color: var(--color-text-disabled);
  }
</style>
