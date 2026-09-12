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