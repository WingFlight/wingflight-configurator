import { describe, expect, it } from "vitest";

import {
  buildResourceCommand,
  parseDefaultPinMetadata,
  parseHardwareDefaults,
  parseHardwareDump,
  parseMcuType,
  parseOptionKey,
  parsePinMetadata,
  resourceKey,
} from "@/js/remap_fc/hardware_parser.js";
import {
  MATEKF405_DIFF_HARDWARE_DEFAULTS,
  MATEKF405_DIFF_HARDWARE_DEFAULTS_REMAPPED,
  MATEKF405_DMA_SHOW,
  MATEKF405_DUMP_HARDWARE,
  MATEKF405_STATUS,
  MATEKF405_TIMER_SHOW,
} from "@/js/remap_fc/fixtures/matekf405.js";
import {
  mcuTypeFromId,
  parseReservedDmaStreams,
  parseReservedTimers,
} from "@/js/remap_fc/timer_dma_lookup.js";

// Line formats below are the exact printf formats from
// wingflight-firmware/src/main/cli/cli.c:
//   printResource:         "resource %s %d %c%02d" / "resource %s %d NONE"
//   printTimerDetails:     "timer %c%02d AF%d" / "timer %c%02d NONE"
//                          "# pin %c%02d: TIM%d CH%d%s (AF%d)"
//   printTimerDmaoptDetails: "dma pin %c%02d %d" / "dma pin %c%02d NONE"
//                          "# pin %c%02d: DMA%d Stream %d Channel %d"
//   printPeripheralDmaoptDetails: "dma %s %d %d" / "dma %s %d NONE"
//   cliDefaultPrintLinef:  '#' + any of the above (no space)
//   showDma:               "DMA%d Stream %d:" + " %s %d" | " %s"
//   showTimers:            "TIM%d:" [" FREE"] / "    CH%d%s: %s %d"
//   cliStatus:             "MCU %s Clock=%dMHz"

describe("parseHardwareDump", () => {
  const map = parseHardwareDump(MATEKF405_DUMP_HARDWARE);

  it("reads resource lines in the firmware's %c%02d pin format", () => {
    expect(map.M1).toEqual({ pin: "C06", timer: "AF2", dma: "0" });
    expect(map.M2).toEqual({ pin: "C07", timer: "AF3", dma: "1" });
    expect(map.M3).toEqual({ pin: "C08", timer: "AF3", dma: "0" });
    expect(map.M4).toEqual({ pin: "C09", timer: "AF3", dma: "0" });
  });

  it("skips NONE resources", () => {
    expect(map.S1).toBeUndefined();
    expect(map.Freq1).toBeUndefined();
    expect(map.TX6).toBeUndefined();
  });

  it("keys single resources without an index", () => {
    expect(map.LED).toEqual({ pin: "B06", timer: "AF2", dma: "0" });
    expect(map.PPM).toEqual({ pin: "A03", timer: "AF2" });
    expect(map.Vbat).toEqual({ pin: "C05" });
    expect(map.Curr).toEqual({ pin: "C04" });
    expect(map.RSSI).toEqual({ pin: "B01" });
    expect(map.Beeper).toEqual({ pin: "C13" });
  });

  it("keeps UART and I2C pins, with timer metadata where the pin has one", () => {
    expect(map.TX1).toEqual({ pin: "A09" });
    expect(map.RX2).toEqual({ pin: "A03", timer: "AF2" });
    expect(map.TX4).toEqual({ pin: "A00", timer: "AF2" });
    expect(map.SDA1).toEqual({ pin: "B07" });
    expect(map.SCL1).toEqual({ pin: "B06", timer: "AF2", dma: "0" });
  });

  it("ignores owners this tool does not manage", () => {
    const keys = Object.keys(map);
    expect(keys.some((k) => /SPI|GYRO|FLASH|SDCARD/.test(k))).toBe(false);
    // The status LED ("resource LED 1 B09") must not collide with LED_STRIP.
    expect(map.LED.pin).toBe("B06");
    expect(map.LED1).toBeUndefined();
  });

  it("is case-insensitive and tolerant of CRLF", () => {
    const crlf = "resource servo 3 a08\r\ntimer a08 af1\r\ndma pin a08 2\r\n";
    expect(parseHardwareDump(crlf)).toEqual({
      S3: { pin: "A08", timer: "AF1", dma: "2" },
    });
  });

  it("does not treat '#'-prefixed default lines as current values", () => {
    const text = "#resource SERVO 1 A08\nresource SERVO 1 B07\n#timer B07 AF1\ntimer B07 AF2\n";
    expect(parseHardwareDump(text)).toEqual({ S1: { pin: "B07", timer: "AF2" } });
  });
});

describe("parsePinMetadata", () => {
  it("maps every timer/dma pin line, skipping NONE", () => {
    const meta = parsePinMetadata(MATEKF405_DUMP_HARDWARE);
    expect(meta.C06).toEqual({ timer: "AF2", dma: "0" });
    expect(meta.A00).toEqual({ timer: "AF2" });
    expect(meta.A03).toEqual({ timer: "AF2" });
    expect(meta.C13).toBeUndefined();
  });
});

describe("parseHardwareDefaults / parseDefaultPinMetadata", () => {
  it("equals the current map when the diff reports no changes", () => {
    const defaults = parseHardwareDefaults(
      MATEKF405_DUMP_HARDWARE,
      MATEKF405_DIFF_HARDWARE_DEFAULTS,
    );
    expect(defaults).toEqual(parseHardwareDump(MATEKF405_DUMP_HARDWARE));
  });

  it("reconstructs defaults from '#'-prefixed companion lines", () => {
    // A remapped board: the dump reflects the *current* state, the diff
    // carries each changed line's default.
    const remappedDump = MATEKF405_DUMP_HARDWARE.replace(
      "resource MOTOR 4 C09",
      "resource MOTOR 4 NONE",
    )
      .replace("resource SERVO 1 NONE", "resource SERVO 1 C09")
      .replace("resource LED_STRIP 1 B06", "resource LED_STRIP 1 B08")
      .replace("timer C09 AF3", "timer C09 AF2")
      .replace("dma pin C09 0", "dma pin C09 NONE")
      .concat("timer B00 AF2\ndma pin B00 0\n");

    const current = parseHardwareDump(remappedDump);
    expect(current.M4).toBeUndefined();
    expect(current.S1).toEqual({ pin: "C09", timer: "AF2" });
    expect(current.LED).toEqual({ pin: "B08", timer: "AF2", dma: "0" });

    const defaults = parseHardwareDefaults(
      remappedDump,
      MATEKF405_DIFF_HARDWARE_DEFAULTS_REMAPPED,
    );
    expect(defaults.M4).toEqual({ pin: "C09", timer: "AF3", dma: "0" });
    expect(defaults.S1).toBeUndefined();
    expect(defaults.LED).toEqual({ pin: "B06", timer: "AF2", dma: "0" });
    // Unchanged resources fall through from the current map.
    expect(defaults.M1).toEqual({ pin: "C06", timer: "AF2", dma: "0" });

    const pinDefaults = parseDefaultPinMetadata(
      remappedDump,
      MATEKF405_DIFF_HARDWARE_DEFAULTS_REMAPPED,
    );
    expect(pinDefaults.C09).toEqual({ timer: "AF3", dma: "0" });
    // A changed line without a companion means the default is NONE.
    expect(pinDefaults.B00).toBeUndefined();
    expect(pinDefaults.C06).toEqual({ timer: "AF2", dma: "0" });
  });
});

describe("parseMcuType", () => {
  it("reads the MCU from the status command", () => {
    expect(parseMcuType(MATEKF405_STATUS)).toBe("STM32F40X");
  });

  it("finds nothing in a Wingflight dump banner (target name, not MCU)", () => {
    expect(parseMcuType(MATEKF405_DUMP_HARDWARE)).toBeNull();
  });

  it("still accepts an STM32 banner token", () => {
    expect(parseMcuType("# Rotorflight / STM32F7X2 (S7X2) 4.4.0")).toBe(
      "STM32F7X2",
    );
  });

  it("maps MSP mcuTypeId to MCU-all.json keys", () => {
    expect(mcuTypeFromId(1)).toBe("STM32F40X");
    expect(mcuTypeFromId(2)).toBe("STM32F411");
    expect(mcuTypeFromId(4)).toBe("STM32F7X2");
    expect(mcuTypeFromId(10)).toBe("STM32H743");
    expect(mcuTypeFromId(255)).toBeNull();
  });
});

describe("resource commands", () => {
  it("round-trips option keys to the firmware's owner names", () => {
    expect(buildResourceCommand("M1", "C06")).toBe("resource MOTOR 1 C06");
    expect(buildResourceCommand("S8", null)).toBe("resource SERVO 8 NONE");
    expect(buildResourceCommand("LED", "B06")).toBe("resource LED_STRIP 1 B06");
    expect(buildResourceCommand("Vbat", "C05")).toBe("resource ADC_BATT 1 C05");
    expect(buildResourceCommand("RX2", "A03")).toBe("resource SERIAL_RX 2 A03");
    expect(buildResourceCommand("Freq2", "A01")).toBe("resource FREQ 2 A01");
    expect(buildResourceCommand("PPM", null)).toBe("resource PPM 1 NONE");
  });

  it("parses keys back", () => {
    expect(parseOptionKey("SDA2")).toEqual({ prefix: "SDA", index: 2, tag: "I2C_SDA" });
    expect(parseOptionKey("RSSI")).toEqual({ prefix: "RSSI", index: 1, tag: "ADC_RSSI" });
    expect(() => parseOptionKey("GYRO_CS1")).toThrow();
    expect(resourceKey("SPI_SCK", 1)).toBeNull();
    expect(resourceKey("servo", "3")).toBe("S3");
  });
});

describe("dma show / timer show", () => {
  it("collects streams claimed by fixed peripherals only", () => {
    const reserved = parseReservedDmaStreams(MATEKF405_DMA_SHOW);
    expect(reserved).toEqual(new Set(["DMA2 Stream 0", "DMA2 Stream 4"]));
  });

  it("collects timer channels claimed by fixed peripherals, incl. CHnN", () => {
    const text = [
      "Currently active Timers:",
      "-----------------------",
      "TIM1:",
      "    CH1 : MOTOR 1",
      "    CH2N: BEEPER",
      "TIM2: FREE",
      "TIM5:",
      "    CH4 : PPM",
    ].join("\n");
    const reserved = parseReservedTimers(text);
    expect(reserved).toEqual(new Set(["TIM1 CH2", "TIM1 CH2N", "TIM5 CH4"]));
    expect(parseReservedTimers(MATEKF405_TIMER_SHOW).size).toBe(0);
  });
});
