/**
 * File: tools/board-editor/src/lib/editor_state.svelte.js
 * The editor's document: the profile file, the board being edited,
 * what is selected, and the undo stack.
 *
 * The board is held in the *normalised* schema 2 shape throughout
 * (src/js/boardview/schema.js), so what the preview draws is exactly
 * what the configurator will draw. Only on save is it put back through
 * `serialiseProfile`, which is what decides the on-disk spelling.
 *
 * Undo is a snapshot stack rather than a command log: a board profile
 * is a few kilobytes, snapshots are cheap, and it means every editing
 * action gets undo for free without each one having to describe its
 * own inverse.
 */

import {
  DEFAULT_PITCH,
  emptyConnector,
  normaliseConnectorPin,
} from "@/js/boardview/connectors.js";
import { synthesiseBoardView } from "@/js/boardview/generic_layout.js";
import {
  emptyView,
  normalisePin,
  normaliseProfile,
  serialiseProfile,
  validateProfile,
  VIEW_IDS,
} from "@/js/boardview/schema.js";
import { readTargetConfig } from "@/js/boardview/unified_config.js";

import * as api from "./api.js";

const UNDO_LIMIT = 100;

class EditorState {
  /** @type {Object[]} every board in the profile file, normalised */
  boards = $state([]);
  /** @type {number} which one is being edited */
  index = $state(0);
  /** @type {string} which view is on the canvas */
  viewId = $state("top");
  /** @type {?string} pin of the selected pad */
  selectedPin = $state(null);
  /** @type {?string} id of the connector being edited */
  selectedConnectorId = $state(null);
  /** @type {?string} id of the selected port */
  selectedPortId = $state(null);
  /** @type {'idle'|'loading'|'saving'} */
  status = $state("idle");
  /** @type {?string} */
  message = $state(null);
  /** @type {?string} */
  error = $state(null);
  /** Whether the file has unsaved edits. */
  dirty = $state(false);
  /** Grid spacing in mm; 0 turns snapping off. 2.54 is a header pitch. */
  snap = $state(0.254);
  /** Whether the file could be loaded from a dev server at all. */
  offline = $state(false);
  /**
   * Whether edits are written to the profile file on their own.
   *
   * On by default, because losing an afternoon's placement work to a
   * closed tab is the worst thing this tool can do. It is a repository
   * file, though, so a write only happens once the profile validates
   * and only after edits have stopped: a half-typed pin never reaches
   * the file, and `git diff` stays reviewable rather than recording
   * every keystroke.
   */
  autoSave = $state(true);
  /** When the file was last written, for the toolbar. */
  savedAt = $state(null);

  #undo = [];
  #redo = [];
  #autoSaveTimer = null;
  // $state cannot see into a plain array field, so depth is tracked
  // alongside it for the buttons to bind to.
  #undoDepth = $state(0);
  #redoDepth = $state(0);

  board = $derived(this.boards[this.index] ?? null);
  view = $derived(this.board?.views?.[this.viewId] ?? null);
  problems = $derived(this.board ? validateProfile(this.board) : []);
  errors = $derived(this.problems.filter((p) => p.level === "error"));
  // Every drawn position on the current view, connectors included.
  padsHere = $derived(
    (this.board?.allPads ?? []).filter((pad) => pad.view === this.viewId),
  );
  connectorsHere = $derived(
    (this.board?.connectors ?? []).filter(
      (connector) => connector.view === this.viewId,
    ),
  );
  selectedConnector = $derived(
    this.board?.connectors?.find(
      (connector) => connector.id === this.selectedConnectorId,
    ) ?? null,
  );
  selectedPad = $derived(
    this.board?.allPads?.find((pad) => pad.pin === this.selectedPin) ?? null,
  );
  canUndo = $derived(this.#undoDepth > 0);
  canRedo = $derived(this.#redoDepth > 0);

  /** Loads the profile file. Falls back to a single blank board offline. */
  async load() {
    this.status = "loading";
    this.error = null;
    try {
      const file = await api.getProfiles();
      this.boards = (file.boards ?? []).map(normaliseProfile);
      this.note = file._note ?? null;
      this.offline = false;
      // An empty file is the normal state: a board earns an entry only
      // once someone has drawn it. Pick one from the catalogue to start.
      this.index = 0;
      this.dirty = false;
    } catch (error) {
      this.offline = true;
      this.error = `${error.message}. The catalogue and saving are unavailable; use Download to keep any work.`;
      this.boards = [];
    } finally {
      this.status = "idle";
    }
  }

  /**
   * Writes every board back to the profile file.
   * @param {{quiet?: boolean}} [options] `quiet` for an automatic save,
   *   which should not announce itself or report a validation error the
   *   author can already see in the problems list.
   */
  async save({ quiet = false } = {}) {
    if (!quiet) this.cancelAutoSave();
    if (this.errors.length) {
      if (!quiet) this.error = "Fix the errors below before saving.";
      return false;
    }
    this.status = "saving";
    if (!quiet) this.error = null;
    try {
      await api.putProfiles({
        _note: this.note ?? undefined,
        boards: this.boards.map(serialiseProfile),
      });
      this.dirty = false;
      this.savedAt = Date.now();
      this.error = null;
      if (!quiet) {
        this.message = "Saved to src/tabs/journey/board_profiles.json";
      }
      return true;
    } catch (error) {
      this.error = String(error.message ?? error);
      return false;
    } finally {
      this.status = "idle";
    }
  }

  /** How long editing has to stop before an automatic save happens. */
  static AUTO_SAVE_QUIET_MS = 1200;

  /**
   * Marks the document changed and queues an automatic save.
   *
   * Every edit goes through here, including the pointer-rate ones, so
   * a drag rearms the timer rather than writing the file per frame.
   */
  touch() {
    this.dirty = true;
    this.message = null;
    this.queueAutoSave();
  }

  /**
   * Queues an automatic save without disturbing the status line, for
   * the operations that have something of their own to say.
   */
  queueAutoSave() {
    if (!this.autoSave || this.offline) return;

    clearTimeout(this.#autoSaveTimer);
    this.#autoSaveTimer = setTimeout(() => {
      this.#autoSaveTimer = null;
      // Re-checked here rather than when queued: an edit can have been
      // undone, or broken the profile, in the meantime.
      if (!this.autoSave || this.offline || !this.dirty) return;
      if (this.errors.length) return;
      this.save({ quiet: true });
    }, EditorState.AUTO_SAVE_QUIET_MS);
  }

  /** Stops a queued automatic save, for a deliberate save or a reload. */
  cancelAutoSave() {
    clearTimeout(this.#autoSaveTimer);
    this.#autoSaveTimer = null;
  }

  /** The file as it would be written, for saving by hand. */
  asJson() {
    return `${JSON.stringify(
      { _note: this.note ?? undefined, boards: this.boards.map(serialiseProfile) },
      null,
      2,
    )}\n`;
  }

  // --- edits ----------------------------------------------------------

  /**
   * Runs `change` against the current board, snapshotting first so it
   * can be undone. `change` mutates the board it is handed.
   * @param {(board: Object) => void} change
   */
  edit(change) {
    if (!this.board) return;
    this.#pushUndo();
    // $state.snapshot is already a plain deep copy; the round trip
    // through serialise/normalise afterwards is what canonicalises
    // whatever `change` did (pin spelling, dropped pads, defaults).
    const next = $state.snapshot(this.board);
    change(next);
    this.boards[this.index] = normaliseProfile(serialiseProfile(next));
    this.touch();
  }

  // An undo entry is the one board that is about to change, not the
  // whole file: a drag would otherwise serialise every board per step.
  // Structural changes -- add, remove, import -- pass `whole: true`
  // and snapshot the array instead.
  #snapshot(whole = false) {
    return whole
      ? {
          index: this.index,
          boards: this.boards.map((board) =>
            serialiseProfile($state.snapshot(board)),
          ),
        }
      : {
          index: this.index,
          board: serialiseProfile($state.snapshot(this.board)),
        };
  }

  #pushUndo(whole = false) {
    this.#undo.push(this.#snapshot(whole));
    if (this.#undo.length > UNDO_LIMIT) this.#undo.shift();
    this.#undoDepth = this.#undo.length;
    this.#redo = [];
    this.#redoDepth = 0;
  }

  #restore(snapshot) {
    if (snapshot.boards) {
      this.boards = snapshot.boards.map(normaliseProfile);
      this.index = Math.min(snapshot.index, this.boards.length - 1);
    } else {
      this.index = snapshot.index;
      this.boards[snapshot.index] = normaliseProfile(snapshot.board);
    }
    this.dirty = true;
    this.queueAutoSave();
  }

  // Undo and redo mirror each other: the entry being reversed decides
  // whether its counterpart records one board or the whole file.
  #swap(to, snapshot) {
    to.push(this.#snapshot(Boolean(snapshot.boards)));
    this.#undoDepth = this.#undo.length;
    this.#redoDepth = this.#redo.length;
    this.#restore(snapshot);
  }

  undo() {
    const snapshot = this.#undo.pop();
    if (snapshot) this.#swap(this.#redo, snapshot);
  }

  redo() {
    const snapshot = this.#redo.pop();
    if (snapshot) this.#swap(this.#undo, snapshot);
  }

  /**
   * Adds the boards from a profile file, replacing any board already
   * carrying the same id. Used for the worked example under
   * tools/board-editor/examples and for a profile sent by someone else.
   * @param {Object} file `{boards: [...]}`
   * @returns {number} how many boards arrived
   */
  importFile(file) {
    const incoming = (file?.boards ?? []).map(normaliseProfile).filter(Boolean);
    if (!incoming.length) {
      this.error = "That file has no boards in it.";
      return 0;
    }
    this.#pushUndo(true);
    const merged = this.boards.filter(
      (board) => !incoming.some((entry) => entry.id === board.id),
    );
    this.boards = [...merged, ...incoming];
    this.index = this.boards.length - incoming.length;
    this.viewId = "top";
    this.selectedPin = null;
    this.dirty = true;
    this.queueAutoSave();
    this.error = null;
    this.message = `Loaded ${incoming.length} board(s).${this.autoSave ? "" : " Nothing is written until you save."}`;
    return incoming.length;
  }

  // --- boards ---------------------------------------------------------

  removeBoard() {
    if (!this.board) return;
    this.#pushUndo(true);
    this.boards = this.boards.filter((_, i) => i !== this.index);
    this.index = Math.max(0, Math.min(this.index, this.boards.length - 1));
    this.selectedPin = null;
    this.touch();
  }

  setBoardField(field, value) {
    this.edit((board) => {
      if (field === "manufacturerId" || field === "boardName") {
        board.match[field] = String(value)
          .split(",")
          .map((entry) => entry.trim().toUpperCase())
          .filter(Boolean);
      } else {
        board[field] = value;
      }
    });
  }

  // --- views ----------------------------------------------------------

  addView(id) {
    if (!VIEW_IDS.includes(id)) return;
    this.edit((board) => {
      board.views[id] ??= emptyView(id);
    });
    this.viewId = id;
  }

  /**
   * Drops a side view and everything drawn on it.
   *
   * The top view stays: it is the one every profile has and the one
   * the configurator falls back to. Everything else on the view goes
   * with it -- connectors, loose pads, a receiver -- because a pad on
   * a view that is not there is drawn nowhere and can never be found
   * again. Undo puts it all back.
   *
   * @param {string} id "left" or "right"
   */
  removeView(id) {
    if (id === "top" || !this.board?.views?.[id]) return;
    const gone = new Set(
      (this.board.connectors ?? [])
        .filter((connector) => connector.view === id)
        .map((connector) => connector.id),
    );
    this.edit((board) => {
      delete board.views[id];
      board.pads = board.pads.filter((pad) => pad.view !== id);
      board.connectors = board.connectors.filter(
        (connector) => connector.view !== id,
      );
      board.receivers = board.receivers.filter(
        (receiver) => receiver.view !== id,
      );
    });
    if (this.viewId === id) this.viewId = "top";
    if (gone.has(this.selectedConnectorId)) this.selectedConnectorId = null;
    this.selectedPin = null;
  }

  /** What deleting a view would take with it, for the editor to say. */
  viewContents(id) {
    const on = (entry) => entry.view === id;
    return {
      connectors: (this.board?.connectors ?? []).filter(on).length,
      pads: (this.board?.pads ?? []).filter(on).length,
      receivers: (this.board?.receivers ?? []).filter(on).length,
    };
  }

  setViewField(field, value) {
    this.edit((board) => {
      const view = board.views[this.viewId];
      if (!view) return;
      view[field] = value;
    });
  }

  // --- pads -----------------------------------------------------------

  addPad({ x, y, pin = "", silkscreen = "", group = "other" } = {}) {
    const canonical = normalisePin(pin) || this.#freePinName();
    this.edit((board) => {
      board.pads.push({
        pin: canonical,
        silkscreen: silkscreen || null,
        x,
        y,
        view: this.viewId,
        side: "top",
        group,
        header: null,
        labelSide: "auto",
        reserved: false,
      });
    });
    this.selectedPin = canonical;
  }

  #freePinName() {
    const taken = new Set((this.board?.pads ?? []).map((pad) => pad.pin));
    for (let port = 0; port < 11; port += 1) {
      for (let number = 0; number < 16; number += 1) {
        const pin = `${String.fromCharCode(65 + port)}${String(number).padStart(2, "0")}`;
        if (!taken.has(pin)) return pin;
      }
    }
    return "A00";
  }

  /** A single, undoable move; keyboard nudges use this. */
  movePad(pin, x, y) {
    this.edit((board) => {
      const pad = board.pads.find((entry) => entry.pin === pin);
      if (!pad) return;
      pad.x = this.snapped(x);
      pad.y = this.snapped(y);
    });
  }

  /**
   * A pointer drag is many moves but one edit. beginDrag takes the
   * undo snapshot once; dragPad then writes straight into the reactive
   * board, which redraws only what moved; endDrag rounds the result
   * the way a saved file would hold it.
   */
  beginDrag() {
    if (this.board) this.#pushUndo();
  }

  dragPad(pin, x, y) {
    const pad = this.board?.pads.find((entry) => entry.pin === pin);
    if (!pad) return;
    pad.x = this.snapped(x);
    pad.y = this.snapped(y);
    this.touch();
  }

  endDrag(pin) {
    const pad = this.board?.pads.find((entry) => entry.pin === pin);
    if (!pad) return;
    pad.x = Math.round(pad.x * 100) / 100;
    pad.y = Math.round(pad.y * 100) / 100;
  }

  setPadField(pin, field, value) {
    this.edit((board) => {
      const pad = board.pads.find((entry) => entry.pin === pin);
      if (!pad) return;
      pad[field] = field === "pin" ? normalisePin(value) : value;
    });
    if (field === "pin") this.selectedPin = normalisePin(value);
  }

  removePad(pin) {
    this.edit((board) => {
      board.pads = board.pads.filter((pad) => pad.pin !== pin);
      for (const port of board.ports) {
        if (port.tx === pin) port.tx = null;
        if (port.rx === pin) port.rx = null;
      }
    });
    if (this.selectedPin === pin) this.selectedPin = null;
  }

  snapped(value) {
    if (!this.snap) return Math.round(value * 100) / 100;
    return Math.round(value / this.snap) * this.snap;
  }

  // --- connectors -----------------------------------------------------

  /**
   * Adds a connector with `count` empty positions (R1). Placing it
   * places every position, so the author sets the count and the pitch
   * once rather than dragging pads one at a time.
   */
  addConnector({ label, kind = "port", count = 4 } = {}) {
    const id = `connector-${(this.board?.connectors?.length ?? 0) + 1}`;
    this.edit((board) => {
      board.connectors.push(
        emptyConnector({
          id,
          label: label || null,
          kind,
          view: this.viewId,
          x: 6,
          y: 6,
          count,
        }),
      );
    });
    this.selectedConnectorId = id;
    return id;
  }

  setConnectorField(id, field, value) {
    this.edit((board) => {
      const connector = board.connectors.find((entry) => entry.id === id);
      if (!connector) return;
      if (field === "kind") {
        connector.kind = value;
        // A kind carries a conventional pitch. Following it on a
        // change is what the author wants nine times in ten, and the
        // pitch box is right there for the tenth.
        connector.pitch = DEFAULT_PITCH[value] ?? connector.pitch;
      } else if (["x", "y", "rotation", "pitch"].includes(field)) {
        connector[field] = Number(value);
      } else {
        connector[field] = value;
      }
    });
    if (field === "id") this.selectedConnectorId = value;
  }

  moveConnector(id, x, y) {
    this.edit((board) => {
      const connector = board.connectors.find((entry) => entry.id === id);
      if (!connector) return;
      connector.x = this.snapped(x);
      connector.y = this.snapped(y);
    });
  }

  /** A connector drag is one edit, however many pointer moves it takes. */
  beginConnectorDrag() {
    if (this.board) this.#pushUndo();
  }

  dragConnector(id, x, y) {
    const connector = this.board?.connectors.find((entry) => entry.id === id);
    if (!connector) return;
    connector.x = this.snapped(x);
    connector.y = this.snapped(y);
    this.touch();
  }

  removeConnector(id) {
    this.edit((board) => {
      const gone = board.connectors.find((entry) => entry.id === id);
      const pins = new Set(
        (gone?.pins ?? []).map((pin) => pin.pin).filter(Boolean),
      );
      board.connectors = board.connectors.filter((entry) => entry.id !== id);
      // A port pointing at a pin that no longer exists anywhere would
      // be a dangling reference, so it is cleared with the connector.
      for (const port of board.ports) {
        if (pins.has(port.tx)) port.tx = null;
        if (pins.has(port.rx)) port.rx = null;
      }
    });
    if (this.selectedConnectorId === id) this.selectedConnectorId = null;
  }

  /** Adds `count` empty positions to the end of a connector. */
  addConnectorPins(id, count = 1) {
    this.edit((board) => {
      const connector = board.connectors.find((entry) => entry.id === id);
      if (!connector) return;
      for (let i = 0; i < count; i += 1) {
        connector.pins.push(
          normaliseConnectorPin({ position: connector.pins.length + 1 }),
        );
      }
    });
  }

  /**
   * Sets what one position carries. `field` is `pin`, `net`,
   * `silkscreen`, `group`, `side` or `reserved`; setting a pin clears
   * any net and the other way round, because a position carries one
   * thing (R2).
   */
  setConnectorPin(id, position, field, value) {
    this.edit((board) => {
      const connector = board.connectors.find((entry) => entry.id === id);
      const pin = connector?.pins.find((entry) => entry.position === position);
      if (!pin) return;
      if (field === "pin") {
        pin.pin = value ? normalisePin(value) : null;
        if (pin.pin) pin.net = null;
      } else if (field === "net") {
        pin.net = value ? String(value).toUpperCase() : null;
        if (pin.net) pin.pin = null;
      } else {
        pin[field] = value;
      }
    });
  }

  /**
   * Moves one position along its connector by `delta` places.
   *
   * Positions are physical: which end of the plug a wire goes into. A
   * row transcribed in the wrong order has to be fixable without
   * retyping every value, so the entries swap and the numbering is
   * rebuilt to stay 1..n.
   */
  moveConnectorPin(id, position, delta) {
    this.edit((board) => {
      const connector = board.connectors.find((entry) => entry.id === id);
      if (!connector) return;
      const from = connector.pins.findIndex((pin) => pin.position === position);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= connector.pins.length) return;
      const pins = [...connector.pins];
      [pins[from], pins[to]] = [pins[to], pins[from]];
      connector.pins = pins.map((pin, index) => ({
        ...pin,
        position: index + 1,
      }));
    });
  }

  /**
   * Reverses a connector's positions. Plugs are numbered from either
   * end depending on who drew the board, and discovering you read it
   * backwards should not mean retyping the row.
   */
  reverseConnectorPins(id) {
    this.edit((board) => {
      const connector = board.connectors.find((entry) => entry.id === id);
      if (!connector) return;
      connector.pins = [...connector.pins]
        .reverse()
        .map((pin, index) => ({ ...pin, position: index + 1 }));
    });
  }

  removeConnectorPin(id, position) {
    this.edit((board) => {
      const connector = board.connectors.find((entry) => entry.id === id);
      if (!connector) return;
      connector.pins = connector.pins
        .filter((pin) => pin.position !== position)
        .map((pin, index) => ({ ...pin, position: index + 1 }));
    });
  }

  // --- receivers ------------------------------------------------------

  /** Declares a receiver soldered to the board (R6). */
  addReceiver() {
    const id = `receiver-${(this.board?.receivers?.length ?? 0) + 1}`;
    this.edit((board) => {
      board.receivers.push({
        id,
        label: null,
        protocol: null,
        portIdentifier: null,
        view: this.viewId,
        // Against an edge, because that is where a receiver module and
        // its aerials actually go (R6).
        side: "top",
        offset: 0.5,
        width: 12,
        height: 6,
        antenna: null,
        notes: null,
      });
    });
    return id;
  }

  setReceiverField(id, field, value) {
    this.edit((board) => {
      const receiver = board.receivers.find((entry) => entry.id === id);
      if (!receiver) return;
      if (["offset", "width", "height"].includes(field)) {
        receiver[field] = Number(value);
      } else if (field === "portIdentifier") {
        receiver.portIdentifier =
          value === "" || value === null ? null : Number(value);
      } else {
        receiver[field] = value || null;
      }
    });
  }

  removeReceiver(id) {
    this.edit((board) => {
      board.receivers = board.receivers.filter((entry) => entry.id !== id);
    });
  }

  // --- the board's name -----------------------------------------------

  /** Moves the board's name on the current view (R5's sibling). */
  setTitleField(field, value) {
    this.edit((board) => {
      const view = board.views[this.viewId];
      if (!view?.title) return;
      view.title[field] = ["x", "y"].includes(field) ? Number(value) : value;
    });
  }

  dragTitle(x, y) {
    const view = this.board?.views?.[this.viewId];
    if (!view?.title) return;
    view.title.x = this.snapped(x);
    view.title.y = this.snapped(y);
    this.touch();
  }

  // --- the USB socket -------------------------------------------------

  /** Places the USB socket, or removes it when `place` is false (R5). */
  setUsb(place) {
    this.edit((board) => {
      const view = board.views[this.viewId];
      if (!view) return;
      view.usb = place
        ? { x: view.width / 2 - 4.5, y: -1.8, width: 9, height: 3.6, rotation: 0 }
        : null;
    });
  }

  setUsbField(field, value) {
    this.edit((board) => {
      const view = board.views[this.viewId];
      if (!view?.usb) return;
      view.usb[field] = Number(value);
    });
  }

  dragUsb(x, y) {
    const view = this.board?.views?.[this.viewId];
    if (!view?.usb) return;
    view.usb.x = this.snapped(x);
    view.usb.y = this.snapped(y);
    this.touch();
  }

  // --- ports ----------------------------------------------------------

  addPort() {
    const used = new Set((this.board?.ports ?? []).map((port) => port.identifier));
    let identifier = 0;
    while (used.has(identifier)) identifier += 1;
    const id = `UART${identifier + 1}`;
    this.edit((board) => {
      board.ports.push({
        id,
        identifier,
        label: id,
        tx: null,
        rx: null,
        split: null,
        notes: null,
      });
    });
    this.selectedPortId = id;
    return id;
  }

  setPortField(id, field, value) {
    this.edit((board) => {
      const port = board.ports.find((entry) => entry.id === id);
      if (!port) return;
      if (field === "tx" || field === "rx") {
        port[field] = value ? normalisePin(value) : null;
      } else if (field === "identifier") {
        port.identifier = value === "" || value === null ? null : Number(value);
      } else if (field === "split") {
        port.split = value === "auto" ? null : value === "split";
      } else {
        port[field] = value;
      }
    });
    if (field === "id") this.selectedPortId = value;
  }

  removePort(id) {
    this.edit((board) => {
      board.ports = board.ports.filter((port) => port.id !== id);
    });
    if (this.selectedPortId === id) this.selectedPortId = null;
  }

  // --- the unified target catalogue -----------------------------------

  /**
   * Creates or refreshes a board from a unified target config.
   *
   * The config's `resource` lines are read with the configurator's own
   * parser and laid out with its own schematic layout, so a freshly
   * seeded board is already a correct drawing: outputs along the
   * bottom, serial ports down the sides, power across the top, each
   * port joined to its two pins. What is left is loading the CAD
   * background and dragging the pads onto where they really are.
   *
   * Seeding a board that already exists refreshes it from the
   * catalogue while keeping what the author decided: where each pad
   * sits, which view and connector it is on, what it is called, and
   * the views and backgrounds themselves. A pin the catalogue dropped
   * goes; a pin it added arrives in its schematic position.
   *
   * @param {string} configText a `.config` file from the catalogue
   * @returns {?string} the id of the board now selected
   */
  seedFromConfig(configText) {
    const { identity, hardwareMap, serialPorts } = readTargetConfig(configText);
    const id = identity.targetId;
    if (!id) {
      this.error = "That config names no board_name and manufacturer_id.";
      return null;
    }

    const seeded = synthesiseBoardView({
      hardwareMap,
      serialPorts,
      boardName: identity.boardName,
      mcu: identity.mcu,
    });
    if (!seeded) {
      this.error = `${id} declares no pins to draw.`;
      return null;
    }

    const at = this.boards.findIndex((board) => board.id === id);
    const previous =
      at >= 0 ? serialiseProfile($state.snapshot(this.boards[at])) : null;
    const fresh = serialiseProfile(seeded);

    // The catalogue owns which pins exist. Everything else -- which
    // connector a pin sits on, in which position, under what name,
    // where that connector is, what the ground and power positions
    // are -- is the author's, and a refresh must not touch it (R7).
    const catalogue = new Set(
      Object.values(hardwareMap)
        .map((entry) => normalisePin(entry.pin))
        .filter(Boolean),
    );

    let connectors = fresh.connectors ?? [];
    let removed = 0;
    let added = 0;

    if (previous) {
      // Keep the author's connectors, dropping only positions whose
      // pin the catalogue no longer has. An emptied position stays: it
      // is a physical hole in the plug either way.
      connectors = (previous.connectors ?? []).map((connector) => ({
        ...connector,
        pins: connector.pins.map((pin) => {
          if (!pin.pin || catalogue.has(pin.pin)) return pin;
          removed += 1;
          const { pin: _gone, ...rest } = pin;
          return rest;
        }),
      }));

      // Pins the catalogue has that sit on none of them arrive in the
      // freshly synthesised connectors, for the author to place.
      const placed = new Set(
        connectors.flatMap((connector) =>
          connector.pins.map((pin) => pin.pin).filter(Boolean),
        ),
      );
      for (const connector of fresh.connectors ?? []) {
        const pins = connector.pins.filter(
          (pin) => pin.pin && !placed.has(pin.pin),
        );
        if (!pins.length) continue;
        added += pins.length;
        connectors.push({
          ...connector,
          id: `${connector.id}-new`,
          label: `${connector.label ?? connector.id} (new)`,
          pins: pins.map((pin, index) => ({ ...pin, position: index + 1 })),
        });
      }
    }

    const next = normaliseProfile({
      ...fresh,
      id,
      display: previous?.display ?? identity.boardName ?? id,
      mcu: identity.mcu,
      match: {
        manufacturerId: [identity.manufacturerId],
        boardName: [identity.boardName],
      },
      // Only the author's own measurements earn the right to drop this.
      coordinatesSchematic: previous
        ? Boolean(previous.coordinatesSchematic)
        : true,
      // Views, receivers, backgrounds and loose pads are the author's
      // work, not the catalogue's, so a refresh leaves them alone.
      views: previous?.views ?? fresh.views,
      receivers: previous?.receivers ?? [],
      pads: previous?.pads ?? [],
      connectors,
    });

    this.#pushUndo(true);
    if (at >= 0) {
      this.boards[at] = next;
      this.index = at;
    } else {
      this.boards = [...this.boards, next];
      this.index = this.boards.length - 1;
    }
    this.viewId = "top";
    this.selectedPin = null;
    this.selectedConnectorId = null;
    this.dirty = true;
    this.queueAutoSave();
    this.error = null;
    this.message = previous
      ? `Refreshed ${id}: ${added} pin(s) added, ${removed} removed, everything you placed kept.`
      : `Created ${id} with ${next.allPads.length} pins.${this.autoSave ? "" : " Nothing is written until you save."}`;
    return id;
  }
}

let instance = null;

/** The editor's one document. */
export function getEditorState() {
  instance ??= new EditorState();
  return instance;
}
