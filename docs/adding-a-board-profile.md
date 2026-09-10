# Adding a board profile

Board profiles live in `src/tabs/journey/board_profiles.json`. One entry per
board carries both the silkscreen labels and the pad coordinates, so a single
file feeds the pad labels in the pin picker and the board drawing
(`src/components/BoardCanvas.svelte`).

## Schema

```json
{
  "id": "MATEKF405",
  "match": { "targetName": ["MATEKF405"], "boardDesign": ["MATEKF405"] },
  "display": "Matek F405-WING",
  "mcu": "STM32F405",
  "coordinatesSchematic": true,
  "outline": { "width": 56, "height": 36, "mountHoles": [[3, 3], [53, 3], [3, 33], [53, 33]] },
  "pads": [
    { "pin": "C06", "silkscreen": "S1", "x": 4.0, "y": 33.5, "side": "top", "group": "outputs" }
  ]
}
```

- `match` values are compared case-insensitively against `FC.CONFIG.targetName`
  and `FC.CONFIG.boardDesign` (target name wins).
- `pin` uses the CLI form (`A08`, `B07`; no `P` prefix, two digits).
- `outline` is in millimetres, top-down view with the USB connector at the top
  edge. `mountHoles` are `[x, y]` centres.
- `group` is one of `outputs | uart | power | i2c | adc | led | other`; it drives
  the pad colour.
- `silkscreen` is what is printed on the board next to the pad. It is always
  shown *together with* the canonical pin and resource name, never instead of
  them.
- `coordinatesSchematic: true` says the coordinates are a schematic layout
  (outputs along the bottom edge, UARTs along the sides, power/ADC at the top)
  rather than measured positions. Remove it once you have measured the board.

## Where the defaults come from

Pin-to-function defaults are read from the firmware target in
`wingflight-firmware/src/main/target/<TARGET>/`:

- `target.c` -- the `timerHardware[]` table: `TIM_USE_MOTOR` entries become
  `MOTOR 1..4` in order, `TIM_USE_SERVO` entries become `SERVO 1..n`,
  `TIM_USE_LED` the LED strip, `TIM_USE_PPM` the PPM input.
- `target.h` -- `UARTn_TX_PIN` / `UARTn_RX_PIN`, `I2Cn_SCL` / `I2Cn_SDA`,
  `VBAT_ADC_PIN`, `CURRENT_METER_ADC_PIN`, `RSSI_ADC_PIN`, `EXTERNAL1_ADC_PIN`,
  `LED_STRIP_PIN`, `BEEPER_PIN`, `PINIOn_PIN`.

Compare against a real `dump hardware` from the board before trusting a
profile: the firmware's own defaults are what the wiring stage reverts to.

## Measuring coordinates

1. Photograph the board top-down with a ruler, or use the manufacturer's
   dimensioned drawing.
2. Set `outline.width`/`height` to the PCB size and the mount hole centres.
3. Enter each pad centre in mm from the top-left corner (x to the right, y
   downwards). Pads on the underside get `"side": "bottom"` and are drawn
   dashed.
4. Remove `coordinatesSchematic`.

## Checking

`pnpm vitest run test/remap_fc` checks that every pad pin has timer data in
`src/js/remap_fc/MCU-all.json` for the profile's `mcu` where the pad is in the
`outputs` group, and that no pin appears twice on one board.
