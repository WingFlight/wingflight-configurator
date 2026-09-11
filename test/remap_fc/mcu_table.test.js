import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import mcuTable from "@/js/remap_fc/MCU-all.json";
import boardProfiles from "@/tabs/journey/board_profiles.json";
import {
  getPinTimerOptions,
  isMcuSupported,
  mcuTypeFromId,
  resolveMcuKey,
} from "@/js/remap_fc/timer_dma_lookup.js";

// The table behind timer/DMA clash detection: per MCU, per pin, which timer
// channels the pin can carry and which DMA streams each of those can use.
// These tests pin the shape the allocators rely on, and reconcile it against
// the firmware's own tables when the firmware repo is checked out alongside.

const MCUS = Object.keys(mcuTable).filter((k) => k !== "_file");

// dmaChannelSpec[] in the firmware's src/main/drivers/dma_reqmap.c. The index
// into this list is the `dmaopt` value the firmware stores and the CLI's
// `dma pin <PIN> <INDEX>` writes, so the order is part of the contract.
const DMAMUX_ORDER = {
  STM32H743: [
    ...Array.from({ length: 8 }, (_, i) => `DMA1 Stream ${i}`),
    ...Array.from({ length: 8 }, (_, i) => `DMA2 Stream ${i}`),
  ],
  STM32G474: [
    ...Array.from({ length: 8 }, (_, i) => `DMA1 Channel ${i + 1}`),
    ...Array.from({ length: 8 }, (_, i) => `DMA2 Channel ${i + 1}`),
  ],
};

// MAX_TIMER_DMA_OPTIONS in dma_reqmap.h: 16 on the DMAMUX parts, 3 elsewhere.
const MAX_DMA_OPTIONS = (mcu) => (DMAMUX_ORDER[mcu] ? 16 : 3);

const FIRMWARE = path.resolve(import.meta.dirname, "../../../wingflight-firmware");
const haveFirmware = fs.existsSync(path.join(FIRMWARE, "src/main/target"));

describe("MCU table", () => {
  it("holds pin data for every MCU it lists", () => {
    expect(MCUS.length).toBeGreaterThan(0);
    for (const mcu of MCUS) {
      expect(Object.keys(mcuTable[mcu].pins ?? {}).length, mcu).toBeGreaterThan(0);
    }
  });

  it("covers every MCU our board profiles are built for", () => {
    for (const board of boardProfiles.boards) {
      const key = resolveMcuKey(mcuTable, board.mcu);
      expect(key, `${board.id} (${board.mcu})`).toBeTruthy();
      expect(isMcuSupported(mcuTable, board.mcu), board.id).toBe(true);
    }
  });

  // The ids come from mcuTypeId_e in the firmware's build_config.h and are
  // permanent: they are reported over MSP_BOARD_INFO.
  it("maps the firmware's MCU ids onto tables that exist", () => {
    expect(mcuTypeFromId(1)).toBe("STM32F40X"); // MCU_TYPE_F40X
    expect(mcuTypeFromId(2)).toBe("STM32F411");
    expect(mcuTypeFromId(4)).toBe("STM32F7X2"); // MCU_TYPE_F722
    for (const id of [9, 10, 11, 12]) {
      expect(mcuTypeFromId(id), `id ${id}`).toBe("STM32H743"); // H743 revisions
    }
    expect(mcuTypeFromId(0)).toBeNull(); // simulator
    expect(mcuTypeFromId(255)).toBeNull(); // unknown
    // Ids the firmware can report but this table has no data for must resolve
    // to something unsupported rather than to the wrong silicon.
    for (const id of [3, 13]) {
      const key = mcuTypeFromId(id);
      if (key) expect(isMcuSupported(mcuTable, key), `id ${id} -> ${key}`).toBe(false);
    }
  });

  it("gives every timer option a parseable timer, channel and DMA list", () => {
    for (const mcu of MCUS) {
      const pins = mcuTable[mcu].pins;
      for (const pin of Object.keys(pins)) {
        const options = getPinTimerOptions(mcuTable, mcu, pin);
        expect(options.length, `${mcu} ${pin}`).toBeGreaterThan(0);
        for (const option of options) {
          expect(option.base, `${mcu} ${pin} ${option.timer}`).toMatch(/^TIM\d+$/);
          expect(option.channel, `${mcu} ${pin} ${option.timer}`).toMatch(/^CH\d N?|^CH\dN?$/);
          expect(option.af, `${mcu} ${pin}`).toMatch(/^AF\d+$/);
          expect(option.dma.length, `${mcu} ${pin} ${option.timer}`).toBeLessThanOrEqual(MAX_DMA_OPTIONS(mcu));
          option.dma.forEach((choice, index) => {
            // The index is what the firmware stores as dmaopt.
            expect(choice.index, `${mcu} ${pin} ${option.timer}`).toBe(index);
            expect(choice.stream, `${mcu} ${pin}`).toMatch(/^DMA[12] (Stream|Channel) \d$/);
            expect(choice.channel, `${mcu} ${pin}`).toMatch(/^\d+$/);
          });
        }
      }
    }
  });

  // On H7/G4 any stream can serve any request, so a timer channel that has a
  // DMA request at all must offer all sixteen, in firmware order. A truncated
  // list makes the allocator believe pins conflict when they do not.
  describe.each(Object.keys(DMAMUX_ORDER))("%s DMAMUX options", (mcu) => {
    const pins = mcuTable[mcu].pins;

    it("offers all sixteen streams, in firmware order, for one request", () => {
      let withDma = 0;
      for (const pin of Object.keys(pins)) {
        for (const option of pins[pin].timers ?? []) {
          const dma = option.dma ?? [];
          if (dma.length === 0) continue;
          withDma++;
          const where = `${mcu} ${pin} ${option.timer}`;
          expect(dma.length, where).toBe(16);
          const requests = new Set(dma.map((entry) => entry.split(" Request ")[1]));
          expect(requests.size, `${where} request numbers`).toBe(1);
          dma.forEach((entry, index) => {
            expect(entry.startsWith(`${DMAMUX_ORDER[mcu][index]} Request `), `${where} option ${index}: ${entry}`).toBe(true);
          });
        }
      }
      expect(withDma, `${mcu} timer options with DMA`).toBeGreaterThan(0);
    });
  });

  it("gives every output pad in a board profile a timer", () => {
    for (const board of boardProfiles.boards) {
      const pins = mcuTable[resolveMcuKey(mcuTable, board.mcu)].pins;
      for (const pad of board.pads.filter((p) => p.group === "outputs")) {
        expect(
          (pins[pad.pin]?.timers ?? []).length,
          `${board.id} ${pad.silkscreen} (${pad.pin}) drives motors/servos and needs a timer`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

// Reconcile against the firmware's own per-target timer tables. Skipped when
// the firmware repo is not checked out next to this one.
describe.skipIf(!haveFirmware)("MCU table vs firmware targets", () => {
  const TARGET_MCU = {
    MATEKF405: "STM32F405",
    MATEKF411: "STM32F411",
    MATEKF722: "STM32F722",
    MATEKH743: "STM32H743",
    NUCLEOF722: "STM32F722",
    NUCLEOH743: "STM32H743",
  };

  it("has a timer option and a valid dmaopt for every DEF_TIM the targets use", () => {
    let checked = 0;
    const problems = [];
    for (const [target, mcu] of Object.entries(TARGET_MCU)) {
      const file = path.join(FIRMWARE, "src/main/target", target, "target.c");
      if (!fs.existsSync(file)) continue;
      const pins = mcuTable[resolveMcuKey(mcuTable, mcu)].pins;
      const source = fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//")) // commented-out entries are not built
        .join("\n");

      for (const m of source.matchAll(
        /DEF_TIM\(\s*(TIM\d+)\s*,\s*(CH\d+N?)\s*,\s*P([A-Z])(\d+)\s*,\s*([A-Z_]+)\s*,\s*(\d+)\s*,\s*(\d+)/g,
      )) {
        const [, timer, channel, port, number, , , dmaopt] = m;
        const pin = `${port}${String(number).padStart(2, "0")}`;
        const wanted = `${timer} ${channel}`;
        const option = (pins[pin]?.timers ?? []).find((t) => t.timer === wanted);
        if (!option) {
          problems.push(`${target}: ${pin} has no ${wanted} in the table`);
          continue;
        }
        const choices = (option.dma ?? []).length;
        if (choices > 0 && Number(dmaopt) >= choices) {
          problems.push(`${target}: ${pin} ${wanted} uses dmaopt ${dmaopt} but the table offers ${choices}`);
        } else if (choices === 0 && Number(dmaopt) > 0) {
          problems.push(`${target}: ${pin} ${wanted} uses dmaopt ${dmaopt} but the table offers no DMA`);
        }
        checked++;
      }
    }
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(50);
  });
});
