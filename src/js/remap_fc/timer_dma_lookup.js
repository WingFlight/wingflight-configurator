/**
 * File: src/js/remap_fc/timer_dma_lookup.js
 * Looks up the timer/DMA options a given MCU reports for a given pin
 * (from MCU-all.json), and normalises each option into the shape the
 * timer/DMA allocators need to reason about: a timer's base (e.g.
 * "TIM3" from "TIM3 CH1"), its channel, whether it's a negative
 * channel, and its DMA choices split into stream/channel pairs.
 *
 * Ported from Rotorflight Configurator PR #433. Wingflight changes:
 * MCU_ALIASES covers the exact-silicon names Wingflight's board
 * profiles and targets use (STM32F405/F722), mcuTypeFromId maps the
 * MSP_BOARD_INFO mcuTypeId (the only reliable MCU source on a
 * Wingflight board -- see hardware_parser.js's parseMcuType), and
 * parseReservedTimers accepts the firmware's "CH1N:" negative-channel
 * spelling.
 */

/**
 * @typedef {Object} DmaChoice
 * @property {number} index - This DMA choice's position in the pin's
 *   own DMA list for this timer/AF -- the CLI's `dma pin <PIN>
 *   <INDEX>` command refers to a pin by this ordinal, not by stream
 *   name, so it must be preserved even after the list is filtered.
 * @property {string} stream - e.g. "DMA1 Stream 5".
 * @property {string} channel - e.g. "3" (an F4/F7 channel or an H7
 *   request number).
 */

/**
 * @typedef {Object} TimerOption
 * @property {string} timer - Full timer+channel, e.g. "TIM3 CH1N".
 * @property {string} af - The alternate-function name, e.g. "AF2".
 * @property {?string} base - The timer base, e.g. "TIM3", or null if
 *   `timer` couldn't be parsed.
 * @property {?string} channel - The channel suffix, e.g. "CH1N".
 * @property {boolean} negative - Whether this is a negative ("N")
 *   channel.
 * @property {DmaChoice[]} dma
 */

function timerBase(timer) {
  if (!timer) return null;
  return timer.split(" ")[0] || null;
}

function timerChannel(timer) {
  if (!timer) return null;
  return timer.split(" ")[1] || null;
}

function isNegativeTimer(timer) {
  return /N$/.test(timer ?? "");
}

// Splits a raw DMA string like "DMA1 Stream 5 Channel 3" (F4/F7) or
// "DMA1 Stream 0 Request 23" (H7) into its stream ("DMA1 Stream 5")
// and channel/request ("3"), keeping the option's index in the source
// array so it can still be referred back to by `dma pin <PIN> <INDEX>`
// after any later filtering.
function parseDmaChoices(rawDma) {
  return (rawDma ?? []).map((entry, index) => {
    const parts = entry.split(" ");
    return {
      index,
      stream: `${parts[0]} ${parts[1]} ${parts[2]}`,
      channel: parts[4],
    };
  });
}

// Exact-silicon names (as a board profile's `mcu` field or a firmware
// banner may report them) mapped to the family key MCU-all.json
// actually holds pin data under. ST groups F405/F407/F415/F417 as one
// family with an identical peripheral/AF layout, likewise F722/F723/
// F732/F733 -- Betaflight's resource tables (which MCU-all.json was
// generated from) are built once per family.
const MCU_ALIASES = {
  STM32F405: "STM32F40X",
  STM32F407: "STM32F40X",
  STM32F722: "STM32F7X2",
  STM32F723: "STM32F7X2",
  STM32F732: "STM32F7X2",
  STM32F733: "STM32F7X2",
  STM32F7X5: "STM32F745",
  STM32H750: "STM32H743",
  STM32H723: "STM32H743",
  STM32H725: "STM32H743",
  STM32H730: "STM32H743",
};

// mcuTypeId_e in the firmware's src/main/build/build_config.h -- "IDs
// are permanent as they have a dependency to configurator through MSP
// reporting". Reported via MSP_BOARD_INFO into FC.CONFIG.mcuTypeId.
const MCU_TYPE_IDS = {
  1: "STM32F40X",
  2: "STM32F411",
  3: "STM32F446",
  4: "STM32F7X2",
  5: "STM32F745",
  6: "STM32F745",
  7: "STM32F745",
  8: "STM32H743",
  9: "STM32H743",
  10: "STM32H743",
  11: "STM32H743",
  12: "STM32H743",
  13: "STM32H7A3",
  14: "STM32H743",
  15: "STM32G474",
  16: "STM32H743",
};

/**
 * Maps an MSP_BOARD_INFO mcuTypeId to an MCU-all.json family key, or
 * null for the simulator/unknown (0, 255) or an id this table has no
 * data for.
 * @param {?number} mcuTypeId
 * @returns {?string}
 */
export function mcuTypeFromId(mcuTypeId) {
  return MCU_TYPE_IDS[mcuTypeId] ?? null;
}

/**
 * Resolves a raw reported MCU string to whichever MCU-all.json key
 * actually has data for it -- the exact string first, falling back to
 * MCU_ALIASES for a known family alias.
 * @param {Object} mcuAllData
 * @param {?string} mcuType
 * @returns {?string}
 */
export function resolveMcuKey(mcuAllData, mcuType) {
  if (!mcuType) return null;
  const upper = mcuType.toUpperCase();
  if (mcuAllData?.[upper]) return upper;
  return MCU_ALIASES[upper] ?? upper;
}

/**
 * Whether MCU-all.json has real timer/DMA data for the given reported
 * MCU string, once resolved through MCU_ALIASES. False for a genuinely
 * unrecognised MCU -- getPinTimerOptions would otherwise return []
 * for every pin silently, with nothing telling the user why timer/DMA
 * can never be resolved.
 * @param {Object} mcuAllData
 * @param {?string} mcuType
 * @returns {boolean}
 */
export function isMcuSupported(mcuAllData, mcuType) {
  if (!mcuType) return false;
  return Boolean(mcuAllData?.[resolveMcuKey(mcuAllData, mcuType)]);
}

/**
 * Returns every timer option MCU-all.json reports for the given pin
 * on the given MCU, normalised for the allocators. Empty if the MCU
 * or pin isn't known, or the pin has no timer options at all.
 * @param {Object} mcuAllData - The parsed contents of MCU-all.json.
 * @param {?string} mcuType - e.g. "STM32F7X2" -- see resolveMcuKey.
 * @param {string} pin - e.g. "A02".
 * @returns {TimerOption[]}
 */
export function getPinTimerOptions(mcuAllData, mcuType, pin) {
  const resolvedMcu = resolveMcuKey(mcuAllData, mcuType);
  const entries = mcuAllData?.[resolvedMcu]?.pins?.[pin]?.timers ?? [];

  return entries.map((entry) => ({
    timer: entry.timer,
    af: entry.af ?? null,
    base: timerBase(entry.timer),
    channel: timerChannel(entry.timer),
    negative: isNegativeTimer(entry.timer),
    dma: parseDmaChoices(entry.dma),
  }));
}

// Line format of the CLI's `dma show` (showDma() in cli.c, using
// DMA_OUTPUT_STRING "DMA%d Stream %d:" on F4/F7/H7), e.g.:
//   DMA1 Stream 3: SPI_MISO 2
//   DMA2 Stream 0: ADC 1
//   DMA1 Stream 6: FREE
const DMA_SHOW_LINE_RE = /^(DMA\d+ Stream \d+):\s*(\S.*)$/;

// Claim owners this tool itself manages -- a stream/timer reported
// against one of these just reflects a resource/timer/DMA choice this
// tool already made (or is about to re-derive), not a foreign claim to
// avoid.
const OWN_CLAIM_PREFIXES = ["MOTOR", "SERVO", "FREQ", "LED_STRIP"];

/**
 * Parses the CLI's `dma show` output into the set of DMA streams
 * already claimed by something this tool has no control over -- SPI
 * buses (the gyro/flash), the battery/current ADC, UART DMA, and any
 * other fixed peripheral wiring. These must never be offered to a
 * motor/servo/freq/LED feature.
 * @param {string} dmaShowText
 * @returns {Set<string>} stream names, e.g. "DMA1 Stream 3".
 */
export function parseReservedDmaStreams(dmaShowText) {
  const reserved = new Set();

  for (const rawLine of (dmaShowText ?? "").split(/\r?\n/)) {
    const match = rawLine.trim().match(DMA_SHOW_LINE_RE);
    if (!match) continue;

    const [, stream, claim] = match;
    const claimUpper = claim.toUpperCase();
    if (claimUpper === "FREE") continue;
    if (OWN_CLAIM_PREFIXES.some((prefix) => claimUpper.startsWith(prefix)))
      continue;

    reserved.add(stream);
  }

  return reserved;
}

// Line formats of the CLI's `timer show` (showTimers() in cli.c):
//   TIM1:
//       CH2 : MOTOR 1
//       CH3N: LED_STRIP
//   TIM4: FREE
// A base with any claim at all is printed as a bare "TIMx:" header
// followed by one indented "CHn : CLAIM" (or "CHnN: CLAIM" for a
// negative channel -- the firmware prints "%s" as "N" or " ") line
// per claimed channel; a base with nothing claimed on it is printed
// as a single "TIMx: FREE" line.
const TIMER_BASE_LINE_RE = /^(TIM\d+):\s*(FREE)?$/;
const TIMER_CHANNEL_LINE_RE = /^CH(\d+)(N?)\s*:\s*(\S.*)$/;

/**
 * Parses the CLI's `timer show` output into the set of full
 * timer+channel combinations (e.g. "TIM11 CH1") already claimed by
 * something outside this tool's control -- a hardware PPM input, the
 * beeper's PWM timer, and the like. A negative channel is recorded
 * both as "TIMx CHnN" (the spelling MCU-all.json uses for that option)
 * and as its positive twin "TIMx CHn", since both share one capture/
 * compare unit.
 * @param {string} timerShowText
 * @returns {Set<string>} full timer+channel strings, e.g. "TIM11 CH1".
 */
export function parseReservedTimers(timerShowText) {
  const reserved = new Set();
  let currentBase = null;

  for (const rawLine of (timerShowText ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();

    const baseMatch = line.match(TIMER_BASE_LINE_RE);
    if (baseMatch) {
      currentBase = baseMatch[2] ? null : baseMatch[1];
      continue;
    }

    if (!currentBase) continue;
    const channelMatch = line.match(TIMER_CHANNEL_LINE_RE);
    if (!channelMatch) continue;

    const [, channelNum, negative, claim] = channelMatch;
    const claimUpper = claim.toUpperCase();
    if (OWN_CLAIM_PREFIXES.some((prefix) => claimUpper.startsWith(prefix)))
      continue;

    reserved.add(`${currentBase} CH${channelNum}`);
    if (negative) reserved.add(`${currentBase} CH${channelNum}N`);
  }

  return reserved;
}
