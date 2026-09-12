# Board editor requirements

What the editor has to be able to describe, and why. This is the brief;
`docs/board-views.md` is the schema that implements it and this file is
what that schema answers to.

The target boards driving this are the FlyDragon (`FDRC`), Radiomaster
(`RDMS`) and FrSky (`FRSK`) families in
[WingFlight/wingflight-targets](https://github.com/WingFlight/wingflight-targets),
with `FRSK-VANTAC_RF007` as the reference board.

## The problem

A flight controller's pins are not a flat list of solder pads. They come
out on plugs. A plug has a fixed number of positions in a fixed order,
and most of those positions are not signals at all: on a four-way port,
two are usually ground and power. A drawing that only knows about signal
pads cannot tell the user which way round to plug in a cable, which is
the single thing they most need to know.

The first version of this editor modelled a connector as a label with an
optional box, and every pad as an independently placed point. That is
enough to draw a picture and wrong as a description of hardware.

## Requirements

### R1 — Connectors own their pins

A connector is a physical plug. It has:

- a **label** the user will read, e.g. `Port A`, `Port B`, `Port C`;
- a **kind**, because a four-way peripheral port and a twenty-way main
  pinheader are drawn and authored differently;
- a **position and orientation** on one view;
- a **pitch**, the centre-to-centre spacing of its positions;
- an ordered list of **pins**, one per physical position.

Pin positions are *derived* from the connector's placement, pitch and
orientation. Placing a connector places all of its pins at once, at the
right spacing, in the right order. Dragging six pads individually onto a
2.54 mm header and hoping they line up is not acceptable.

A connector's pin count is set by the author and varies from one to
several dozen.

### R2 — A pin is a signal, a power net, or nothing

Each position on a connector carries exactly one of:

- **a board pin** — an MCU port pin such as `B06`, which is what joins
  it to a resource, a serial port and the timer/DMA tables;
- **a power net** — `GND`, `3V3`, `5V`, `VBAT`, `VBEC`, or any other
  rail the board silkscreens, drawn and labelled but never a resource;
- **nothing** — a position that exists physically and carries no
  connection.

Power and ground positions are the majority of most port connectors and
must be first-class. They are what tells the user which end of the plug
is which. They must not appear in the hardware map, must never be
offered as a resource, and must not collide with the rule that an MCU
pin may appear only once on a board: a board has many grounds.

### R3 — Ports lettered, not numbered

Boards in these families label their UART connectors `Port A`, `Port B`,
`Port C`, not `UART1`, `UART2`, `UART3`. Both names matter: the letter
is printed on the board and is what the user is looking for, the UART
number is what the firmware's serial configuration is keyed to. The
drawing and the port list must show the letter, and must still resolve
to the right serial identifier underneath. Neither may replace the
other.

### R4 — Main pinheaders

Besides the peripheral ports, these boards carry one or two 2.54 mm
pinheaders where each position is a single signal — servo outputs,
spare I/O — rather than a bundled peripheral. The pin count varies by
board. This is the same connector model with a different kind, a 2.54 mm
pitch, and one signal per position.

### R5 — The USB connector is placed freely

It is not always centred on the top edge. It must be placeable anywhere
on a view, at any size and rotation, or omitted. Labels near it must
still clear it.

### R6 — Built-in receivers

Several boards in these families have a receiver soldered on. It has to
be:

- **listed**, as part of the board, with its protocol and which serial
  identifier it occupies;
- **drawn**, as a block on the board with its antenna, so the user can
  see it is there;
- **considered** by the port list, which today would report the serial
  port it sits on as "not broken out". That is misleading: the port is
  in use by hardware that is already connected, and there is nothing for
  the user to wire.

### R7 — The catalogue stays the source of pin data

Pins, and which port each belongs to, come from the board's `.config` in
the catalogue, never from hand-typed data. What the author adds is the
physical description the catalogue cannot know: where the connectors
are, what they are called, which position on them each pin occupies, and
what is on the positions that are not signals.

Re-reading the catalogue must not discard that work.

### R8 — The simulator uses a real board

Virtual mode must present a board from these families rather than a
generic stand-in, so the drawing, the port map and the wiring stage are
exercised against the shape of hardware we actually ship for.
`FRSK-VANTAC_RF007` is that board.

## Non-requirements

- **Routing or netlists.** This describes what a user can see and plug
  into, not the PCB.
- **Component placement.** Only the parts a user interacts with are
  drawn: connectors, the USB socket, mount holes, a built-in receiver.
- **Per-pin electrical data.** Voltage tolerance, current limits and
  the like belong in the board's manual.
- **Authoring without the catalogue.** A board not in the catalogue is
  out of scope; it would have no pins to place.

## How these are met

| | Where |
| --- | --- |
| R1, R2, R4 | `connectors[]` in the schema, `src/js/boardview/schema.js` |
| R3 | connector `label` plus `ports[].identifier` |
| R5 | `views[].usb` as a placed rectangle |
| R6 | `receivers[]`, and `port.internal` in `src/js/boardview/port_map.js` |
| R7 | `seedFromConfig` in `tools/board-editor/src/lib/editor_state.svelte.js` |
| R8 | `src/js/virtual_fc.js` and `src/js/remap_fc/fixtures/` |


# Known Issues

- ~~board editor target dropdown does not work~~
  **Fixed.** It was a `<select size="8">` list box, but the app styles every
  `select` to a fixed 24 px single-line control, so the `size` was ignored and
  the list was crushed to a sliver with its second row clipped mid-glyph. It is
  a real dropdown now, grouped by manufacturer. Two other faults went with it:
  the options were capped at 400, silently hiding 42 boards, and the catalogue
  holds two configs that are misnamed upstream (`FLAO-FLAOF405X8` has no
  extension, `TMTR-TMOTORVELOXF7SE.txt` is a `.txt`), which the `.config`-only
  file-name rule dropped. All 442 boards are offered and fetch correctly.

- ~~I cant edit the values for the signal pads if entirely new ones are created~~
  **Fixed.** A position's role is read back from what it carries, which is right
  for the file and wrong for the form: choosing "signal" on a fresh position
  wrote nothing, so the position was still empty, the dropdown snapped straight
  back to "nothing" and no pin box ever appeared. The panel now remembers what
  the author asked for until a value makes it real. Fixing it exposed a third
  fault: a pin placed twice, which an author is halfway through doing while
  typing, crashed the ports panel, because its pin chooser was keyed by pin and
  a keyed list cannot hold duplicates. It lists each pin once now, and the
  validation line already names a clash precisely.

- ~~When changing the orientation of the ports, the labels and the pins are
  misplaced~~
  **Fixed.** The pins were right; the shell drawn behind them was not. It was
  rotated about its own centre, but the positions turn about where the
  connector is anchored, so at anything other than 0 degrees the shell ended up
  beside its pins instead of around them. It turns about position 1 now, and
  the shell's ends are as generous as its sides so a pad on a fine pitch is not
  left half outside. The connector's name followed the unrotated box and so
  stayed behind when the run turned; it follows the run now, and sits on
  whichever side faces away from the middle of the board, which also stops it
  landing on the board's own pads.

- ~~the pins on a port canot reordered~~
  **Fixed.** A position is physical, which hole in the plug a wire goes into, so
  transcribing a row in the wrong order should not mean retyping every value.
  Each row has up and down buttons that carry its value with it, and a
  *Reverse* button flips the whole connector, because plugs are numbered from
  either end depending on who drew the board. The numbering stays 1..n.

- ~~the label for the controller may need a line break~~
  **Fixed.** SVG text does not wrap, so a name longer than its board simply ran
  off both edges. It is broken onto as many lines as it needs to fit the board,
  on spaces, and the block stays centred on its placement so adding a line
  grows it both ways rather than pushing it off the bottom. A single word wider
  than the board is left long rather than chopped, since a chopped board name
  is harder to read than a wide one.

- ~~the controller label position cannot be changed~~
  **Fixed.** It was hard-coded to the middle of the view. It is now placed like
  everything else: drag it on the canvas or type its position, with its
  alignment and whether it is drawn at all. "Only without a background" stays
  the default, which is what every profile did before, since a CAD export
  usually has the board's name printed on it already.

  Note the default placement is the middle of the board, where there are often
  pads. The name is a watermark drawn behind them, so it reads as one; move it
  if you would rather it were clear of them.

- ~~labels of the ports aren't moved to the side of the controller where the port
  actually is~~
- ~~labels of the ports do not respect the orientation of the port properly~~
  **Both fixed, and they were one fault.** Each pad chose its own side, by
  whichever board edge it happened to sit nearest. That is wrong twice over: it
  split one connector's labels across two sides, and it ignored which way the
  connector runs, so a column of pins could try to label upwards.

  The side is decided by the connector now, from the two facts that actually
  settle it. A run of positions has only one free side, its perpendicular, so a
  column labels sideways and a row labels above or below. Which of that side's
  two directions is outwards depends on where on the board the connector sits,
  so a column on the left edge reads left and the same column on the right
  edge reads right. Every pad on the connector gets that one side. An explicit
  `labelSide` still overrides it, for a corner that needs a hand.

  The worked example changed with it: its peripheral ports ran horizontally
  across the middle of the board, which no real board does, and that put
  fourteen labels along one 60 mm edge. They run down the edges now, as they
  would be mounted.

- ~~there is no auto save of the config upon changes~~
  **Fixed.** Edits are written on their own, and the toolbar says where the
  file stands: *saving shortly*, *saved*, or *held back* with the number of
  errors.

  Two conditions, because this is a repository file and not a scratch
  document. A write happens only once editing has paused, so a drag rearms the
  timer instead of writing per frame and `git diff` stays reviewable rather
  than recording every keystroke. And only once the profile validates, so a
  half-typed pin or a pin placed twice never reaches a file the app ships. When
  it is held back the problems list already says why.

  *Save now* still writes immediately, and the auto-save toggle turns it off
  for anyone who would rather it did not. The close-the-tab warning stays,
  because a profile held back for errors is exactly when a closed tab would
  still cost work.