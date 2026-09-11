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
  emptyView,
  normalisePin,
  normaliseProfile,
  serialiseProfile,
  validateProfile,
  VIEW_IDS,
} from "@/js/boardview/schema.js";

import * as api from "./api.js";

const UNDO_LIMIT = 100;

function blankBoard(id = "NEWBOARD") {
  return normaliseProfile({
    id,
    display: id,
    mcu: null,
    match: { targetName: [id], boardDesign: [id] },
    coordinatesSchematic: true,
    views: { top: emptyView("top") },
    pads: [],
    headers: [],
    ports: [],
  });
}

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

  // $state cannot see into a plain array field, so depth is tracked
  // alongside it for the buttons to bind to.
  #undoDepth = $state(0);
  #redoDepth = $state(0);
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
      if (!this.boards.length) this.boards = [blankBoard()];
      this.index = 0;
      this.dirty = false;
    } catch (error) {
      this.offline = true;
      this.error = `${error.message}. Editing a blank board; use Download to keep your work.`;
      this.boards = [blankBoard()];
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
    const next = normaliseProfile(serialiseProfile($state.snapshot(this.board)));
    change(next);
    this.boards[this.index] = normaliseProfile(serialiseProfile(next));
    this.dirty = true;
    this.message = null;
  }

  #pushUndo() {
    this.#undo.push({
      index: this.index,
      boards: this.boards.map((board) => serialiseProfile($state.snapshot(board))),
    });
    if (this.#undo.length > UNDO_LIMIT) this.#undo.shift();
    this.#undoDepth = this.#undo.length;
    this.#redo = [];
    this.#redoDepth = 0;
  }

  #restore(snapshot) {
    this.boards = snapshot.boards.map(normaliseProfile);
    this.index = Math.min(snapshot.index, this.boards.length - 1);
    this.dirty = true;
  }

  undo() {
    const snapshot = this.#undo.pop();
    if (!snapshot) return;
    this.#redo.push({
      index: this.index,
      boards: this.boards.map((board) => serialiseProfile($state.snapshot(board))),
    });
    this.#redoDepth = this.#redo.length;
    this.#undoDepth = this.#undo.length;
    this.#restore(snapshot);
  }

  redo() {
    const snapshot = this.#redo.pop();
    if (!snapshot) return;
    this.#undo.push({
      index: this.index,
      boards: this.boards.map((board) => serialiseProfile($state.snapshot(board))),
    });
    this.#undoDepth = this.#undo.length;
    this.#redoDepth = this.#redo.length;
    this.#restore(snapshot);
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
    this.#pushUndo();
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

  addBoard(id) {
    this.#pushUndo();
    this.boards = [...this.boards, blankBoard(id || "NEWBOARD")];
    this.index = this.boards.length - 1;
    this.viewId = "top";
    this.dirty = true;
  }

  removeBoard() {
    if (this.boards.length <= 1) return;
    this.#pushUndo();
    this.boards = this.boards.filter((_, i) => i !== this.index);
    this.index = Math.max(0, this.index - 1);
    this.dirty = true;
  }

  setBoardField(field, value) {
    this.edit((board) => {
      if (field === "targetName" || field === "boardDesign") {
        board.match[field] = String(value)
          .split(",")
          .map((entry) => entry.trim())
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

  movePad(pin, x, y) {
    this.edit((board) => {
      const pad = board.pads.find((entry) => entry.pin === pin);
      if (!pad) return;
      pad.x = this.snapped(x);
      pad.y = this.snapped(y);
    });
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

  /**
   * Fills a board from a firmware target: one pad per pin the target
   * defines, laid out the way the generic schematic lays them out, and
   * one port per UART. Existing pads for the same pins are left alone,
   * so this can be run against a half-finished profile.
   * @param {Object} target parsed by the dev server's /api/targets
   */
  seedFromTarget(target) {
    this.edit((board) => {
      // A plain lookup rather than a Set: this is scratch state inside
      // one synchronous edit, never anything the UI reads back.
      const taken = Object.fromEntries(board.pads.map((pad) => [pad.pin, true]));
      const view = board.views[this.viewId] ?? emptyView(this.viewId);
      // Anything new lands in a staging row along the top, for the
      // author to drag into place against the background.
      let column = 0;
      const add = (pin, silkscreen, group) => {
        if (!pin || taken[pin]) return;
        taken[pin] = true;
        board.pads.push({
          pin,
          silkscreen,
          x: 2 + ((column * 3) % Math.max(6, view.width - 4)),
          y: 2 + Math.floor((column * 3) / Math.max(6, view.width - 4)) * 3,
          view: this.viewId,
          side: "top",
          group,
          header: null,
          labelSide: "auto",
          reserved: false,
        });
        column += 1;
      };

      for (const output of target.outputs ?? []) {
        add(output.pin, output.key, output.group);
      }
      for (const [index, lines] of Object.entries(target.uarts ?? {})) {
        add(lines.tx, `TX${index}`, "uart");
        add(lines.rx, `RX${index}`, "uart");
        const identifier = Number(index) - 1;
        if (!board.ports.some((port) => port.identifier === identifier)) {
          board.ports.push({
            id: `UART${index}`,
            identifier,
            label: `UART${index}`,
            tx: lines.tx ?? null,
            rx: lines.rx ?? null,
            split: null,
            notes: null,
          });
        }
      }
      for (const [index, lines] of Object.entries(target.i2c ?? {})) {
        add(lines.sda, `SDA${index}`, "i2c");
        add(lines.scl, `SCL${index}`, "i2c");
      }
      for (const [key, entry] of Object.entries(target.singles ?? {})) {
        add(entry.pin, key, entry.group);
      }
      if (target.mcu && !board.mcu) board.mcu = target.mcu;
    });
  }
}

let instance = null;

/** The editor's one document. */
export function getEditorState() {
  instance ??= new EditorState();
  return instance;
}
