/**
 * File: src/js/boardview/schema.js
 * The board-view schema (version 3) and its normaliser.
 *
 * A board profile says where a flight controller's connectors are and
 * what is on each of their positions, so the configurator can draw the
 * board and tell the user which way round to plug a cable in. The
 * brief it answers to is tools/board-editor/REQUIREMENTS.md.
 *
 * Version 3 is the one that describes hardware rather than a picture:
 *
 *   - `connectors`: physical plugs that own their positions. A
 *     connector has a label, a pitch and an ordered list of pins, and
 *     each position carries a board pin, a power net such as GND or
 *     5V, or nothing at all. Positions are placed by the connector, so
 *     a six-way header lands on its pitch rather than being dragged
 *     pad by pad (R1, R2, R4);
 *   - `receivers`: a receiver soldered to the board, which occupies a
 *     serial port that the user can never wire (R6);
 *   - `views[].usb`: placed freely rather than pinned to an edge (R5).
 *
 * Carried over from version 2:
 *
 *   - boards identified the unified way, by manufacturer id and board
 *     name, never by a firmware target name;
 *   - `views`: up to three drawings of the same board (top, left,
 *     right), each with its own extent and an optional background SVG
 *     exported from CAD;
 *   - `pads`: loose solder pads that belong to no connector;
 *   - `ports`: the serial ports, each naming its TX pin and its RX
 *     pin. The two need not sit on the same connector or even the same
 *     view -- a board that breaks a UART out as TX on one row and RX
 *     on another is described by giving the two pins, and the drawing
 *     works out that the port is split.
 *
 * Everything here is plain data and pure functions: the configurator
 * and the board editor (tools/board-editor) both import this module,
 * so a profile the editor accepts is one the configurator draws.
 *
 * `normaliseProfile` upgrades older profiles in memory: a version 1
 * `outline` becomes a top view, and version 2 `headers` become
 * connectors that own the pads which named them.
 */

import {
  connectorPads,
  normaliseConnector,
  serialiseConnector,
} from "./connectors.js";

/** The views a board can be drawn from, in tab order. */
export const VIEW_IDS = ["top", "left", "right"];

/**
 * Pad colour groups. `internal` is drawn but never offered for
 * reassignment; `ground` and `power` are what a connector position
 * carrying a rail rather than a signal gets.
 */
export const PAD_GROUPS = [
  "outputs",
  "uart",
  "i2c",
  "adc",
  "power",
  "ground",
  "led",
  "other",
  "internal",
];

/** The two halves of a serial port. */
export const PORT_LINES = ["tx", "rx"];

/** Default view extents, in millimetres, when a profile names none. */
const DEFAULT_EXTENT = { width: 56, height: 36 };

/** How far apart two pads of one port may sit, in mm, before it counts as split. */
export const SPLIT_DISTANCE_MM = 12;

function str(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/** Canonical pin spelling: upper case, no `P` prefix, two digits ("b7" -> "B07"). */
export function normalisePin(pin) {
  const raw = str(pin).toUpperCase().replace(/^P/, "");
  const match = raw.match(/^([A-K])(\d{1,2})$/);
  return match ? `${match[1]}${match[2].padStart(2, "0")}` : raw;
}

/**
 * An empty view spec, used by the editor when a view is added.
 * @param {string} id one of VIEW_IDS
 * @returns {Object}
 */
export function emptyView(id) {
  return {
    id,
    width: DEFAULT_EXTENT.width,
    height: id === "top" ? DEFAULT_EXTENT.height : 12,
    background: null,
    backgroundOpacity: 1,
    mountHoles: [],
    usb: null,
  };
}

/** Default USB socket footprint, in millimetres. */
const USB_SIZE = { width: 9, height: 3.6 };

/**
 * The USB socket, as a rectangle placed anywhere on the view (R5).
 *
 * Version 2 pinned it to an edge with a fraction along that edge;
 * those are converted here so an older profile keeps drawing.
 *
 * @param {?Object} raw
 * @param {{width: number, height: number}} view
 * @returns {?Object}
 */
function normaliseUsb(raw, view) {
  if (raw === null || raw === undefined) return null;

  if (raw.edge !== undefined && raw.x === undefined) {
    const along = num(raw.offset, 0.5);
    const vertical = raw.edge === "left" || raw.edge === "right";
    const size = vertical
      ? { width: USB_SIZE.height, height: USB_SIZE.width }
      : USB_SIZE;
    const x =
      raw.edge === "left"
        ? -size.width / 2
        : raw.edge === "right"
          ? view.width - size.width / 2
          : view.width * along - size.width / 2;
    const y =
      raw.edge === "top"
        ? -size.height / 2
        : raw.edge === "bottom"
          ? view.height - size.height / 2
          : view.height * along - size.height / 2;
    return { x, y, ...size, rotation: 0 };
  }

  return {
    x: num(raw.x),
    y: num(raw.y),
    width: num(raw.width, USB_SIZE.width),
    height: num(raw.height, USB_SIZE.height),
    rotation: num(raw.rotation, 0),
  };
}

function normaliseView(id, raw, fallback) {
  const source = raw ?? fallback ?? {};
  const blank = emptyView(id);
  return {
    id,
    width: num(source.width, blank.width),
    height: num(source.height, blank.height),
    background: str(source.background) || null,
    backgroundOpacity:
      source.backgroundOpacity === undefined
        ? 1
        : Math.min(1, Math.max(0, num(source.backgroundOpacity, 1))),
    mountHoles: (source.mountHoles ?? [])
      .filter((hole) => Array.isArray(hole) && hole.length >= 2)
      .map((hole) => [num(hole[0]), num(hole[1])]),
    usb: normaliseUsb(source.usb, {
      width: num(source.width, blank.width),
      height: num(source.height, blank.height),
    }),
  };
}

/**
 * A receiver soldered to the board (R6).
 *
 * It matters for two reasons: it is a thing the user can see on the
 * board and should recognise in the drawing, and it occupies a serial
 * port that they can never wire, which the port list would otherwise
 * report as simply "not broken out".
 */
function normaliseReceiver(raw, index) {
  return {
    id: str(raw?.id) || `receiver-${index + 1}`,
    label: str(raw?.label) || null,
    // The protocol it speaks, e.g. "CRSF", "FBUS", "SBUS". Free text:
    // it is shown to the user, never matched on.
    protocol: str(raw?.protocol) || null,
    // Which serial identifier it sits on, 0 for UART1. This is what
    // lets the port list say the port is in use by hardware.
    portIdentifier:
      raw?.portIdentifier === undefined || raw?.portIdentifier === null
        ? null
        : num(raw.portIdentifier),
    view: VIEW_IDS.includes(str(raw?.view)) ? str(raw.view) : "top",
    x: num(raw?.x),
    y: num(raw?.y),
    width: num(raw?.width, 10),
    height: num(raw?.height, 5),
    // How its aerial leaves the board, for the drawing: "ufl", "wire"
    // or null for a receiver with an on-board antenna.
    antenna: str(raw?.antenna) || null,
    notes: str(raw?.notes) || null,
  };
}

/**
 * Turns version 2 `headers` into connectors.
 *
 * A version 2 header was a label plus an optional box, with pads
 * pointing at it by id and placing themselves. The pads are kept
 * exactly where they are; they simply become the connector's
 * positions, in the order the file listed them. Pitch is taken from
 * the gap between the first two, so the connector's own geometry
 * agrees with where its pads already were.
 *
 * @param {Object[]} headers raw version 2 headers
 * @param {Object[]} pads normalised pads
 * @returns {{connectors: Object[], remaining: Object[]}}
 */
function connectorsFromHeaders(headers, pads) {
  const connectors = [];
  const claimed = new Set();

  (headers ?? []).forEach((header, index) => {
    const id = str(header?.id) || `header-${index + 1}`;
    const own = pads.filter((pad) => pad.header === id);
    if (!own.length) return;

    const ordered = [...own].sort((a, b) => a.order - b.order);
    for (const pad of ordered) claimed.add(pad);

    const first = ordered[0];
    const second = ordered[1] ?? null;
    const dx = second ? second.x - first.x : 0;
    const dy = second ? second.y - first.y : 0;
    const pitch = second ? Math.hypot(dx, dy) : 2.54;

    connectors.push(
      normaliseConnector(
        {
          id,
          label: str(header?.label) || null,
          kind: "solder",
          view: first.view,
          x: first.x,
          y: first.y,
          rotation: second ? (Math.atan2(dy, dx) * 180) / Math.PI : 0,
          pitch: pitch || 2.54,
          labelSide: first.labelSide,
          pins: ordered.map((pad, position) => ({
            position: position + 1,
            pin: pad.pin,
            silkscreen: pad.silkscreen,
            side: pad.side,
            reserved: pad.reserved,
          })),
        },
        index,
      ),
    );
  });

  return {
    connectors,
    remaining: pads.filter((pad) => !claimed.has(pad)),
  };
}

function normalisePad(raw, index) {
  const view = VIEW_IDS.includes(str(raw?.view)) ? str(raw.view) : "top";
  return {
    pin: normalisePin(raw?.pin),
    silkscreen: str(raw?.silkscreen) || null,
    x: num(raw?.x),
    y: num(raw?.y),
    view,
    // Which face of the PCB the pad is on. Bottom-side pads are drawn
    // dashed; this is independent of the view they appear in.
    side: str(raw?.side) === "bottom" ? "bottom" : "top",
    group: PAD_GROUPS.includes(str(raw?.group)) ? str(raw.group) : "other",
    header: str(raw?.header) || null,
    // Which way the pad's label runs. "auto" lets the drawing pick the
    // nearest edge, which is right for all but a few crowded corners.
    labelSide: ["left", "right", "above", "below"].includes(str(raw?.labelSide))
      ? str(raw.labelSide)
      : "auto",
    reserved: Boolean(raw?.reserved),
    order: index,
  };
}

function normalisePort(raw, index) {
  const tx = normalisePin(raw?.tx ?? raw?.pins?.tx);
  const rx = normalisePin(raw?.rx ?? raw?.pins?.rx);
  return {
    id: str(raw?.id) || `port-${index + 1}`,
    // The firmware's own serial port identifier (0 = UART1). This is
    // what joins a drawn port to FC.SERIAL_CONFIG, so it must follow
    // the target, not the silkscreen.
    identifier:
      raw?.identifier === undefined || raw?.identifier === null
        ? null
        : num(raw.identifier),
    label: str(raw?.label) || null,
    tx: tx || null,
    rx: rx || null,
    // Set only to override what the geometry says; normally the drawing
    // decides "split" from where the two pins land.
    split: raw?.split === undefined || raw?.split === null ? null : Boolean(raw.split),
    notes: str(raw?.notes) || null,
  };
}

/**
 * Upgrades any accepted profile to the version 2 shape. Version 1
 * profiles (an `outline`, pads without a `view`) become a single top
 * view. Always returns a new object; never mutates its argument.
 * @param {Object} raw
 * @returns {?Object} normalised profile
 */
export function normaliseProfile(raw) {
  if (!raw) return null;

  const legacyTop = raw.outline
    ? { ...raw.outline, background: raw.background ?? null }
    : null;

  const views = {};
  for (const id of VIEW_IDS) {
    const declared = raw.views?.[id];
    if (!declared && !(id === "top" && legacyTop)) continue;
    views[id] = normaliseView(id, declared, id === "top" ? legacyTop : null);
  }
  // A profile with pads but no view at all still has to draw something.
  if (!Object.keys(views).length) views.top = emptyView("top");

  const loosePads = (raw.pads ?? [])
    .map(normalisePad)
    // Drop pads pointing at a view the profile does not define, rather
    // than drawing them at the origin of a view they do not belong to.
    .filter((pad) => views[pad.view]);

  // Version 2 grouped pads under `headers`; version 3 has connectors
  // that own their positions. A file carrying the old shape is
  // migrated, and one carrying both keeps its own connectors.
  const declared = (raw.connectors ?? []).map(normaliseConnector);
  const migrated = raw.connectors
    ? { connectors: [], remaining: loosePads }
    : connectorsFromHeaders(raw.headers, loosePads);
  const connectors = [...declared, ...migrated.connectors].filter(
    (connector) => views[connector.view],
  );
  const pads = migrated.remaining;

  return {
    schema: 3,
    id: str(raw.id),
    display: str(raw.display) || str(raw.id),
    mcu: str(raw.mcu) || null,
    // Boards are identified the unified way: manufacturer id plus
    // board name, the pair the catalogue names its files after. See
    // src/js/remap_fc/board_profiles.js for why the target name is not
    // part of this.
    match: {
      manufacturerId: (raw.match?.manufacturerId ?? [])
        .map((entry) => str(entry).toUpperCase())
        .filter(Boolean),
      boardName: (raw.match?.boardName ?? [])
        .map((entry) => str(entry).toUpperCase())
        .filter(Boolean),
    },
    coordinatesSchematic: Boolean(raw.coordinatesSchematic),
    // True for a profile this build synthesised rather than read from
    // the profile file. Set by generic_layout.js, never by a file.
    synthesised: Boolean(raw.synthesised),
    credit: str(raw.credit) || null,
    views,
    connectors,
    // Loose solder pads that belong to no connector.
    pads,
    // Every pad the drawing shows: a connector's positions and the
    // loose pads together, so callers never have to join the two.
    allPads: [...connectorPads(connectors), ...pads],
    receivers: (raw.receivers ?? []).map(normaliseReceiver),
    ports: (raw.ports ?? []).map(normalisePort),
    // Kept so callers that read `outline` (BoardCanvas) keep working.
    outline: {
      width: views.top?.width ?? DEFAULT_EXTENT.width,
      height: views.top?.height ?? DEFAULT_EXTENT.height,
      mountHoles: views.top?.mountHoles ?? [],
    },
  };
}

/**
 * Serialises a normalised profile back to the on-disk shape: version 2
 * throughout, with the derived `outline` and per-pad `order` dropped
 * and empty optional fields omitted, so the file stays readable.
 * @param {Object} profile a normalised profile
 * @returns {Object}
 */
export function serialiseProfile(profile) {
  const out = {
    schema: 3,
    id: profile.id,
    match: {
      manufacturerId: profile.match?.manufacturerId ?? [],
      boardName: profile.match?.boardName ?? [],
    },
    display: profile.display,
    mcu: profile.mcu,
  };
  if (profile.coordinatesSchematic) out.coordinatesSchematic = true;
  if (profile.credit) out.credit = profile.credit;

  out.views = {};
  for (const id of VIEW_IDS) {
    const view = profile.views?.[id];
    if (!view) continue;
    const written = { width: view.width, height: view.height };
    if (view.background) written.background = view.background;
    if (view.backgroundOpacity !== 1)
      written.backgroundOpacity = view.backgroundOpacity;
    if (view.mountHoles?.length) written.mountHoles = view.mountHoles;
    if (view.usb === null) written.usb = null;
    else if (view.usb) written.usb = view.usb;
    out.views[id] = written;
  }

  if (profile.connectors?.length) {
    out.connectors = profile.connectors.map(serialiseConnector);
  }

  if (profile.receivers?.length) {
    out.receivers = profile.receivers.map((receiver) => {
      const written = {
        id: receiver.id,
        view: receiver.view,
        x: round(receiver.x),
        y: round(receiver.y),
        width: round(receiver.width),
        height: round(receiver.height),
      };
      if (receiver.label) written.label = receiver.label;
      if (receiver.protocol) written.protocol = receiver.protocol;
      if (receiver.portIdentifier !== null)
        written.portIdentifier = receiver.portIdentifier;
      if (receiver.antenna) written.antenna = receiver.antenna;
      if (receiver.notes) written.notes = receiver.notes;
      return written;
    });
  }

  out.pads = profile.pads.map((pad) => {
    const written = {
      pin: pad.pin,
      silkscreen: pad.silkscreen,
      x: round(pad.x),
      y: round(pad.y),
      view: pad.view,
      side: pad.side,
      group: pad.group,
    };
    if (pad.labelSide !== "auto") written.labelSide = pad.labelSide;
    if (pad.reserved) written.reserved = true;
    return written;
  });

  if (profile.ports?.length) {
    out.ports = profile.ports.map((port) => {
      const written = { id: port.id };
      if (port.identifier !== null) written.identifier = port.identifier;
      if (port.label) written.label = port.label;
      if (port.tx) written.tx = port.tx;
      if (port.rx) written.rx = port.rx;
      if (port.split !== null) written.split = port.split;
      if (port.notes) written.notes = port.notes;
      return written;
    });
  }

  return out;
}

/**
 * Checks a normalised profile for the mistakes that make a drawing
 * wrong rather than merely ugly. The editor shows these; the test
 * suite fails on the errors.
 * @param {Object} profile normalised profile
 * @returns {{level: 'error'|'warning', message: string, pin?: string}[]}
 */
export function validateProfile(profile) {
  const problems = [];
  if (!profile) return [{ level: "error", message: "No profile." }];
  if (!profile.id) problems.push({ level: "error", message: "Missing id." });

  // Every drawn position, whether it came from a connector or is a
  // loose solder pad. Power and ground positions are checked
  // differently: a board has many grounds, and `GND` is not a pin.
  const seen = new Map();
  for (const pad of profile.allPads ?? profile.pads) {
    const where = pad.connectorLabel ?? pad.connector ?? pad.view;

    if (pad.role === "net") {
      if (!pad.net) {
        problems.push({
          level: "error",
          message: `A position on ${where} carries neither a pin nor a net.`,
        });
      }
    } else {
      if (!/^[A-K]\d{2}$/.test(pad.pin ?? "")) {
        problems.push({
          level: "error",
          pin: pad.pin,
          message: `Pin "${pad.pin}" on ${where} is not a port/number pin such as B07.`,
        });
      } else if (seen.has(pad.pin)) {
        problems.push({
          level: "error",
          pin: pad.pin,
          message: `Pin ${pad.pin} is placed twice (${seen.get(pad.pin)} and ${where}).`,
        });
      } else {
        seen.set(pad.pin, where);
      }
    }

    const view = profile.views[pad.view];
    if (
      view &&
      (pad.x < 0 || pad.y < 0 || pad.x > view.width || pad.y > view.height)
    ) {
      problems.push({
        level: "warning",
        pin: pad.pin ?? undefined,
        message: `${pad.silkscreen ?? pad.pin ?? pad.net} on ${where} sits outside the ${pad.view} view.`,
      });
    }
  }

  for (const connector of profile.connectors ?? []) {
    if (!connector.pins.length) {
      problems.push({
        level: "warning",
        message: `${connector.label ?? connector.id} has no positions.`,
      });
    }
    if (connector.pitch <= 0) {
      problems.push({
        level: "error",
        message: `${connector.label ?? connector.id} has a pitch of ${connector.pitch} mm.`,
      });
    }
  }

  const onReceiver = new Set(
    (profile.receivers ?? [])
      .map((receiver) => receiver.portIdentifier)
      .filter((identifier) => identifier !== null),
  );

  const identifiers = new Set();
  for (const port of profile.ports) {
    for (const line of PORT_LINES) {
      const pin = port[line];
      if (pin && !seen.has(pin)) {
        problems.push({
          level: "warning",
          pin,
          message: `${port.label ?? port.id} ${line.toUpperCase()} is pin ${pin}, which is on no connector or pad.`,
        });
      }
    }
    // A port with no pins is fine when a receiver is soldered to it:
    // there is nothing to break out. Otherwise it says nothing.
    if (!port.tx && !port.rx && !onReceiver.has(port.identifier)) {
      problems.push({
        level: "error",
        message: `${port.label ?? port.id} names neither a TX nor an RX pin, and has no receiver on it.`,
      });
    }
    if (port.identifier !== null) {
      if (identifiers.has(port.identifier)) {
        problems.push({
          level: "error",
          message: `Two ports claim serial identifier ${port.identifier}.`,
        });
      }
      identifiers.add(port.identifier);
    }
  }

  return problems;
}
