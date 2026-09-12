# Board editor

A small app for drawing flight controllers: where each pad is, which
connector it belongs to, and which serial port's TX or RX it carries.
What it writes is `src/tabs/journey/board_profiles.json`, which is what
the configurator draws from.

```
pnpm board-editor
```

from the configurator root, then open <http://localhost:5078>.

## Why it exists

A board profile is a few hundred coordinates. Typing them into JSON and
reloading the app to see whether they landed anywhere near right is slow
enough that nobody does it, which is why no boards have profiles. This
makes it a drag-and-drop job against the board's own outline, starting
from the pins the catalogue already knows, and shows the result through
the app's own drawing component as you work —
`src/components/boardview/BoardViewCanvas.svelte`, imported directly, not
a lookalike. If it looks right here it looks right in the configurator.

## What it does

**Boards from the catalogue.** Filter
[WingFlight/wingflight-targets](https://github.com/WingFlight/wingflight-targets),
the same catalogue the Firmware Flasher loads boards from, and press
*Create board*. It downloads that board's `.config` and turns it into a
laid-out schematic: every pin the board reports, in the right colour
group, one connector per UART, every port joined to its two pads. Drawing
a board starts from a real board, never from an empty rectangle.

*Refresh from catalogue* re-reads a board you have already worked on.
Everything you placed survives — pad positions, connectors, views,
backgrounds — and only pins the catalogue has added or dropped change.

You can also load a profile file someone sent you, and *Example* loads a
worked profile that uses every part of the schema at once.

**Views.** Top, left and right, each with its own extent in millimetres,
its own CAD background and its own pads. Only the top view is required.

**Backgrounds.** Load an SVG exported from CAD. It is parsed, stripped of
scripts, event handlers and external references, and written to
`src/images/boards/`. When the export carries a real size — 1:1 with
millimetre units — the view's extent is taken from it, and every pad
placed afterwards is in real board coordinates.

**Pads.** Click *Add pad* and click the board, then drag. Arrow keys
nudge by the snap step, shift by five. Snap defaults to 0.254 mm; 2.54 mm
puts a pad exactly on a header pitch.

**Connectors.** Group a port's pads into one plug. This is what tells the
configurator that a UART is one connector rather than two places.

**Ports.** Each port's TX pin, RX pin and serial identifier. The panel
says how the port will be drawn — *together*, *split* or *single* — from
where the pads actually are, using the same code the app uses, so a
mistake shows up here rather than on someone's bench.

**Preview.** The drawing as the configurator renders it, with a sample of
port assignments you can cycle: nothing assigned, a typical wing, and the
longest function names there are, for checking that the labels still fit.

**Validation.** Errors and warnings live under the toolbar and update as
you type. Saving is refused while there are errors.

**Saving.** *Save to repo* writes the profile file. *Download* gives you
the same JSON as a file, for when you are not running the dev server.

## How it is wired up

- `vite.config.mjs` — its own Vite dev server on port 5078, with `@`
  pointing at the configurator's `src` and its own dependency cache so
  it does not disturb the app's dev server.
- `server/api.mjs` — a Vite plugin serving the handful of routes the
  editor needs, including the catalogue, which it fetches and caches on
  disk so the editor keeps working offline once primed. It can write
  exactly two places, the profile file and `src/images/boards/`, plus
  its own cache, and every path is resolved and checked against its root
  first.
- `src/lib/editor_state.svelte.js` — the document: boards, selection and
  an undo stack of snapshots.
- `src/lib/svg_import.js` — reading and sanitising a CAD export.
- `examples/` — the worked example, also loaded by the *Example* button.

The schema itself is documented in `docs/board-views.md`; the editor
imports it from `src/js/boardview/schema.js` rather than restating it, so
a profile the editor accepts is one the configurator draws.

## Limitations

- It needs the dev server to read or write anything. Without one, the
  catalogue and saving are both unavailable.
- The first use of a board needs the network. After that its config is
  cached on disk and works offline; so does the catalogue listing, for
  six hours, and a stale listing is served rather than none if GitHub
  cannot be reached.
- It has no undo for a *Save*: the file is written in place. It is a
  repository file, so `git diff` is the safety net.
