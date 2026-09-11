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
 * @param {?string} [args.targetName] for the title
 * @param {?string} [args.mcu]
 * @returns {?Object} a normalised profile, or null when there is
 *          nothing at all to draw
 */
export function synthesiseBoardView({
  hardwareMap = {},
  serialPorts = [],
  targetName = null,
  mcu = null,
} = {}) {
  const outputs = outputKeys(hardwareMap);
  const topRow = topRowKeys(hardwareMap);
  const identifiers = serialIdentifiers(hardwareMap, serialPorts);

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

  const pads = [];
  const headers = [];
  const ports = [];
  const placed = new Set();

  const place = (pin, rest) => {
    const canonical = normalisePin(pin);
    if (!canonical || placed.has(canonical)) return false;
    placed.add(canonical);
    pads.push({ pin: canonical, view: "top", side: "top", ...rest });
    return true;
  };

  // Outputs along the bottom edge, in CLI order.
  if (outputs.length) {
    const span = (outputs.length - 1) * OUTPUT_PITCH;
    const startX = (width - span) / 2;
    headers.push({
      id: "outputs",
      label: "Servo / motor outputs",
      view: "top",
      x: startX - 2.5,
      y: height - EDGE_INSET - 2,
      width: span + 5,
      height: 4,
    });
    outputs.forEach((key, index) => {
      place(hardwareMap[key].pin, {
        silkscreen: key,
        x: startX + index * OUTPUT_PITCH,
        y: height - EDGE_INSET,
        group: "outputs",
        header: "outputs",
        labelSide: "below",
      });
    });
  }

  // Power, sensing, I2C and the odds and ends across the top edge.
  if (topRow.length) {
    const pitch = Math.min(
      5.5,
      (width - 2 * EDGE_INSET) / Math.max(1, topRow.length - 1),
    );
    const span = (topRow.length - 1) * pitch;
    const startX = (width - span) / 2;
    headers.push({
      id: "top-row",
      label: "Power and sensors",
      view: "top",
      x: startX - 2.5,
      y: TOP_ROW_Y - 2,
      width: span + 5,
      height: 4,
    });
    topRow.forEach((key, index) => {
      place(hardwareMap[key].pin, {
        silkscreen: key,
        x: startX + index * pitch,
        y: TOP_ROW_Y,
        group: groupForOptionKey(key),
        header: "top-row",
        labelSide: "above",
      });
    });
  }

  // Serial ports down the sides, TX above RX, one header per port so
  // the drawing can label the pair once.
  for (const [side, list] of Object.entries(sides)) {
    const x = side === "left" ? EDGE_INSET : width - EDGE_INSET;
    let y = TOP_ROW_Y + 5;
    for (const identifier of list) {
      const name = portName(identifier);
      const headerId = `port-${identifier}`;
      const keys = hardwareKeysFor(identifier);
      const pinFor = (key) =>
        key && hardwareMap[key]?.pin ? normalisePin(hardwareMap[key].pin) : null;
      const txPin = pinFor(keys.tx);
      const rxPin = pinFor(keys.rx);

      const lines = [
        ["tx", txPin, `T${identifier + 1}`],
        ["rx", rxPin, `R${identifier + 1}`],
      ].filter(([, pin]) => pin);

      if (lines.length) {
        headers.push({
          id: headerId,
          label: name,
          view: "top",
          x: x - 2.5,
          y: y - 2,
          width: 5,
          height: (lines.length - 1) * LINE_PITCH + 4,
        });
        lines.forEach(([, pin, silkscreen], index) => {
          place(pin, {
            silkscreen,
            x,
            y: y + index * LINE_PITCH,
            group: "uart",
            header: headerId,
            labelSide: side,
          });
        });
        y += (lines.length - 1) * LINE_PITCH + PORT_GAP;
      }

      ports.push({
        id: headerId,
        identifier,
        label: name,
        tx: txPin,
        rx: rxPin,
        // A synthesised board draws both lines of a port on one header
        // by construction, so it must not claim to know about splits.
        split: false,
      });
    }
  }

  // Ports the firmware listed but whose pins nobody knows are worth a
  // row in the port list, but they are not worth a drawing: an empty
  // rectangle says less than saying there is no drawing. So a board
  // that placed no pad at all gets none.
  if (!pads.length) return null;

  return normaliseProfile({
    id: targetName ? `GENERIC-${targetName}` : "GENERIC",
    display: targetName ?? "Flight controller",
    mcu,
    match: {},
    coordinatesSchematic: true,
    synthesised: true,
    views: {
      top: { width, height, mountHoles: [], usb: { edge: "top", offset: 0.5 } },
    },
    headers,
    pads,
    ports,
  });
}
