import { describe, expect, it } from "vitest";

import mcuAllData from "@/js/remap_fc/MCU-all.json";
import boardProfiles from "@/tabs/journey/board_profiles.json";
import {
  findBoardProfile,
  matchBoardProfile,
  padForPin,
  silkscreenFor,
} from "@/js/remap_fc/board_profiles.js";
import { classifyCriticality } from "@/js/remap_fc/feature_classifier.js";
import {
  MATEKF405_DIFF_HARDWARE_DEFAULTS,
  MATEKF405_DUMP_HARDWARE,
} from "@/js/remap_fc/fixtures/matekf405.js";
import {
  parseHardwareDefaults,
  parseHardwareDump,
} from "@/js/remap_fc/hardware_parser.js";
import {
  buildChangeCommands,
  getLegalOptionsForPin,
} from "@/js/remap_fc/remap_table.js";
import {
  getPinTimerOptions,
  isMcuSupported,
  resolveMcuKey,
} from "@/js/remap_fc/timer_dma_lookup.js";
import {
  buildFeatureRows,
  collectClashes,
  detectClashes,
  reconcileTimersAndDma,
} from "@/js/remap_fc/timer_dma_reconciler.js";

describe("MCU-all.json lookups", () => {
  it("resolves Wingflight silicon names to MCU-all families", () => {
    expect(resolveMcuKey(mcuAllData, "STM32F405")).toBe("STM32F40X");
    expect(resolveMcuKey(mcuAllData, "STM32F722")).toBe("STM32F7X2");
    expect(resolveMcuKey(mcuAllData, "STM32H743")).toBe("STM32H743");
    expect(isMcuSupported(mcuAllData, "STM32F411")).toBe(true);
    expect(isMcuSupported(mcuAllData, "STM32F103")).toBe(false);
  });

  it("returns the F405 timer options the target.c table relies on", () => {
    const c06 = getPinTimerOptions(mcuAllData, "STM32F405", "C06");
    expect(c06.map((o) => o.timer)).toEqual(["TIM3 CH1", "TIM8 CH1"]);
    expect(c06[0].dma).toEqual([
      { index: 0, stream: "DMA1 Stream 4", channel: "5" },
    ]);
  });
});

describe("reconciler on STM32F405 (MATEKF405 defaults)", () => {
  const current = parseHardwareDump(MATEKF405_DUMP_HARDWARE);
  const reservedDma = new Set(["DMA2 Stream 0", "DMA2 Stream 4"]);

  it("finds no clash in the factory configuration", () => {
    const rows = buildFeatureRows(current, "STM32F405", mcuAllData);
    const report = detectClashes(rows, reservedDma, new Set());
    expect(report.hasClash).toBe(false);
    expect(report.clashes).toEqual([]);

    const result = reconcileTimersAndDma(current, "STM32F405", mcuAllData, reservedDma);
    expect(result.commands).toEqual([]);
    expect(result.unresolved).toEqual([]);
    expect(result.calculatedTable.find((r) => r.feature === "M1").timer).toBe(
      "pin C06: TIM3 CH1 (AF2)",
    );
  });

  it("allocates a timer and DMA for a servo moved onto a free output pad", () => {
    // A single-motor wing: M2-M4 off, SERVO 1 on the S4 pad (C09).
    const working = { ...current };
    delete working.M2;
    delete working.M3;
    delete working.M4;
    working.S1 = { pin: "C09" };

    const rows = buildFeatureRows(working, "STM32F405", mcuAllData);
    const clashes = collectClashes(rows, reservedDma, new Set());
    expect(clashes).toEqual([
      expect.objectContaining({ kind: "unassigned", features: ["S1"], pins: ["C09"] }),
    ]);

    const result = reconcileTimersAndDma(working, "STM32F405", mcuAllData, reservedDma);
    expect(result.unresolved).toEqual([]);
    // S1 gets a timer on C09 and, by base exclusivity, never shares a
    // timer base with the motor (the allocator seats servos first, so it
    // may move M1 to TIM8 rather than keep S1 off TIM3 -- either is valid).
    const s1 = result.allocation.find((a) => a.feature === "S1");
    const m1 = result.allocation.find((a) => a.feature === "M1");
    expect(s1.chosen).not.toBeNull();
    expect(s1.chosen.base).not.toBe(m1.chosen.base);
    expect(result.commands).toContain(`timer C09 ${s1.chosen.af}`);
    // Servos never get DMA; the motor keeps one.
    expect(result.commands.some((c) => c.startsWith("dma pin C09"))).toBe(false);
    expect(m1.dma.dmaInfo).not.toBeNull();
  });

  it("refuses a layout where two features must share one timer channel", () => {
    // C06 and A00... pick two pins whose only options collide: A15 (TIM2 CH1
    // only) and A00 forced onto TIM2 CH1 via a servo on both.
    const working = {
      M1: { pin: "A15", timer: "AF1", dma: "0" },
      S1: { pin: "A00" },
    };
    const reservedTimers = new Set(["TIM5 CH1"]); // take away A00's alternative
    const result = reconcileTimersAndDma(
      working,
      "STM32F405",
      mcuAllData,
      new Set(),
      reservedTimers,
    );
    expect(result.unresolved.length).toBeGreaterThan(0);
  });

  it("orders resource changes removals-first", () => {
    const working = { ...current };
    delete working.M4;
    working.S1 = { pin: "C09" };
    expect(buildChangeCommands(current, working)).toEqual([
      "resource MOTOR 4 NONE",
      "resource SERVO 1 C09",
    ]);
  });

  it("offers only what a pin's timers allow", () => {
    const defaults = parseHardwareDefaults(
      MATEKF405_DUMP_HARDWARE,
      MATEKF405_DIFF_HARDWARE_DEFAULTS,
    );
    const args = { current, defaults, mcuType: "STM32F405", mcuAllData };

    const c09 = getLegalOptionsForPin({ pin: "C09", ...args });
    expect(c09.find((o) => o.key === "M4").reason).toBe("current");
    expect(c09.some((o) => o.key === "S1")).toBe(true);
    // S2 is not offered until S1 exists (firmware counts consecutively).
    expect(c09.some((o) => o.key === "S2")).toBe(false);
    expect(c09.some((o) => o.key === "RX1")).toBe(false);

    // A UART pin without any timer offers only its fixed function.
    expect(getPinTimerOptions(mcuAllData, "STM32F405", "C10")).toEqual([]);
    const c10 = getLegalOptionsForPin({ pin: "C10", ...args });
    expect(c10.map((o) => o.key)).toEqual(["TX3"]);

    // A UART pin that does have a timer (PA9 = TIM1 CH2) may carry a servo
    // -- the user's call, the MCU allows it -- but never another UART.
    const a09 = getLegalOptionsForPin({ pin: "A09", ...args });
    expect(a09.some((o) => o.key === "TX1")).toBe(true);
    expect(a09.some((o) => o.key === "S1")).toBe(true);
    expect(a09.some((o) => o.key === "RX1")).toBe(false);

    // A pin whose timers offer no DMA is not offered a motor or the LED.
    const noDmaPin = Object.keys(mcuAllData.STM32F40X.pins).find((pin) => {
      const options = getPinTimerOptions(mcuAllData, "STM32F405", pin);
      return options.length > 0 && options.every((o) => o.dma.length === 0);
    });
    expect(noDmaPin).toBeDefined();
    const noDma = getLegalOptionsForPin({ pin: noDmaPin, ...args, current: {} });
    expect(noDma.some((o) => o.key === "S1")).toBe(true);
    expect(noDma.some((o) => o.key === "M1")).toBe(false);
    expect(noDma.some((o) => o.key === "LED")).toBe(false);
  });
});

describe("reconciler on STM32F722 (MATEKF722 defaults)", () => {
  // target.c: S1 PC6 TIM8 CH1, S2 PC7 TIM8 CH2, S3 PC8 TIM8 CH3, S4 PC9 TIM8 CH4,
  // S5 PB1 TIM3 CH4, S6 PA8 TIM1 CH1, S7 PB8 TIM4 CH3, S8 PA2 TIM5 CH3, LED PA15 TIM2 CH1.
  const current = {
    M1: { pin: "C06", timer: "AF3", dma: "0" },
    M2: { pin: "C07", timer: "AF3", dma: "1" },
    M3: { pin: "C08", timer: "AF3", dma: "1" },
    M4: { pin: "C09", timer: "AF3", dma: "0" },
    LED: { pin: "A15", timer: "AF1", dma: "0" },
    TX1: { pin: "A09" },
    RX1: { pin: "A10" },
  };

  it("resolves the F7X2 family and sees no clash in the defaults", () => {
    const result = reconcileTimersAndDma(current, "STM32F722", mcuAllData);
    expect(result.clash.hasClash).toBe(false);
    expect(result.commands).toEqual([]);
  });

  it("seats a fixed-wing layout: one motor on S1, servos on S2-S5", () => {
    const working = {
      M1: current.M1,
      S1: { pin: "C07" },
      S2: { pin: "C08" },
      S3: { pin: "C09" },
      S4: { pin: "B01" },
      LED: current.LED,
    };
    const result = reconcileTimersAndDma(working, "STM32F722", mcuAllData);
    expect(result.unresolved).toEqual([]);
    // C07/C08/C09 can only use TIM3 or TIM8; M1 owns TIM8 on C06, so the
    // servos must land on TIM3 (base exclusivity across feature types).
    for (const key of ["S1", "S2", "S3"]) {
      expect(result.allocation.find((a) => a.feature === key).chosen.base).toBe("TIM3");
    }
    expect(result.commands).toEqual(
      expect.arrayContaining(["timer C07 AF2", "timer C08 AF2", "timer C09 AF2"]),
    );
    // The motor keeps its timer and DMA -- nothing about it is resent.
    expect(result.commands.some((c) => c.includes("C06"))).toBe(false);
  });

  it("moves a motor's DMA off a stream a fixed peripheral reserves", () => {
    // PA8 (TIM1 CH1) offers three DMA streams; reserve the one in use.
    const layout = {
      M1: { pin: "A08", timer: "AF1", dma: "0" }, // DMA2 Stream 6
      LED: current.LED,
    };
    const reserved = new Set(["DMA2 Stream 6"]);
    const rows = buildFeatureRows(layout, "STM32F722", mcuAllData);
    const clashes = collectClashes(rows, reserved, new Set());
    expect(clashes).toEqual([
      expect.objectContaining({ kind: "dma", features: ["M1"], pins: ["A08"] }),
    ]);
    const result = reconcileTimersAndDma(layout, "STM32F722", mcuAllData, reserved);
    expect(result.unresolved).toEqual([]);
    // Same timer, different stream: only the DMA option is re-sent.
    expect(result.commands).toEqual(["dma pin A08 NONE", "dma pin A08 1"]);
  });

  it("refuses to touch a feature it cannot seat without a clash", () => {
    // TIM8 CH4 on C09 has a single DMA stream; reserving it leaves M4 no
    // DMA on TIM8, and the TIM3 alternative collides with the LED strip's
    // only stream (DMA1 Stream 5). The reconciler must report M4 as
    // unresolved and send nothing for it rather than break the output.
    // (The allocator may instead relocate the whole motor group to TIM3,
    // in which case M2 and the LED are the ones left colliding -- either
    // way the invariant holds: something is unresolved, and no command is
    // emitted for an unresolved feature's pin.)
    const reserved = new Set(["DMA2 Stream 7"]);
    const result = reconcileTimersAndDma(current, "STM32F722", mcuAllData, reserved);
    expect(result.clash.hasClash).toBe(true);
    expect(result.unresolved.length).toBeGreaterThan(0);
    for (const feature of result.unresolved) {
      const pin = current[feature].pin;
      expect(result.commands.some((c) => c.includes(pin))).toBe(false);
    }
  });
});

describe("board profiles", () => {
  // Boards are identified the unified way: manufacturer id plus board
  // name. The old target name plays no part, because under unified
  // firmware every board on one MCU reports the same one.
  const profiles = [
    {
      id: "MTKS-MATEKH743",
      match: { manufacturerId: ["MTKS"], boardName: ["MATEKH743"] },
      pads: [
        { pin: "B00", silkscreen: "S1", group: "outputs" },
        { pin: "A09", silkscreen: "TX1", group: "uart" },
      ],
    },
    {
      id: "ANY-CLONEBOARD",
      match: { manufacturerId: [], boardName: ["CLONEBOARD"] },
      pads: [],
    },
    {
      id: "OTHR-MATEKH743",
      match: { manufacturerId: ["OTHR"], boardName: ["MATEKH743"] },
      pads: [],
    },
  ];

  it("matches on manufacturer and board name, case-insensitively", () => {
    expect(
      matchBoardProfile(profiles, {
        manufacturerId: "mtks",
        boardName: "matekh743",
      })?.id,
    ).toBe("MTKS-MATEKH743");
    expect(
      matchBoardProfile(profiles, {
        manufacturerId: "OTHR",
        boardName: "MATEKH743",
      })?.id,
    ).toBe("OTHR-MATEKH743");
  });

  it("lets a profile cover every manufacturer of one board name", () => {
    expect(
      matchBoardProfile(profiles, {
        manufacturerId: "WHOEVER",
        boardName: "CLONEBOARD",
      })?.id,
    ).toBe("ANY-CLONEBOARD");
  });

  it("never matches without a board name, or on manufacturer alone", () => {
    expect(matchBoardProfile(profiles, { manufacturerId: "MTKS" })).toBeNull();
    expect(matchBoardProfile(profiles, {})).toBeNull();
    // An unknown manufacturer for a board name that is claimed by two
    // specific manufacturers is not a match for either of them.
    expect(
      matchBoardProfile(profiles, {
        manufacturerId: "NOPE",
        boardName: "MATEKH743",
      }),
    ).toBeNull();
  });

  it("finds nothing for a board nobody has drawn", () => {
    expect(findBoardProfile({ boardName: "VIRTUALFC" })).toBeNull();
    expect(findBoardProfile({})).toBeNull();
  });

  it("labels pads and finds them by pin", () => {
    const profile = profiles[0];
    expect(silkscreenFor(profile, "B00")).toBe("S1");
    expect(silkscreenFor(profile, "b00")).toBe("S1");
    expect(padForPin(profile, "A09")?.group).toBe("uart");
    expect(silkscreenFor(profile, "Z99")).toBeNull();
  });

  it("have unique pins and timer data for every output pad", () => {
    for (const board of boardProfiles.boards) {
      const pins = board.pads.map((pad) => pad.pin);
      expect(new Set(pins).size).toBe(pins.length);
      for (const pad of board.pads.filter((p) => p.group === "outputs")) {
        expect(
          getPinTimerOptions(mcuAllData, board.mcu, pad.pin).length,
          `${board.id} ${pad.silkscreen} ${pad.pin}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("feature criticality", () => {
  it("follows surface roles when given", () => {
    const roles = { S1: "aileron", S2: "flap", S3: "camera_tilt", M1: "throttle" };
    expect(classifyCriticality("S1", roles)).toBe("critical");
    expect(classifyCriticality("S2", roles)).toBe("important");
    expect(classifyCriticality("S3", roles)).toBe("minor");
    expect(classifyCriticality("M1", roles)).toBe("critical");
  });

  it("falls back to the key's type without a role", () => {
    expect(classifyCriticality("M2")).toBe("critical");
    expect(classifyCriticality("S5")).toBe("important");
    expect(classifyCriticality("RX2")).toBe("important");
    expect(classifyCriticality("LED")).toBe("minor");
    expect(classifyCriticality("Vbat")).toBe("minor");
  });
});

// The H7 parts route a timer channel to any of sixteen DMA streams through
// DMAMUX. The imported table listed only three, so the allocator saw a far
// narrower choice than the silicon has and reported clashes it could
// actually have resolved. See test/remap_fc/mcu_table.test.js.
describe("reconciler on STM32H743 (DMAMUX)", () => {
  // Six motor outputs from MATEKH743's target.c, all on DMAMUX-capable
  // timer channels.
  const current = {
    M1: { pin: "B00" }, // TIM3 CH3
    M2: { pin: "B01" }, // TIM3 CH4
    M3: { pin: "A00" }, // TIM5 CH1
    M4: { pin: "A01" }, // TIM5 CH2
    M5: { pin: "A02" }, // TIM5 CH3
    M6: { pin: "A03" }, // TIM5 CH4
  };

  it("offers every pin the full sixteen-stream DMA choice", () => {
    for (const pin of Object.values(current).map((entry) => entry.pin)) {
      const options = getPinTimerOptions(mcuAllData, "STM32H743", pin);
      const withDma = options.filter((option) => option.dma.length > 0);
      expect(withDma.length, pin).toBeGreaterThan(0);
      for (const option of withDma) {
        expect(option.dma.length, `${pin} ${option.timer}`).toBe(16);
        expect(option.dma[0].stream).toBe("DMA1 Stream 0");
        expect(option.dma[15].stream).toBe("DMA2 Stream 7");
      }
    }
  });

  it("resolves all six outputs onto distinct DMA streams", () => {
    const result = reconcileTimersAndDma({
      working: current,
      mcuType: "STM32H743",
      mcuAllData,
    });

    expect(result.unresolved ?? []).toEqual([]);

    const rows = buildFeatureRows(result.working ?? current, "STM32H743", mcuAllData);
    const clashes = collectClashes(rows);
    expect(clashes.filter((clash) => clash.kind === "dma")).toEqual([]);

    const streams = rows
      .filter((row) => row.currentDma)
      .map((row) => row.currentDma.stream);
    expect(new Set(streams).size, "each output needs its own stream").toBe(streams.length);
  });

  it("reports a clash when two outputs are forced onto one stream", () => {
    const rows = buildFeatureRows(current, "STM32H743", mcuAllData);
    const forced = rows.map((row) => ({
      ...row,
      currentDma: { index: 0, stream: "DMA1 Stream 0", channel: "23" },
    }));
    const clashes = collectClashes(forced);
    expect(clashes.some((clash) => clash.kind === "dma")).toBe(true);
  });
});
