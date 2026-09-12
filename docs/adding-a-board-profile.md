# Adding a board profile

A board profile tells the configurator where a flight controller's pads
are, so it can draw the board and label every serial port with what it
is set to do. Profiles live in `src/tabs/journey/board_profiles.json`.
The schema is documented in [board-views.md](board-views.md); this page
is the procedure.

A board with no profile is not left blank: the configurator synthesises
a schematic from what the board itself reports once the Wiring stage has
read it. A profile is what turns that schematic into the real board.

## Use the editor

```
pnpm board-editor
```

Opens the board editor on <http://localhost:5078>. It reads and writes
`src/tabs/journey/board_profiles.json` directly, previews the drawing
through the app's own component, and validates as you go. See
`tools/board-editor/README.md`.

Press **Example** in its toolbar to load a worked profile that uses
every part of the schema, including a UART split across two connectors.

No profiles ship by default. Every board falls back to the synthesised
schematic until someone with that board in hand draws it, which is why
adding one is worth the trouble only when you can measure it.

## The procedure

1. **Pick the board from the catalogue.** Filter the list at the top of
   the editor and press *Create board*. It downloads that board's
   `.config` from
   [WingFlight/wingflight-targets](https://github.com/WingFlight/wingflight-targets)
   and turns it into a laid-out schematic: every pin the board reports,
   in the right colour group, with one connector per UART and each port
   joined to its two pads. Nothing is written to the repository yet.

2. **Get a background.** Export the board's outline from CAD as SVG at
   1:1 with millimetre units, or photograph the board square-on with a
   ruler and trace it. Load it under *Background from CAD*; the view's
   extent is taken from the file when it carries a real size.

3. **Drag each pad onto its pad on the drawing.** Snap to 2.54 mm to sit
   on a header pitch; arrow keys nudge, shift moves five steps.

4. **Correct the silkscreen names** to what is actually printed on the
   board. The silkscreen is shown together with the canonical pin and
   resource name, never instead of them, so a wrong one is confusing
   rather than dangerous — but it is the name the user is looking at.

5. **Group the pads into connectors.** Add a connector per plug and
   assign its pads. This is what tells the configurator that a UART's TX
   and RX are one plug rather than two places.

6. **Add the side views** if the board breaks anything out on its edges.
   Press *+ Left* or *+ Right*, set the extent, and move those pads to
   that view.

7. **Check the ports.** Each port's TX and RX pin, and its serial
   identifier (0 is UART1, following the target rather than the
   silkscreen). The panel shows how each port will be drawn — *together*
   or *split* — as soon as the pads are placed.

8. **Clear the validation list**, then **uncheck "Coordinates are
   schematic"** once the positions are measured rather than invented,
   and Save.

Coming back to a board later, press *Refresh from catalogue*. That
re-reads the config and keeps everything you placed: pad positions,
connectors, views and backgrounds all survive, and only pins the
catalogue has added or dropped change.

## Where the pin data comes from

Everything the seed knows is read from the board's `.config` file in the
catalogue. Those files are the custom defaults the Firmware Flasher
writes when it flashes a board, so they are the same pin assignments the
board will actually boot with.

The `resource` lines are parsed by the configurator's own
`src/js/remap_fc/hardware_parser.js`, the same code that reads a live
board's `dump hardware`. Resources that are not user-facing pads — SPI
buses, chip selects, gyro interrupts — are ignored rather than drawn.
The `serial` lines give the board's default port assignments, used to
show realistic labels while drawing and never written into a profile.

Compare against a real `dump hardware` from the board before trusting a
profile: a board that has been remapped no longer matches its catalogue
entry, and the firmware's own defaults are what the wiring stage reverts
to.

## Doing it by hand

Editing the JSON directly works too; the schema is in
[board-views.md](board-views.md). Keep to the same conventions:

- `id` is the catalogue target id, `<MANUFACTURER>-<BOARD>`.
- `match` names `manufacturerId` and `boardName`, never a target name.
- `pin` in CLI form (`A09`, `B07`), each pin once per board.
- Coordinates in millimetres from the top-left of the view.
- `coordinatesSchematic: true` until the positions are measured.

## Checking

```
pnpm vitest run test/boardview
pnpm vitest run test/remap_fc
```

`test/boardview` validates every profile in the file: no duplicate pins,
no pad outside its view, no port claiming a pin that has no pad, no two
ports on one serial identifier, and a board name to match on. It also
runs a real catalogue config end to end through the seeding pipeline
against a vendored fixture, so the checks work offline. `test/remap_fc`
checks that every pad in the `outputs` group has timer data in
`src/js/remap_fc/MCU-all.json` for the profile's MCU.
