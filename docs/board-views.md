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
| Connectors and their positions | `src/js/boardview/connectors.js` |
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

## Schema, version 3

```json
{
  "schema": 3,
  "id": "FRSK-VANTAC_RF007",
  "match": { "manufacturerId": ["FRSK"], "boardName": ["VANTAC_RF007"] },
  "display": "Vantac RF007",
  "mcu": "STM32F7X2",
  "coordinatesSchematic": true,

  "views": {
    "top":   { "width": 36, "height": 36,
               "background": "/images/boards/vantac-rf007-top.svg",
               "backgroundOpacity": 0.6,
               "mountHoles": [[3, 3], [33, 3], [3, 33], [33, 33]],
               "usb": { "x": 14, "y": -1.8, "width": 9, "height": 3.6 } },
    "left":  { "width": 36, "height": 11, "usb": null },
    "right": { "width": 36, "height": 11, "usb": null }
  },

  "connectors": [
    { "id": "port-a", "label": "Port A", "kind": "port", "view": "top",
      "x": 4, "y": 11, "pitch": 2, "rotation": 0,
      "pins": [
        { "position": 1, "net": "GND" },
        { "position": 2, "net": "5V" },
        { "position": 3, "pin": "B06", "silkscreen": "TX" },
        { "position": 4, "pin": "B07", "silkscreen": "RX" }
      ] }
  ],

  "receivers": [
    { "id": "rx", "label": "Built-in ELRS", "protocol": "CRSF",
      "portIdentifier": 4, "view": "top",
      "x": 22, "y": 26, "width": 12, "height": 6, "antenna": "ufl" }
  ],

  "pads": [],

  "ports": [
    { "id": "UART1", "identifier": 0, "label": "Port A",
      "tx": "B06", "rx": "B07" }
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
- `usb` is a rectangle placed anywhere on the view: `x`, `y`, `width`,
  `height` and an optional `rotation`. `null` means the view does not
  show it. Labels near it are moved out to clear it. The older
  `{edge, offset}` form is still read and converted.

**Exporting a background from CAD.** Export SVG at 1:1 with millimetre
units, so the file carries `width="56mm"`. The editor then takes the
view's extent straight from the file and every pad placed afterwards is
in real board coordinates. An export with no units still works, but the
extent comes from the viewBox and has to be corrected by hand. See
`src/images/boards/example-wing-top.svg` for the convention.

### connectors

A connector is a physical plug, and it owns its positions. This is the
heart of the schema: placing a connector places every one of its pins,
at its pitch, in order, so a ten-way header lands in one move instead of
ten.

- `label` is what is printed on the board, e.g. `Port A`. It is shown
  wherever that port appears, alongside the UART number rather than
  instead of it.
- `kind` is `port`, `header` or `solder`. It decides how the shell is
  drawn and what pitch a new connector defaults to: a peripheral plug, a
  2.54 mm pinheader, or a row of bare pads.
- `x`, `y` are the centre of **position 1**, in millimetres.
- `rotation` is degrees clockwise from "positions run to the right", so
  `90` runs down the board. Position *n* sits `pitch` millimetres along
  that direction from position *n-1*.
- `pitch` is centre to centre, in millimetres.
- `labelSide` behaves as on a pad, and applies to every position. Leave
  it `auto` unless a corner is crowded: forcing a dozen labels onto one
  short edge makes the drawing very wide.

Each entry in `pins` is one physical position, and carries exactly one
of:

- `pin` — an MCU pin such as `B06`, which joins it to a resource, a
  serial port and the timer/DMA tables;
- `net` — a power or ground rail: `GND`, `3V3`, `5V`, `VBAT`, `VBEC`,
  or whatever the board silkscreens. Drawn as a square, never a
  resource, never offered for reassignment, and exempt from the
  one-pin-per-board rule, because a board has many grounds;
- neither — a position that exists on the plug and carries nothing. It
  keeps its place in the numbering and gets no pad.

`silkscreen` names the position, and `group` overrides its colour; leave
`group` out for a signal and the drawing takes it from whatever resource
the pin turns out to carry.

### receivers

A receiver soldered to the board. Declaring it does two things: it is
drawn as a block with its aerial, and the port at `portIdentifier` is
reported as carrying it rather than as "not broken out", which would be
wrong. A port with a receiver on it is allowed to have no pins at all.

### pads

Loose solder pads that belong to no connector. Most boards have none,
and a pad is easier to describe as a one-position `solder` connector, so
this is mostly a migration path for older profiles.

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

## Reading a profile

`normaliseProfile` adds `allPads`: every drawn position, a connector's
pins and the loose pads together, each carrying `connector`, `position`,
`role` (`signal` or `net`) and its resolved coordinates. Anything that
draws or searches a board should read that rather than joining
`connectors` and `pads` itself.

## Backwards compatibility

Older profiles are upgraded in memory:

- a version 1 `outline` becomes a single top view;
- version 2 `headers` become `solder` connectors that own the pads which
  named them, keeping those pads exactly where they were and taking the
  connector's pitch and rotation from the gap between the first two;
- a `usb` pinned to an edge becomes a placed rectangle.

`match` is the exception. A profile keyed to a firmware target name is
dropped to an empty match and will never be found, which is the honest
outcome since that key no longer identifies a board. Restate it in
unified terms.

## Checking a profile

- `pnpm vitest run test/boardview` checks the schema, the port joining,
  the label placement and every profile in the file.
- The editor shows the same validation live, and refuses to save while
  there are errors.
- `validateProfile` reports a pin placed twice, a pin that is not a
  port/number pin, two ports claiming one identifier, a pad outside its
  view, a pad naming a header that does not exist, and a port pin with
  no pad.
