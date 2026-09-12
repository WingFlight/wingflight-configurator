/**
 * File: src/js/boardview/generic_layout.js
 * The fallback drawing for a flight controller nobody has drawn yet.
 *
 * A hand-made profile (src/tabs/journey/board_profiles.json) says
 * where the pads physically are. Most boards have no such profile, and
 * waiting for one would leave the majority of users with no picture at
 * all. So this module builds one from what the board itself reports:
 * the `resource` table read by the wiring session, plus the serial
 * port configuration.
 *
 * The result is a *schematic*, and says so: one row of outputs along
 * the bottom, the serial ports down the left and right sides two lines
 * at a time, power and sensing across the top. It is not where the
 * pads are on the real PCB, but it is the right pins with the right
 * names in a stable arrangement, which is what the port assignment
 * display needs.
 *
 * Everything it emits is ordinary schema.js data, so the drawing code,
 * the port map and the board editor treat a synthesised board exactly
 * like a drawn one -- and the editor can load one as the starting
 * point for a real profile.
 */

import { sortOptionKeys } from "@/js/remap_fc/remap_table.js";

import { hardwareKeysFor, portName } from "./port_map.js";
import { normaliseProfile, normalisePin } from "./schema.js";

/**
 * The pad colour group an option key belongs to. Board-independent:
 * it reads the key's own CLI shorthand, so it works for a board with
 * no profile at all.
 * @param {string} key e.g. "S1", "RX2", "Vbat"
 * @returns {string} one of schema.js PAD_GROUPS
 */
export function groupForOptionKey(key) {
  if (/^(M|S|Freq)\d+$/.test(key)) return "outputs";
  if (/^(RX|TX|PWM)\d+$|^PPM$/.test(key)) return "uart";
  if (/^(SDA|SCL)\d+$/.test(key)) return "i2c";
  if (/^(Vbat|Curr|RSSI|Vext)$/.test(key)) return "adc";
  if (key === "LED") return "led";
  return "other";
}

// Geometry of the schematic, in the same millimetre units a real
// profile uses so the two render identically.
const EDGE_INSET = 5; // pad centre to board edge
const LINE_PITCH = 2.6; // TX to RX within one port
const PORT_GAP = 4.2; // between one port and the next
const TOP_ROW_Y = 5;
const OUTPUT_PITCH = 6;
const MIN_WIDTH = 44;
const MIN_HEIGHT = 34;

function outputKeys(hardwareMap) {
  return sortOptionKeys(Object.keys(hardwareMap)).filter((key) =>
    /^(M|S)\d+$/.test(key),
  );
}

function topRowKeys(hardwareMap) {
  return sortOptionKeys(Object.keys(hardwareMap)).filter((key) =>
    /^(Vbat|Curr|RSSI|Vext|SDA\d+|SCL\d+|LED|Beeper|Cam|PINIO\d+|PPM|PWM\d+)$/.test(
      key,
    ),
  );
}

/**
 * Every serial identifier the board has any evidence for: one the
 * firmware listed in its serial configuration, or one whose TX or RX
 * resource appears in the hardware map.
 * @param {Object} hardwareMap
 * @param {{identifier: number}[]} serialPorts
 * @returns {number[]} ascending
 */
function serialIdentifiers(hardwareMap, serialPorts) {
  const found = new Set();
  for (const port of serialPorts ?? []) {
    if (port.identifier !== 20) found.add(port.identifier);
  }
  for (const key of Object.keys(hardwareMap ?? {})) {
    const uart = key.match(/^(?:RX|TX)(\d+)$/);
    if (uart) found.add(Number(uart[1]) - 1);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Builds a schematic board view from a board's own report.
 *
 * @param {Object} args
 * @param {Object.<string, {pin: string}>} [args.hardwareMap] wiring
 *        session hardware map, keyed by option key ("S1", "TX2")
 * @param {{identifier: number}[]} [args.serialPorts] FC.SERIAL_CONFIG.ports
 * @param {?string} [args.boardName] the board's own name, for the title
 * @param {?string} [args.mcu]
 * @returns {?Object} a normalised profile, or null when there is
 *          nothing at all to draw
 */
export function synthesiseBoardView({
  hardwareMap = {},
  serialPorts = [],
  boardName = null,
  mcu = null,
} = {}) {
  const outputs = outputKeys(hardwareMap);
  const identifiers = serialIdentifiers(hardwareMap, serialPorts);

  // Pins the serial ports will claim. A pad shared between a port and
  // something else -- PPM sitting on UART2's RX pad, say -- belongs
  // with its port on a drawing whose job is showing ports, so the top
  // row gives way. One pad per pin, whoever else names it.
  const portPins = new Set();
  for (const identifier of identifiers) {
    const keys = hardwareKeysFor(identifier);
    for (const role of ["tx", "rx"]) {
      const pin = keys[role] ? hardwareMap[keys[role]]?.pin : null;
      if (pin) portPins.add(normalisePin(pin));
    }
  }

  const seenInTopRow = new Set();
  const topRow = topRowKeys(hardwareMap).filter((key) => {
    const pin = normalisePin(hardwareMap[key].pin);
    if (portPins.has(pin) || seenInTopRow.has(pin)) return false;
    seenInTopRow.add(pin);
    return true;
  });

  if (!outputs.length && !topRow.length && !identifiers.length) return null;

  // Serial ports alternate sides so neither edge runs off the board:
  // the first port goes left, the second right, and so on.
  const sides = { left: [], right: [] };
  identifiers.forEach((identifier, index) => {
    sides[index % 2 === 0 ? "left" : "right"].push(identifier);
  });

  const sideHeight = (list) =>
    list.length ? list.length * (LINE_PITCH + PORT_GAP) + TOP_ROW_Y + 4 : 0;

  const width = Math.max(
    MIN_WIDTH,
    outputs.length ? 2 * EDGE_INSET + (outputs.length - 1) * OUTPUT_PITCH + 8 : 0,
    topRow.length ? 2 * EDGE_INSET + (topRow.length - 1) * 5.5 + 8 : 0,
  );
  const height = Math.max(
    MIN_HEIGHT,
    sideHeight(sides.left),
    sideHeight(sides.right),
  );

  // A pin can carry more than one owner: a board that breaks out one
  // pad as either PPM input or UART2 RX reports both. There is still
  // only one pad, so it is drawn once and named after everything on
  // it, rather than one owner being silently dropped.
  const ownersByPin = {};
  for (const [key, entry] of Object.entries(hardwareMap)) {
    const pin = normalisePin(entry?.pin);
    if (pin) (ownersByPin[pin] ??= []).push(key);
  }
  const nameFor = (pin, fallback) =>
    (ownersByPin[pin] ?? []).join("/") || fallback;

  const connectors = [];
  const ports = [];
  const placed = new Set();
  let placedCount = 0;

  // A run of pins becomes a connector: the schematic has no idea what
  // the real plugs are, but a row of pads at one pitch is exactly what
  // a connector is, and emitting them this way means a seeded board is
  // already in the shape an author will edit (R1).
  // Label sides are left on "auto" throughout: every connector here is
  // placed against the edge it belongs to, so the geometry already says
  // where its labels read, and a stored side would go stale the moment
  // an author moved the connector in the editor.
  const addConnector = ({ id, label, kind, x, y, rotation, pitch, entries }) => {
    const pins = [];
    for (const entry of entries) {
      const canonical = normalisePin(entry.pin);
      if (!canonical || placed.has(canonical)) continue;
      placed.add(canonical);
      placedCount += 1;
      pins.push({
        position: pins.length + 1,
        pin: canonical,
        silkscreen: nameFor(canonical, entry.silkscreen),
        group: entry.group,
      });
    }
    if (!pins.length) return 0;
    connectors.push({ id, label, kind, view: "top", x, y, rotation, pitch, pins });
    return pins.length;
  };

  // Outputs along the bottom edge, in CLI order: one pinheader, which
  // is what these boards actually have.
  if (outputs.length) {
    const span = (outputs.length - 1) * OUTPUT_PITCH;
    addConnector({
      id: "outputs",
      label: "Servo / motor outputs",
      kind: "header",
      x: (width - span) / 2,
      y: height - EDGE_INSET,
      rotation: 0,
      pitch: OUTPUT_PITCH,
      entries: outputs.map((key) => ({
        pin: hardwareMap[key].pin,
        silkscreen: key,
        group: "outputs",
      })),
    });
  }

  // Power, sensing, I2C and the odds and ends across the top edge.
  if (topRow.length) {
    const pitch = Math.min(
      5.5,
      (width - 2 * EDGE_INSET) / Math.max(1, topRow.length - 1),
    );
    const span = (topRow.length - 1) * pitch;
    addConnector({
      id: "top-row",
      label: "Power and sensors",
      kind: "solder",
      x: (width - span) / 2,
      y: TOP_ROW_Y,
      rotation: 0,
      pitch,
      entries: topRow.map((key) => ({
        pin: hardwareMap[key].pin,
        silkscreen: key,
        group: groupForOptionKey(key),
      })),
    });
  }

  // Serial ports down the sides, TX above RX, one connector per port
  // so the drawing can label the pair once.
  for (const [side, list] of Object.entries(sides)) {
    const x = side === "left" ? EDGE_INSET : width - EDGE_INSET;
    let y = TOP_ROW_Y + 5;
    for (const identifier of list) {
      const name = portName(identifier);
      const connectorId = `port-${identifier}`;
      const keys = hardwareKeysFor(identifier);
      const pinFor = (key) =>
        key && hardwareMap[key]?.pin ? normalisePin(hardwareMap[key].pin) : null;
      const txPin = pinFor(keys.tx);
      const rxPin = pinFor(keys.rx);

      const entries = [
        { pin: txPin, silkscreen: `T${identifier + 1}`, group: "uart" },
        { pin: rxPin, silkscreen: `R${identifier + 1}`, group: "uart" },
      ].filter((entry) => entry.pin);

      if (entries.length) {
        const added = addConnector({
          id: connectorId,
          label: name,
          kind: "port",
          x,
          y,
          // Straight down the side of the board.
          rotation: 90,
          pitch: LINE_PITCH,
          entries,
        });
        if (added) y += (added - 1) * LINE_PITCH + PORT_GAP;
      }

      ports.push({
        id: connectorId,
        identifier,
        label: name,
        tx: txPin,
        rx: rxPin,
        // A synthesised board draws both lines of a port on one
        // connector by construction, so it must not claim a split.
        split: false,
      });
    }
  }

  // Ports the firmware listed but whose pins nobody knows are worth a
  // row in the port list, but they are not worth a drawing: an empty
  // rectangle says less than saying there is no drawing. So a board
  // that placed no pin at all gets none.
  if (!placedCount) return null;

  return normaliseProfile({
    id: boardName ? `GENERIC-${boardName}` : "GENERIC",
    display: boardName ?? "Flight controller",
    mcu,
    match: {},
    coordinatesSchematic: true,
    synthesised: true,
    views: {
      top: {
        width,
        height,
        mountHoles: [],
        // Centred on the top edge: a guess, and the first thing an
        // author moves once they have the board's outline (R5).
        usb: { edge: "top", offset: 0.5 },
      },
    },
    connectors,
    ports,
  });
}
