/**
 * File: src/js/boardview/port_map.js
 * Joins what the board *has* to what the board is *doing*: a board
 * view profile (schema.js) supplies where each port's pins sit, the
 * firmware's serial configuration supplies what each port is set to,
 * and this module produces one row per port that the drawing and the
 * port list both render from.
 *
 * The point of the exercise is the split UART. A port is two lines,
 * TX and RX, and a board is free to break them out wherever it likes:
 * both on one connector, one on a connector and the other on a solder
 * pad, or on opposite sides of the board. So a port is modelled as a
 * list of lines with their own pads, and "split" is *derived* from
 * where those pads landed rather than declared -- a profile only has
 * to be honest about the pins.
 */

import { UART_NAMES } from "@/tabs/configuration/util.js";

import { SPLIT_DISTANCE_MM, normalisePin } from "./schema.js";

/** Serial identifiers the firmware reserves for the USB virtual port. */
const VCP_IDENTIFIER = 20;

/**
 * The firmware's name for a serial identifier, e.g. 0 -> "UART1".
 * Falls back to the raw identifier for anything unknown.
 * @param {number} identifier
 * @returns {string}
 */
export function portName(identifier) {
  return UART_NAMES[identifier] ?? `PORT${identifier}`;
}

/** First serial identifier the firmware uses for a soft serial port. */
export const SOFTSERIAL_FIRST_IDENTIFIER = 30;

/**
 * The hardware-map keys holding a serial identifier's pins, e.g.
 * 0 -> {tx: "TX1", rx: "RX1"}. A soft serial port (30, 31) gets null
 * keys: it borrows a timer pin the resource parser files under that
 * pin's own owner, so its pins cannot be looked up by port and the
 * profile has to name them.
 * @param {number} identifier
 * @returns {{tx: ?string, rx: ?string}}
 */
export function hardwareKeysFor(identifier) {
  if (identifier >= SOFTSERIAL_FIRST_IDENTIFIER) return { tx: null, rx: null };
  return { tx: `TX${identifier + 1}`, rx: `RX${identifier + 1}` };
}

function padIndex(profile) {
  const byPin = {};
  for (const pad of profile?.pads ?? []) byPin[pad.pin] = pad;
  return byPin;
}

/**
 * Where a port's two lines sit relative to one another.
 *
 * - `single`   only one of TX and RX is broken out at all.
 * - `together` both pads are on one header, or within a few
 *              millimetres of each other on the same view.
 * - `split`    the two pads are on different headers or different
 *              views: the user has to run two wires to two places.
 *
 * @param {{pad: ?Object}[]} lines
 * @param {?boolean} override a profile's explicit `split`
 * @returns {'single'|'together'|'split'}
 */
export function layoutOfLines(lines, override = null) {
  const placed = lines.filter((line) => line.pad);
  if (placed.length < 2) return "single";
  if (override === true) return "split";
  if (override === false) return "together";

  const [a, b] = placed.map((line) => line.pad);
  if (a.view !== b.view) return "split";
  if (a.header && b.header) return a.header === b.header ? "together" : "split";
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  return distance > SPLIT_DISTANCE_MM ? "split" : "together";
}

/**
 * Builds the port rows.
 *
 * Pins come from the profile's own `ports` where it declares them,
 * and otherwise from the hardware map the wiring session read off the
 * board -- so an unrecognised board still draws its ports correctly
 * once the board has been read, and a profile only has to spell out
 * the ports whose pins it wants to pin down.
 *
 * @param {Object} args
 * @param {?Object} args.profile normalised board view profile
 * @param {{identifier: number, functionMask: number}[]} [args.serialPorts]
 *        FC.SERIAL_CONFIG.ports
 * @param {Object.<string, {pin: string}>} [args.hardwareMap]
 *        wiring session hardware map, keyed by option key ("TX1")
 * @param {(port: Object) => string} [args.describeFunction]
 *        turns a serial port record into the label shown on the
 *        drawing, e.g. "GPS". Returns "" for an unassigned port.
 * @returns {Object[]} one row per port, in identifier order
 */
export function buildPortMap({
  profile = null,
  serialPorts = [],
  hardwareMap = null,
  describeFunction = null,
} = {}) {
  const pads = padIndex(profile);
  const declared = new Map();
  for (const port of profile?.ports ?? []) {
    if (port.identifier !== null) declared.set(port.identifier, port);
  }

  // Every identifier worth a row: what the firmware reports, plus
  // anything the profile declares that the firmware did not mention.
  const identifiers = new Set();
  for (const port of serialPorts ?? []) {
    if (port.identifier !== VCP_IDENTIFIER) identifiers.add(port.identifier);
  }
  for (const identifier of declared.keys()) identifiers.add(identifier);

  const configByIdentifier = new Map(
    (serialPorts ?? []).map((port) => [port.identifier, port]),
  );

  return [...identifiers]
    .sort((a, b) => a - b)
    .map((identifier) => {
      const spec = declared.get(identifier) ?? null;
      const config = configByIdentifier.get(identifier) ?? null;
      const keys = hardwareKeysFor(identifier);

      const lines = ["tx", "rx"].map((role) => {
        const fromProfile = spec?.[role] ? normalisePin(spec[role]) : null;
        const fromBoard =
          keys[role] && hardwareMap?.[keys[role]]?.pin
            ? normalisePin(hardwareMap[keys[role]].pin)
            : null;
        const pin = fromProfile ?? fromBoard;
        const pad = pin ? (pads[pin] ?? null) : null;
        return {
          role,
          pin,
          pad,
          view: pad?.view ?? null,
          header: pad?.header ?? null,
          silkscreen: pad?.silkscreen ?? null,
          // A pin the firmware knows about but the profile never drew:
          // it exists, it just cannot be pointed at on the picture.
          undrawn: Boolean(pin) && !pad,
        };
      });

      const present = lines.filter((line) => line.pin);
      const layout = layoutOfLines(lines, spec?.split ?? null);
      const functionLabel = describeFunction?.(config) ?? "";

      return {
        id: spec?.id ?? portName(identifier),
        identifier,
        name: portName(identifier),
        label: spec?.label ?? portName(identifier),
        notes: spec?.notes ?? null,
        functionMask: config?.functionMask ?? 0,
        functionLabel,
        assigned: Boolean(config && config.functionMask),
        known: Boolean(config),
        lines,
        // Lines that have a pin at all, TX first.
        wiredLines: present,
        layout,
        split: layout === "split",
        // Drawable when at least one line found a pad.
        drawn: lines.some((line) => line.pad),
        views: [...new Set(lines.map((line) => line.view).filter(Boolean))],
      };
    });
}

/**
 * pin -> port row, for the drawing: a pad asks "which port am I part
 * of, and which half of it am I?".
 * @param {Object[]} portMap
 * @returns {Object.<string, {port: Object, line: Object}>}
 */
export function portsByPin(portMap) {
  const byPin = {};
  for (const port of portMap ?? []) {
    for (const line of port.lines) {
      if (line.pin) byPin[line.pin] = { port, line };
    }
  }
  return byPin;
}

/**
 * The ports that have something to show in a given view, so the view
 * switcher can say "3 ports here" and hide a view with nothing on it.
 * @param {Object[]} portMap
 * @param {string} viewId
 * @returns {Object[]}
 */
export function portsInView(portMap, viewId) {
  return (portMap ?? []).filter((port) => port.views.includes(viewId));
}
