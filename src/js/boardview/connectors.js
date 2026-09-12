/**
 * File: src/js/boardview/connectors.js
 * Connectors, their positions, and what sits on each one.
 *
 * A flight controller's pins come out on plugs, not as a scatter of
 * independent pads. A plug has a fixed number of positions in a fixed
 * order, at a fixed pitch, and most of those positions are ground and
 * power rather than signals. Describing a board that way is what lets
 * a drawing answer "which way round does this cable go", which is the
 * one thing a user actually needs from it.
 *
 * So a connector owns its pins and their geometry is derived: place
 * the connector, and every position lands at the right spacing in the
 * right order. See tools/board-editor/REQUIREMENTS.md, R1 and R2.
 */

import { normalisePin } from "./schema.js";

/**
 * How a connector is drawn and what the editor defaults it to.
 *
 * - `port`    a peripheral plug: a handful of positions carrying a
 *             ground, a power rail and one UART. Labelled "Port A".
 * - `header`  a main pinheader on 2.54 mm, each position one signal.
 * - `solder`  a row of bare pads with no shell.
 */
export const CONNECTOR_KINDS = ["port", "header", "solder"];

/** Sensible pitch in millimetres for each kind, when the author gives none. */
export const DEFAULT_PITCH = { port: 2.0, header: 2.54, solder: 2.54 };

/**
 * Power and ground nets a position can carry instead of a signal.
 * Anything else the author types is kept verbatim, because boards
 * silkscreen their own rail names; these are only what the editor
 * offers and what the drawing knows how to colour.
 */
export const KNOWN_NETS = ["GND", "3V3", "5V", "VBAT", "VBEC", "VX"];

/** Nets that are a ground, for colouring; everything else reads as power. */
const GROUND_NETS = new Set(["GND", "AGND", "0V"]);

/**
 * What a position carries.
 *
 * `label` is the awkward but common case: a pad that physically
 * exists and is silkscreened, whose MCU pin the board's own
 * configuration does not assign. The Vantac RF007 has two, an `AUX`
 * pad on a UART the config leaves without a TX and an `AIN` pad whose
 * ADC input is `NONE`. Calling those power rails would colour and
 * describe them wrongly; leaving them out would hide pads the user can
 * see on the board in front of them.
 *
 * @param {{pin?: string, net?: string, silkscreen?: string}} pin
 * @returns {'signal'|'net'|'label'|'empty'}
 */
export function pinRole(pin) {
  if (pin?.pin) return "signal";
  if (pin?.net) return "net";
  if (pin?.silkscreen) return "label";
  return "empty";
}

/**
 * The pad group a net belongs to, for colour.
 * @param {string} net
 * @returns {'ground'|'power'}
 */
export function netGroup(net) {
  return GROUND_NETS.has(String(net ?? "").toUpperCase()) ? "ground" : "power";
}

function str(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Normalises one position on a connector. A position carries a board
 * pin, or a power net, or nothing; never more than one, and a pin
 * wins if a file somehow gives both.
 * @param {Object} raw
 * @param {number} index
 * @returns {Object}
 */
export function normaliseConnectorPin(raw, index) {
  const pin = normalisePin(raw?.pin);
  const net = str(raw?.net).toUpperCase();
  return {
    // 1-based, as printed on a connector and as a user counts them.
    position: num(raw?.position, index + 1),
    pin: pin || null,
    net: pin ? null : net || null,
    silkscreen: str(raw?.silkscreen) || null,
    // Colour group. Left unset for a signal, the drawing works it out
    // from whatever resource the pin turns out to carry, which is one
    // less thing for an author to keep in step with the catalogue.
    group: str(raw?.group) || null,
    // Only meaningful for a signal: which face of the PCB it is on.
    side: str(raw?.side) === "bottom" ? "bottom" : "top",
    reserved: Boolean(raw?.reserved),
  };
}

/**
 * Normalises a connector.
 * @param {Object} raw
 * @param {number} index
 * @returns {Object}
 */
export function normaliseConnector(raw, index) {
  const kind = CONNECTOR_KINDS.includes(str(raw?.kind)) ? str(raw.kind) : "port";
  return {
    id: str(raw?.id) || `connector-${index + 1}`,
    label: str(raw?.label) || null,
    kind,
    view: str(raw?.view) || "top",
    // Centre of position 1, in millimetres.
    x: num(raw?.x),
    y: num(raw?.y),
    // Degrees clockwise from "positions run to the right".
    rotation: num(raw?.rotation, 0),
    pitch: num(raw?.pitch, DEFAULT_PITCH[kind] ?? 2.54),
    // Which side of the connector its labels read towards. "auto"
    // lets the drawing pick the nearer edge of the board.
    labelSide: ["left", "right", "above", "below"].includes(str(raw?.labelSide))
      ? str(raw.labelSide)
      : "auto",
    notes: str(raw?.notes) || null,
    pins: (raw?.pins ?? []).map(normaliseConnectorPin),
  };
}

/**
 * Serialises a connector back to the on-disk shape, dropping anything
 * that carries no information.
 * @param {Object} connector normalised
 * @returns {Object}
 */
export function serialiseConnector(connector) {
  const round = (value) => Math.round(value * 100) / 100;
  const out = {
    id: connector.id,
    kind: connector.kind,
    view: connector.view,
    x: round(connector.x),
    y: round(connector.y),
    pitch: round(connector.pitch),
  };
  if (connector.label) out.label = connector.label;
  if (connector.rotation) out.rotation = round(connector.rotation);
  if (connector.labelSide !== "auto") out.labelSide = connector.labelSide;
  if (connector.notes) out.notes = connector.notes;
  out.pins = connector.pins.map((pin) => {
    const written = { position: pin.position };
    if (pin.pin) written.pin = pin.pin;
    if (pin.net) written.net = pin.net;
    if (pin.silkscreen) written.silkscreen = pin.silkscreen;
    if (pin.group) written.group = pin.group;
    if (pin.side === "bottom") written.side = pin.side;
    if (pin.reserved) written.reserved = true;
    return written;
  });
  return out;
}

/**
 * Where each of a connector's positions sits, in millimetres.
 *
 * Position 1 is at the connector's own (x, y); the rest follow at
 * `pitch` intervals along `rotation`, measured clockwise from "to the
 * right" in the usual screen sense where y grows downwards.
 *
 * @param {Object} connector normalised
 * @returns {{x: number, y: number}[]} one entry per position, in order
 */
export function connectorPinPositions(connector) {
  const radians = ((connector.rotation ?? 0) * Math.PI) / 180;
  const stepX = Math.cos(radians) * connector.pitch;
  const stepY = Math.sin(radians) * connector.pitch;
  return connector.pins.map((_, index) => ({
    x: connector.x + stepX * index,
    y: connector.y + stepY * index,
  }));
}

/**
 * The rectangle a connector's shell occupies, for drawing it behind
 * its pins.
 *
 * The rectangle is given unrotated, running to the right from position
 * 1, together with the point to rotate it about. That point is
 * position 1 itself, not the rectangle's centre: the positions turn
 * about where the connector is anchored, so a shell turned about its
 * own centre ends up beside its pins rather than around them.
 *
 * @param {Object} connector normalised
 * @param {number} [depth] across the run of positions, in millimetres
 * @returns {{x: number, y: number, width: number, height: number,
 *            rotation: number, originX: number, originY: number}}
 */
export function connectorBounds(connector, depth = 3.4) {
  const span = Math.max(0, connector.pins.length - 1) * connector.pitch;
  // The ends are as generous as the sides, so a pad on a fine pitch is
  // still enclosed rather than half outside the shell.
  const end = Math.max(connector.pitch, depth) / 2;
  return {
    x: connector.x - end,
    y: connector.y - depth / 2,
    width: span + end * 2,
    height: depth,
    rotation: connector.rotation ?? 0,
    originX: connector.x,
    originY: connector.y,
  };
}

/**
 * Where a connector's label belongs: clear of its run of positions,
 * on whichever side of the run faces away from the middle of the
 * board. Given no view it simply takes the run's own left-hand side.
 *
 * A run has two sides and only one of them is empty. Choosing the one
 * pointing outwards keeps the name off the board's own pads, which is
 * what a label beside a column of pins otherwise lands on.
 *
 * @param {Object} connector normalised
 * @param {number} [gap] from the run, in millimetres
 * @param {?{width: number, height: number}} [view] to face away from
 * @returns {{x: number, y: number, anchor: 'start'|'middle'|'end'}}
 */
/**
 * Which way a connector faces: the perpendicular of its run, pointing
 * away from the middle of the board.
 *
 * Everything a connector labels goes this way. Two facts decide it and
 * both belong to the connector rather than to any one of its pins: a
 * run of positions has only one free side, and which of that side's
 * two directions is outwards depends on where on the board it sits.
 *
 * @param {Object} connector normalised
 * @param {?{width: number, height: number}} [view]
 * @returns {{x: number, y: number, midX: number, midY: number}} a unit
 *   vector, plus the middle of the run it points away from
 */
export function connectorFacing(connector, view = null) {
  const radians = ((connector.rotation ?? 0) * Math.PI) / 180;
  const span = Math.max(0, connector.pins.length - 1) * connector.pitch;
  const midX = connector.x + (Math.cos(radians) * span) / 2;
  const midY = connector.y + (Math.sin(radians) * span) / 2;

  let x = Math.sin(radians);
  let y = -Math.cos(radians);
  if (view) {
    // Flip it if it points inwards.
    const towardsCentreX = view.width / 2 - midX;
    const towardsCentreY = view.height / 2 - midY;
    if (x * towardsCentreX + y * towardsCentreY > 0) {
      x = -x;
      y = -y;
    }
  }
  return { x, y, midX, midY };
}

/**
 * Which edge a connector's labels read towards.
 *
 * This is what makes a column of pins label sideways and a row label
 * above or below, rather than each pin picking the board edge it
 * happens to sit nearest. Picking per pin split one connector's labels
 * across two sides and sent pins in the middle of a board to whichever
 * edge was a millimetre closer.
 *
 * @param {Object} connector normalised
 * @param {?{width: number, height: number}} [view]
 * @returns {'left'|'right'|'above'|'below'}
 */
export function connectorLabelSide(connector, view = null) {
  const facing = connectorFacing(connector, view);
  if (Math.abs(facing.x) > Math.abs(facing.y)) {
    return facing.x < 0 ? "left" : "right";
  }
  return facing.y < 0 ? "above" : "below";
}

export function connectorLabelAnchor(connector, gap = 3, view = null) {
  const { x: awayX, y: awayY, midX, midY } = connectorFacing(connector, view);

  return {
    x: midX + awayX * gap,
    y: midY + awayY * gap,
    // Text running off the left of a connector should end at it, and
    // off the right should start at it, so it never crosses the pins.
    anchor: awayX < -0.5 ? "end" : awayX > 0.5 ? "start" : "middle",
  };
}

/**
 * Flattens every connector into the drawing's pad shape, so a pad on a
 * connector and a loose solder pad render through the same code.
 *
 * Positions carrying nothing at all are dropped: they exist on the
 * plug, and the shell shows them, but there is nothing to label or
 * click. A position with only a name is kept, because a named pad is
 * something the user can see and find.
 *
 * @param {Object[]} connectors normalised
 * @returns {Object[]} pads, each carrying `connector` and `position`
 */
export function connectorPads(connectors, views = null) {
  const pads = [];
  for (const connector of connectors ?? []) {
    const places = connectorPinPositions(connector);
    // Every pad on a connector labels the same way, decided by the
    // connector: which way its positions run, and which side of the
    // board it is on. An explicit labelSide still wins.
    const side =
      connector.labelSide === "auto"
        ? connectorLabelSide(connector, views?.[connector.view] ?? null)
        : connector.labelSide;
    connector.pins.forEach((pin, index) => {
      const role = pinRole(pin);
      if (role === "empty") return;
      pads.push({
        pin: pin.pin,
        net: pin.net,
        role,
        silkscreen: pin.silkscreen ?? pin.net ?? pin.pin,
        x: places[index].x,
        y: places[index].y,
        view: connector.view,
        side: pin.side,
        group: pin.group ?? (role === "net" ? netGroup(pin.net) : "other"),
        connector: connector.id,
        connectorLabel: connector.label,
        position: pin.position,
        labelSide: side,
        reserved: pin.reserved,
      });
    });
  }
  return pads;
}

/**
 * Builds a connector with `count` empty positions, for the editor's
 * "add connector" button.
 * @param {Object} args
 * @returns {Object} normalised connector
 */
export function emptyConnector({
  id,
  label = null,
  kind = "port",
  view = "top",
  x = 5,
  y = 5,
  count = 4,
} = {}) {
  return normaliseConnector({
    id,
    label,
    kind,
    view,
    x,
    y,
    pitch: DEFAULT_PITCH[kind],
    pins: Array.from({ length: count }, (_, index) => ({
      position: index + 1,
    })),
  });
}
