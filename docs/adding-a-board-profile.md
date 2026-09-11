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

## The procedure

1. **Start from the firmware target.** In the editor, pick the target
   under *Seed from firmware target* and press Seed. That creates a pad
   for every pin the target defines — outputs from the `timerHardware[]`
   table in `target.c`, UARTs, I2C, the ADC inputs, the LED strip and
   the beeper from `target.h` — plus one port per UART. They land
   stacked in the top-left corner.

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

## Where the defaults come from

Pin-to-function defaults are read from the firmware target in
`wingflight-firmware/src/main/target/<TARGET>/`:

- `target.c` — the `timerHardware[]` table: `TIM_USE_MOTOR` entries
  become `MOTOR 1..4` in order, `TIM_USE_SERVO` entries become
  `SERVO 1..n`, `TIM_USE_LED` the LED strip, `TIM_USE_PPM` the PPM input.
- `target.h` — `UARTn_TX_PIN` / `UARTn_RX_PIN`, `I2Cn_SCL` / `I2Cn_SDA`,
  `VBAT_ADC_PIN`, `CURRENT_METER_ADC_PIN`, `RSSI_ADC_PIN`,
  `EXTERNAL1_ADC_PIN`, `LED_STRIP_PIN`, `BEEPER_PIN`, `PINIOn_PIN`.
- `target.mk` — which MCU family the target builds for.

Compare against a real `dump hardware` from the board before trusting a
profile: the firmware's own defaults are what the wiring stage reverts
to.

## Doing it by hand

Editing the JSON directly works too; the schema is in
[board-views.md](board-views.md). Keep to the same conventions:

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
ports on one serial identifier. `test/remap_fc` checks that every pad in
the `outputs` group has timer data in `src/js/remap_fc/MCU-all.json` for
the profile's MCU.
