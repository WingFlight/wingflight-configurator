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

  #undo = [];
  #redo = [];
  // $state cannot see into a plain array field, so depth is tracked
  // alongside it for the buttons to bind to.
  #undoDepth = $state(0);
  #redoDepth = $state(0);

  board = $derived(this.boards[this.index] ?? null);
  view = $derived(this.board?.views?.[this.viewId] ?? null);
  problems = $derived(this.board ? validateProfile(this.board) : []);
  errors = $derived(this.problems.filter((p) => p.level === "error"));
  padsHere = $derived(
    (this.board?.pads ?? []).filter((pad) => pad.view === this.viewId),
  );
  selectedPad = $derived(
    this.board?.pads?.find((pad) => pad.pin === this.selectedPin) ?? null,
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

  /** Writes every board back to the profile file. */
  async save() {
    if (this.errors.length) {
      this.error = "Fix the errors below before saving.";
      return false;
    }
    this.status = "saving";
    this.error = null;
    try {
      await api.putProfiles({
        _note: this.note ?? undefined,
        boards: this.boards.map(serialiseProfile),
      });
      this.dirty = false;
      this.message = "Saved to src/tabs/journey/board_profiles.json";
      return true;
    } catch (error) {
      this.error = String(error.message ?? error);
      return false;
    } finally {
      this.status = "idle";
    }
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
    this.dirty = true;
    this.message = null;
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
    this.error = null;
    this.message = `Loaded ${incoming.length} board(s). Nothing is written until you save.`;
    return incoming.length;
  }

  // --- boards ---------------------------------------------------------

  removeBoard() {
    if (!this.board) return;
    this.#pushUndo(true);
    this.boards = this.boards.filter((_, i) => i !== this.index);
    this.index = Math.max(0, Math.min(this.index, this.boards.length - 1));
    this.selectedPin = null;
    this.dirty = true;
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

  removeView(id) {
    if (id === "top") return;
    this.edit((board) => {
      delete board.views[id];
      board.pads = board.pads.filter((pad) => pad.view !== id);
      board.headers = board.headers.filter((header) => header.view !== id);
    });
    this.viewId = "top";
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
    this.dirty = true;
    this.message = null;
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

  // --- headers --------------------------------------------------------

  addHeader(label) {
    const id = `header-${(this.board?.headers?.length ?? 0) + 1}`;
    this.edit((board) => {
      board.headers.push({
        id,
        label: label || id,
        view: this.viewId,
        x: null,
        y: null,
        width: null,
        height: null,
      });
    });
    return id;
  }

  setHeaderField(id, field, value) {
    this.edit((board) => {
      const header = board.headers.find((entry) => entry.id === id);
      if (!header) return;
      const previous = header.id;
      header[field] = value;
      if (field === "id") {
        for (const pad of board.pads) {
          if (pad.header === previous) pad.header = value;
        }
      }
    });
  }

  removeHeader(id) {
    this.edit((board) => {
      board.headers = board.headers.filter((header) => header.id !== id);
      for (const pad of board.pads) {
        if (pad.header === id) pad.header = null;
      }
    });
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
    const previous = at >= 0 ? serialiseProfile($state.snapshot(this.boards[at])) : null;
    const authored = new Map(
      (previous?.pads ?? []).map((pad) => [
        pad.pin,
        {
          x: pad.x,
          y: pad.y,
          view: pad.view,
          side: pad.side,
          header: pad.header ?? null,
          labelSide: pad.labelSide ?? "auto",
          reserved: pad.reserved ?? false,
          silkscreen: pad.silkscreen,
        },
      ]),
    );

    const fresh = serialiseProfile(seeded);
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
      // Views, connectors and backgrounds are the author's work, not
      // the catalogue's, so a refresh leaves them as they were.
      views: previous?.views ?? fresh.views,
      headers: previous?.headers ?? fresh.headers,
      pads: fresh.pads.map((pad) => ({ ...pad, ...(authored.get(pad.pin) ?? {}) })),
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
    this.dirty = true;
    this.error = null;
    this.message = previous
      ? `Refreshed ${id} from the catalogue, keeping your pad positions.`
      : `Created ${id} with ${next.pads.length} pads. Nothing is written until you save.`;
    return id;
  }
}

let instance = null;

/** The editor's one document. */
export function getEditorState() {
  instance ??= new EditorState();
  return instance;
}
