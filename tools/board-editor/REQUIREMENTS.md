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

### R2 — A pin is a signal, a power net, a bare name, or nothing

Each position on a connector carries exactly one of:

- **a board pin** — an MCU port pin such as `B06`, which is what joins
  it to a resource, a serial port and the timer/DMA tables;
- **a power net** — `GND`, `3V3`, `5V`, `VBAT`, `VBEC`, or any other
  rail the board silkscreens, drawn and labelled but never a resource;
- **a name only** — a pad that exists and is silkscreened but whose MCU
  pin the board's own configuration does not assign. `AIN` on the RF007
  is this, and not through omission: see R8. Drawn hollow and named,
  never a resource;
- **nothing** — a position that exists physically and carries no
  connection.

Power and ground positions are the majority of most port connectors and
must be first-class. They are what tells the user which end of the plug
is which. They must not appear in the hardware map, must never be
offered as a resource, and must not collide with the rule that an MCU
pin may appear only once on a board: a board has many grounds.

### R3 — Ports lettered where the board letters them

Boards in these families label their UART connectors `Port A`, `Port B`,
`Port C`, not `UART1`, `UART2`, `UART3`. Both names matter: the letter
is printed on the board and is what the user is looking for, the UART
number is what the firmware's serial configuration is keyed to. The
drawing and the port list must show the letter, and must still resolve
to the right serial identifier underneath. Neither may replace the
other.

Not every UART gets a letter. A board may break individual UART lines
out on its main servo header instead of on a dedicated port, and the
RF007 does: `TLM` is UART2's RX, `AUX` and `SBUS` are UART1's TX and RX.
Those pads are silkscreened by what they are *for*, so nothing on them
says which line they are, and inventing a letter for the port would be
worse than saying nothing. Such a port keeps the firmware's own name,
and the drawing says which half of it each pad is: `AUX` reads
`UART1 TX`, `SBUS` reads `UART1 RX`. On a dedicated port, where the pad
is already silkscreened `TX` or `RX`, that is not repeated.

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
- **drawn** the way it is built: a block against one edge of the board
  carrying the receiver's details, with **two aerials** leaving the
  board from that edge. The aerials are the part the user has to find
  room for when they mount the board, and they are what makes the block
  read as a receiver rather than as a chip;
- **placed by the author**, who says which edge it is mounted on and how
  far along that edge. Which edge is a fact about the board, not
  something to be guessed or dragged into by accident, so the drawing
  never moves it to another one;
- **considered** by the port list, which would otherwise report the
  serial port it sits on as "not broken out". That is misleading: the
  port is in use by hardware that is already connected, and there is
  nothing for the user to wire.

### R7 — The catalogue stays the source of pin data

Pins, and which port each belongs to, come from the board's `.config` in
the catalogue, never from hand-typed data. What the author adds is the
physical description the catalogue cannot know: where the connectors
are, what they are called, which position on them each pin occupies, and
what is on the positions that are not signals.

Re-reading the catalogue must not discard that work.

### R8 — A worked board: the FrSky Vantac RF007

The reference board, as described by someone holding one. Everything
above has to express this layout, which makes it the test of whether
the model is adequate rather than merely tidy. It is checked end to end
in `test/boardview/rf007_layout.test.js`.

**Main header**, down the **left** edge, nine positions on 2.54 mm.
Being on the left, its labels read left:

| # | Silkscreen | Is |
| --- | --- | --- |
| 1 | `S1` | servo 1 |
| 2 | `S2` | servo 2 |
| 3 | `S3` | servo 3 |
| 4 | `S4 / Tail` | servo 4 |
| 5 | `ESC` | motor 1 |
| 6 | `RPM` | frequency input |
| 7 | `TLM` | `A03`, UART2 RX |
| 8 | `AUX` | `B06`, UART1 TX |
| 9 | `SBUS` | `B07`, UART1 RX |

One header mixing four servo outputs, a motor, a frequency input and
three UART lines is exactly what a "a connector is one peripheral"
model would get wrong. It is also why R3 has to cope with a UART that
has no letter: UART1 and UART2 come out here, not on a lettered port.

**A two-position header**: `GND`, `AIN`.

**Two lettered UART ports**, each carrying its own power and ground:

- **Port A** (UART4): `TX`, `RX`, `5V`, `GND`
- **Port C** (UART3): `TX / SCL`, `RX / SDA`, `5V`, `GND`

**A built-in FBUS receiver on UART5**, which the user cannot wire.

Every pad on the main header has a pin, all of them from the board's
own catalogue config. `AIN` is the one that does not: `ADC_EXT 1` is
`NONE` there, so that pad exists, is silkscreened, and has no pin. That
is why a bare name is a first-class kind of position in R2.

The receiver is mounted on the bottom edge, so its block and both
aerials are drawn there.

Port C's `TX / SCL` and `RX / SDA` are single dual-purpose pads, and
the catalogue says so: `B10` and `B11` are UART3's pair, and the same
two pins appear again, commented out, as I2C2's `SCL` and `SDA`. The
pad is one hole that is either a serial line or an I2C line depending
on how the port is configured, which is exactly what its silkscreen
says. (I2C1, on `B08` and `B09`, is a different pair and is broken out
separately.) So the pad carries one pin and a name that mentions both
jobs, and nothing in the model needs a pad to hold two pins.

### R9 — The simulator uses a real board

Virtual mode must present a board from these families rather than a
generic stand-in, so the drawing, the port map and the wiring stage are
exercised against the shape of hardware we actually ship for.
`FRSK-VANTAC_RF007` is that board, and R8 is its layout.

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
| R5 | `views[].usb` as a placed rectangle, dragged on the canvas or typed |
| R6 | `receivers[]` with `side`, `receiverPlacement` in `schema.js`, and `port.internal` in `port_map.js` |
| R7 | `seedFromConfig` in `tools/board-editor/src/lib/editor_state.svelte.js` |
| R8 | `test/boardview/rf007_layout.test.js`, `FRSK-VANTAC_RF007` in `src/tabs/journey/board_profiles.json`; the bare-name role in `connectors.js` |
| R9 | `src/js/virtual_fc.js` and `src/js/remap_fc/fixtures/` |


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

- ~~no proper visualisation of the RX: if a FC has a built in RX, add two
  antennas to one side of the housing and add a block containing RX info to
  that side of the housing. I want to be able to set the side the RX shall be
  added to~~
  **Fixed, and written into R6.** A receiver was a rectangle at free
  coordinates with an optional single aerial, which reads as a chip rather
  than as a receiver. It is now mounted on an edge you choose, with a block
  carrying its protocol and the port it holds, and two aerials leaving the
  board from that edge. It slides along its edge when dragged and never hops
  to another one, because which edge it is on is a fact about the board rather
  than something to fall out of a gesture. Older profiles that gave an x and a
  y are converted to the nearest edge, so nothing drawn before this moves far.

- ~~UARTS aren't shown properly on the servo header. Some FC contain dedicated
  UART ports but have individual UART pins broken out on the main servo
  header, like the 007. It has UART pins assigned to the TLM and AUX pins~~
  **Fixed, and written into R3.** Two things were wrong. A port with no
  dedicated connector had no letter to show, so it needed to keep the
  firmware's own name rather than borrow one from a pad. And a pad on the main
  header is silkscreened by what it is *for* -- `TLM`, `AUX`, `SBUS` -- so
  nothing said which half of the UART it was. The drawing says it now: `AUX`
  reads `UART1 TX`, `SBUS` reads `UART1 RX`, `TLM` reads `UART2 RX`. On a
  dedicated port, where the pad already says `TX` or `RX`, it is not
  repeated.

  The RF007 pinout in R8 was wrong on this and is corrected: `AUX` is UART1's
  TX on `B06` and `SBUS` is UART1's RX on `B07`, so the main header carries
  both halves of UART1 and the RX-only half of UART2.

  The shipped drawing carried those same mistakes and is corrected with it.
  It had UART1, UART2 and UART5 drawn as lettered ports of their own, which
  the board does not have: UART1 and UART2 come out on the main header, and
  UART5 is the built-in receiver. Removing them also removed three
  duplicate-pin errors, since the same pins were on two connectors at once.
  Port A and Port C now carry their `5V` and `GND` as R8 says, the
  two-position `GND`/`AIN` header is there, and the receiver is on the bottom
  edge.

  Four faults surfaced while checking it, each of which would have bitten the
  next board too:

  - A pad carrying only a name could not be turned into a signal. Reading the
    role back from the stored value is right for a pin and a rail, which
    settle the question, and wrong for a name, which does not: choosing
    "signal" cleared the pin and the panel then read "name only" back off the
    silkscreen, snapped the dropdown back and dropped the name. The author's
    choice governs until a value makes it real, which is the same rule the
    empty-position fault above needed.
  - A label side written into a seeded profile went stale. A board seeded
    from the catalogue got explicit sides from the synthesised layout, so the
    main header kept labelling *below* long after it had been moved to the
    left edge, which is the "labels on the wrong side" fault coming back
    through the data. Nothing pins a side now: where a connector sits already
    says which way its labels read, and an explicit side stays available for
    a corner that needs one.
  - The validator reported the receiver's own port as a fault: "UART5 TX is
    pin C12, which is on no connector or pad". It is on no pad because the
    receiver is wired to it inside the board. A port a receiver occupies is
    exempt.
  - The editor still had the USB control it had before R5, a "USB on edge"
    dropdown. It said *not drawn* for a socket that was drawn, and picking an
    edge would have thrown away a freely placed position. R5's placement, by
    dragging or by typing x and y, is the only one now.
  - The wiring stage named every pad "?". It read silkscreens from the
    profile's loose `pads`, which under R1 holds only the odd position that is
    on no connector at all, so on any board drawn as connectors it found
    nothing: the outputs table read "? · B04" where the board says `S1`. Pin
    lookups read every drawn position now, and the table says `Tail · A15` and
    `ESC · A09` the way the silkscreen does. The test that was meant to catch
    this iterated the same empty list and so asserted nothing; it walks the
    connectors too, and fails if a board draws no positions at all.