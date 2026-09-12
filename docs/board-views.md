# Board views and port maps

The configurator draws the connected flight controller and labels every
serial port with the job it is currently set to do. This document is the
schema behind that drawing. To *make* one, use the board editor
(`tools/board-editor`, see its README) rather than typing JSON by hand;
this is the reference for what the editor writes and what the app reads.

## Where the pieces live

| What | Where |
| --- | --- |
| The profile file | `src/tabs/journey/board_profiles.json` |
| Background drawings | `src/images/boards/*.svg`, served at `/images/boards/…` |
| Schema and normaliser | `src/js/boardview/schema.js` |
| Reading a unified target config | `src/js/boardview/unified_config.js` |
| Port joining and split detection | `src/js/boardview/port_map.js` |
| Fallback for an undrawn board | `src/js/boardview/generic_layout.js` |
| Label placement | `src/js/boardview/label_layout.js` |
| The drawing | `src/components/boardview/BoardViewCanvas.svelte` |
| Drawing plus view switcher and port list | `src/components/boardview/PortMap.svelte` |
| Editor | `tools/board-editor` |

## Identifying a board

Boards are identified the way unified firmware identifies them: by
`manufacturer_id` and `board_name`. That pair is what the catalogue at
[WingFlight/wingflight-targets](https://github.com/WingFlight/wingflight-targets)
names its config files after, and it is what a flashed board reports
over MSP.

The firmware target name deliberately plays no part. Under unified
firmware every board on one MCU reports the same target name, so
matching on it would hand one board's drawing to every other board
built on the same silicon.

A profile naming both halves wins. A profile naming only a board name
is accepted next, which lets one drawing cover a board sold under two
manufacturer ids. Nothing matches on manufacturer alone.

## What gets drawn, and when

In order of preference:

1. **A hand-made profile**, matched as above. This is the only case
   where the pads are where they really are on the board.
2. **A schematic synthesised from the board's own report**, for a board
   nobody has drawn yet. Outputs along the bottom, serial ports down the
   sides, power and sensing across the top. It needs the pin data the
   Wiring stage reads over the CLI, and it says on the drawing that the
   positions are not real.
3. **No drawing at all**, when the board is neither known nor read. The
   port list still appears, and says why there is no picture.

## Schema, version 2

```json
{
  "schema": 2,
  "id": "MTKS-MATEKH743",
  "match": { "manufacturerId": ["MTKS"], "boardName": ["MATEKH743"] },
  "display": "Matek H743-WING",
  "mcu": "STM32H743",
  "coordinatesSchematic": true,

  "views": {
    "top":   { "width": 56, "height": 36,
               "background": "/images/boards/matek-h743-top.svg",
               "backgroundOpacity": 0.6,
               "mountHoles": [[3, 3], [53, 3], [3, 33], [53, 33]],
               "usb": { "edge": "top", "offset": 0.5 } },
    "left":  { "width": 56, "height": 11 },
    "right": { "width": 56, "height": 11 }
  },

  "headers": [
    { "id": "j3", "label": "J3 UART1", "view": "top" }
  ],

  "pads": [
    { "pin": "A09", "silkscreen": "TX1", "x": 4, "y": 12,
      "view": "top", "side": "top", "group": "uart", "header": "j3" }
  ],

  "ports": [
    { "id": "UART1", "identifier": 0, "label": "UART1",
      "tx": "A09", "rx": "A10" }
  ]
}
```

`id` is the catalogue's target id, `<MANUFACTURER>-<BOARD>`. Nothing
enforces that, but keeping to it means a profile and its catalogue
entry are obviously the same board.

### views

Up to three: `top`, `left`, `right`. Only `top` is required, and a view
the profile does not declare simply is not offered in the switcher.

- `width` / `height` are millimetres. For `top` they are the PCB
  outline; for a side view they are the board's length and its height
  including connectors.
- `background` is a path under `/images/boards/`. With a background the
  drawing puts the pads over it and draws no outline of its own; without
  one it draws a plain rounded rectangle and the board's name.
- `usb` says which edge the USB connector is on and how far along it
  (`0` to `1`). Labels on that edge are moved out to clear it. `null`
  means do not draw it.

**Exporting a background from CAD.** Export SVG at 1:1 with millimetre
units, so the file carries `width="56mm"`. The editor then takes the
view's extent straight from the file and every pad placed afterwards is
in real board coordinates. An export with no units still works, but the
extent comes from the viewBox and has to be corrected by hand. See
`src/images/boards/example-wing-top.svg` for the convention.

### headers

A header is a physical connector. It exists so a label can name the plug
rather than each pin on it, and so the drawing can tell whether a port's
two pins are one connector or two.

`x`, `y`, `width`, `height` are optional: with them the connector's
footprint is drawn as given, without them it is the bounding box of the
pads that name it.

### pads

- `pin` is the CLI form: `A09`, `B07`. No `P` prefix, two digits. It is
  the key that joins a pad to everything else, and no pin may appear
  twice on one board.
- `silkscreen` is what is printed next to the pad. It is always shown
  *together with* the canonical pin and resource name, never instead of
  them.
- `x`, `y` are millimetres from the top-left corner of the pad's view.
- `view` is `top`, `left` or `right`; a pad naming a view the profile
  does not have is dropped.
- `side` is which face of the PCB the pad is on. Bottom-side pads are
  drawn dashed. This is separate from which view they appear in.
- `group` is one of `outputs | uart | power | i2c | adc | led | other |
  internal`, and drives the pad's colour. `internal` is drawn but never
  offered for reassignment, as is any pad with `reserved: true`.
- `labelSide` is `auto` by default, which labels towards the nearest
  edge. Override it with `left`, `right`, `above` or `below` for a
  crowded corner.
- `header` names the connector the pad is on.

### ports

One entry per serial port.

- `identifier` is the firmware's own serial identifier: `0` is UART1.
  This is what joins the drawing to the live serial configuration, so it
  must follow the target, not the silkscreen.
- `tx` and `rx` are pins. Either may be omitted for a port that is only
  broken out one way.
- `split` is normally absent. Whether a port counts as split is derived
  from where its two pads landed: different views, or different headers,
  or more than 12 mm apart with no headers given. Set it to `true` or
  `false` only to override that.

**Split ports are the reason this schema exists.** A UART whose TX and
RX come out on two different connectors takes two wires to two places,
and a drawing that shows it as one connector is actively misleading. On
the drawing the two pads get a marker each and a tie line between them
when they are on the same view; the port list names where each half is.
`tools/board-editor/examples/example-three-view.json` is a worked
example of exactly this.

## Backwards compatibility

A version 1 profile's *geometry* — an `outline` and pads with no `view`
— is upgraded in memory to a single top view by `normaliseProfile`, so
an old file still draws. Its `match` is not carried over: a profile
keyed to a firmware target name is dropped to an empty match and will
never be found, which is the honest outcome, since that key no longer
identifies a board. Restate it in unified terms.

## Checking a profile

- `pnpm vitest run test/boardview` checks the schema, the port joining,
  the label placement and every profile in the file.
- The editor shows the same validation live, and refuses to save while
  there are errors.
- `validateProfile` reports a pin placed twice, a pin that is not a
  port/number pin, two ports claiming one identifier, a pad outside its
  view, a pad naming a header that does not exist, and a port pin with
  no pad.
