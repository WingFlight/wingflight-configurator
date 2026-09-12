import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findBoardProfile } from "@/js/remap_fc/board_profiles.js";
import { synthesiseBoardView } from "@/js/boardview/generic_layout.js";
import { buildPortMap } from "@/js/boardview/port_map.js";
import { validateProfile } from "@/js/boardview/schema.js";
import {
  listTargets,
  parseTargetFileName,
  readIdentity,
  readSerialPorts,
  readTargetConfig,
  targetId,
} from "@/js/boardview/unified_config.js";

// A real file from WingFlight/wingflight-targets, vendored so these
// checks run offline. Refresh it if the catalogue format ever changes.
const CONFIG = fs.readFileSync(
  path.join(import.meta.dirname, "fixtures/MTKS-MATEKH743.config"),
  "utf8",
);

describe("targetId", () => {
  it("joins the two halves the way the catalogue names its files", () => {
    expect(targetId({ manufacturerId: "MTKS", boardName: "MATEKH743" })).toBe(
      "MTKS-MATEKH743",
    );
  });

  it("upper-cases and trims", () => {
    expect(targetId({ manufacturerId: " mtks ", boardName: "matekh743" })).toBe(
      "MTKS-MATEKH743",
    );
  });

  it("refuses half an identity, because half of one matches nothing", () => {
    expect(targetId({ boardName: "MATEKH743" })).toBeNull();
    expect(targetId({ manufacturerId: "MTKS" })).toBeNull();
    expect(targetId(null)).toBeNull();
  });
});

describe("parseTargetFileName", () => {
  it("splits a catalogue file name", () => {
    expect(parseTargetFileName("MTKS-MATEKH743.config")).toEqual({
      targetId: "MTKS-MATEKH743",
      manufacturerId: "MTKS",
      boardName: "MATEKH743",
      file: "MTKS-MATEKH743.config",
    });
  });

  it("keeps hyphens that belong to the board name", () => {
    expect(parseTargetFileName("AIRB-OMNIBUS-F4-V6.config")?.boardName).toBe(
      "OMNIBUS-F4-V6",
    );
  });

  // The catalogue is not consistent about extensions, and the odd ones
  // out are real boards: hiding them was a bug, not tidiness.
  it("accepts the extensions the catalogue actually uses", () => {
    expect(parseTargetFileName("TMTR-TMOTORVELOXF7SE.txt")).toMatchObject({
      targetId: "TMTR-TMOTORVELOXF7SE",
      file: "TMTR-TMOTORVELOXF7SE.txt",
    });
    expect(parseTargetFileName("FLAO-FLAOF405X8")).toMatchObject({
      targetId: "FLAO-FLAOF405X8",
      file: "FLAO-FLAOF405X8",
    });
  });

  it("carries the name the catalogue stores, which is what gets fetched", () => {
    expect(parseTargetFileName("FLAO-FLAOF405X8").file).toBe("FLAO-FLAOF405X8");
  });

  it("ignores anything that is not a board config", () => {
    expect(parseTargetFileName("README.md")).toBeNull();
    expect(parseTargetFileName("LICENSE")).toBeNull();
    expect(parseTargetFileName("TOOLONG-BOARD.config")).toBeNull();
  });
});

describe("readIdentity", () => {
  const identity = readIdentity(CONFIG);

  it("reads the board's own keywords, not the file name", () => {
    expect(identity.boardName).toBe("MATEKH743");
    expect(identity.manufacturerId).toBe("MTKS");
    expect(identity.targetId).toBe("MTKS-MATEKH743");
  });

  it("takes the MCU from the build line", () => {
    expect(identity.mcu).toBe("STM32H743");
  });

  it("returns nulls rather than guessing for a file with no identity", () => {
    expect(readIdentity("# nothing here\n")).toEqual({
      boardName: null,
      manufacturerId: null,
      mcu: null,
      targetId: null,
    });
  });
});

describe("readSerialPorts", () => {
  it("reads the board's own default port assignments", () => {
    const ports = readSerialPorts(CONFIG);
    expect(ports.length).toBeGreaterThan(0);
    for (const port of ports) {
      expect(Number.isInteger(port.identifier)).toBe(true);
      expect(Number.isInteger(port.functionMask)).toBe(true);
    }
  });
});

describe("readTargetConfig", () => {
  const { hardwareMap } = readTargetConfig(CONFIG);

  it("maps the resource lines onto option keys", () => {
    expect(hardwareMap.TX1.pin).toBe("A09");
    expect(hardwareMap.RX1.pin).toBe("A10");
    expect(hardwareMap.M1.pin).toBe("B00");
    expect(hardwareMap.S1.pin).toBe("E05");
    expect(hardwareMap.Vbat.pin).toBe("C00");
    expect(hardwareMap.LED.pin).toBe("A08");
  });

  it("leaves resources the drawing does not manage out of it", () => {
    // SPI_SCK, GYRO_CS and friends are real lines in the file but are
    // not user-facing pads, so nothing should invent a pad for them.
    for (const key of Object.keys(hardwareMap)) {
      expect(key).not.toMatch(/SPI|GYRO|FLASH|OSD|BARO/);
    }
  });
});

// Seeding a board in the editor is exactly this pipeline, so checking
// it end to end here is what keeps the editor honest.
describe("a catalogue config, seeded into a drawing", () => {
  const { identity, hardwareMap, serialPorts } = readTargetConfig(CONFIG);
  const profile = synthesiseBoardView({
    hardwareMap,
    serialPorts,
    boardName: identity.boardName,
    mcu: identity.mcu,
  });

  it("produces a sound profile", () => {
    expect(validateProfile(profile)).toEqual([]);
  });

  it("places every pin the config gave it, once", () => {
    const placed = profile.allPads.map((pad) => pad.pin);
    expect(new Set(placed).size).toBe(placed.length);
    for (const entry of Object.values(hardwareMap)) {
      expect(placed).toContain(entry.pin);
    }
  });

  it("draws every serial port with both its pins", () => {
    const map = buildPortMap({ profile, serialPorts });
    const uarts = map.filter((port) => port.identifier < 30);
    expect(uarts.length).toBeGreaterThan(4);
    for (const port of uarts) {
      expect(port.drawn, `${port.label} is not drawn`).toBe(true);
    }
  });
});

describe("listTargets", () => {
  const entries = [
    { name: "MTKS-MATEKH743.config", path: "configs/MTKS-MATEKH743.config", download_url: "u1" },
    { name: "AIRB-NOX.config", path: "configs/AIRB-NOX.config", download_url: "u2" },
    { name: "README.md", path: "README.md", download_url: "u3" },
  ];

  it("keeps only configs, sorted by manufacturer then board", () => {
    expect(listTargets(entries).map((t) => t.targetId)).toEqual([
      "AIRB-NOX",
      "MTKS-MATEKH743",
    ]);
  });

  it("offers every board in the listing, however it is named", () => {
    const odd = [
      ...entries,
      { name: "FLAO-FLAOF405X8", path: "configs/FLAO-FLAOF405X8" },
      { name: "TMTR-VELOX.txt", path: "configs/TMTR-VELOX.txt" },
    ];
    expect(listTargets(odd).map((t) => t.targetId)).toEqual([
      "AIRB-NOX",
      "FLAO-FLAOF405X8",
      "MTKS-MATEKH743",
      "TMTR-VELOX",
    ]);
  });

  it("carries the download url through", () => {
    expect(listTargets(entries)[0].url).toBe("u2");
  });
});

describe("findBoardProfile under unified identity", () => {
  // The catalogue has hundreds of boards on the same silicon, all of
  // which report the same target name. Matching has to use the pair
  // that is actually unique.
  it("finds nothing without a board name", () => {
    expect(findBoardProfile({ manufacturerId: "MTKS" })).toBeNull();
    expect(findBoardProfile({})).toBeNull();
    expect(findBoardProfile(null)).toBeNull();
  });
});

// R8: the simulator presents a real board from the families we ship
// for, so everything downstream is exercised against real hardware.
describe("the simulator's board", () => {
  const config = fs.readFileSync(
    path.join(import.meta.dirname, "fixtures/FRSK-VANTAC_RF007.config"),
    "utf8",
  );
  const identity = readIdentity(config);

  it("is the Vantac RF007", () => {
    expect(identity.targetId).toBe("FRSK-VANTAC_RF007");
    expect(identity.mcu).toBe("STM32F7X2");
  });

  it("matches what virtual mode reports over MSP", async () => {
    const { VANTAC_RF007_CONFIG } = await import(
      "@/js/remap_fc/fixtures/vantac_rf007.js"
    );
    expect(VANTAC_RF007_CONFIG.boardName).toBe(identity.boardName);
    expect(VANTAC_RF007_CONFIG.manufacturerId).toBe(identity.manufacturerId);
  });

  it("gives the CLI fixture the same pins the catalogue has", async () => {
    const { VANTAC_RF007_DUMP_HARDWARE } = await import(
      "@/js/remap_fc/fixtures/vantac_rf007.js"
    );
    const fromCatalogue = readTargetConfig(config).hardwareMap;
    const fromFixture = readTargetConfig(VANTAC_RF007_DUMP_HARDWARE).hardwareMap;
    for (const [key, entry] of Object.entries(fromCatalogue)) {
      expect(fromFixture[key]?.pin, key).toBe(entry.pin);
    }
  });

  it("draws every UART the board has", async () => {
    const { VANTAC_RF007_DUMP_HARDWARE } = await import(
      "@/js/remap_fc/fixtures/vantac_rf007.js"
    );
    const { hardwareMap, serialPorts } = readTargetConfig(
      VANTAC_RF007_DUMP_HARDWARE,
    );
    const profile = synthesiseBoardView({ hardwareMap, serialPorts });
    expect(validateProfile(profile)).toEqual([]);
    const map = buildPortMap({ profile, serialPorts });
    expect(map.length).toBeGreaterThanOrEqual(5);
    for (const port of map) expect(port.drawn, port.label).toBe(true);
  });
});
