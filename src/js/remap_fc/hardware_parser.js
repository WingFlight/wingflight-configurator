/**
 * File: src/js/remap_fc/hardware_parser.js
 * Parses the text output of the flight controller's `dump hardware`
 * CLI command into a structured map of resource-to-pin assignments.
 */

/**
 * @typedef {Object} HardwareResource
 * @property {string} pin - The pin the resource is assigned to (e.g. "A08").
 * @property {string} [timer] - The timer alternate function assigned to the pin (e.g. "AF2"), if any.
 * @property {string} [dma] - The DMA stream/channel index assigned to the pin, if any.
 */

/**
 * @typedef {Object.<string, HardwareResource>} HardwareMap
 * Maps a hardware resource key (e.g. "M1", "S3", "RX1", "SDA2",
 * "Freq2", "LED") to its assigned pin and that pin's timer/DMA
 * configuration. Only resources that are actually assigned a pin are
 * present as keys.
 */

// Maps a `resource` command's tag (as it appears in `dump hardware`
// output, e.g. `resource MOTOR 1 A08`) to the prefix used for the key
// in the parsed HardwareMap (e.g. "M1").
const RESOURCE_KEY_PREFIXES = {
  MOTOR: "M",
  SERVO: "S",
  SERIAL_RX: "RX",
  SERIAL_TX: "TX",
  I2C_SDA: "SDA",
  I2C_SCL: "SCL",
  LED: "LED",
  FREQ: "Freq",
};

const RESOURCE_LINE_RE = /^resource\s+(\w+)\s+(\d+)\s+(\S+)$/i;
const TIMER_LINE_RE = /^timer\s+(\S+)\s+(\S+)$/i;
const DMA_LINE_RE = /^dma\s+pin\s+(\S+)\s+(\S+)$/i;

// parsePinMetadata builds a pin -> {timer, dma} lookup from the
// `timer <pin> <af>` and `dma pin <pin> <index>` lines in a
// `dump hardware`, since timer/DMA assignments are reported per pin
// rather than per resource.
function parsePinMetadata(dumpText) {
  const pinMetadata = {};

  for (const rawLine of dumpText.split(/\r?\n/)) {
    const line = rawLine.trim();

    const timerMatch = line.match(TIMER_LINE_RE);
    if (timerMatch) {
      const [, pin, af] = timerMatch;
      if (af.toUpperCase() === "NONE") continue;
      const key = pin.toUpperCase();
      pinMetadata[key] = { ...pinMetadata[key], timer: af.toUpperCase() };
      continue;
    }

    const dmaMatch = line.match(DMA_LINE_RE);
    if (dmaMatch) {
      const [, pin, dma] = dmaMatch;
      if (dma.toUpperCase() === "NONE") continue;
      const key = pin.toUpperCase();
      pinMetadata[key] = { ...pinMetadata[key], dma };
    }
  }

  return pinMetadata;
}

/**
 * Parses the text output of a `dump hardware` CLI command into a
 * HardwareMap of configured resources, each enriched with its pin's
 * timer and DMA assignment (if any).
 * @param {string} dumpText
 * @returns {HardwareMap}
 */
export function parseHardwareDump(dumpText) {
  const pinMetadata = parsePinMetadata(dumpText);
  const hardware = {};

  for (const rawLine of dumpText.split(/\r?\n/)) {
    const match = rawLine.trim().match(RESOURCE_LINE_RE);
    if (!match) continue;

    const [, tag, index, rawPin] = match;
    if (rawPin.toUpperCase() === "NONE") continue;

    const prefix = RESOURCE_KEY_PREFIXES[tag.toUpperCase()];
    if (!prefix) continue;

    // LED is a single resource (the LED strip pin), so it has no
    // per-index suffix unlike the other resource types.
    const key = prefix === "LED" ? "LED" : `${prefix}${index}`;
    const pin = rawPin.toUpperCase();
    const meta = pinMetadata[pin] ?? {};

    hardware[key] = {
      pin,
      ...(meta.timer !== undefined ? { timer: meta.timer } : {}),
      ...(meta.dma !== undefined ? { dma: meta.dma } : {}),
    };
  }

  return hardware;
}
