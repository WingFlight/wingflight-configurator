import { describe, expect, it } from "vitest";

import {
  normalisePin,
  normaliseProfile,
  serialiseProfile,
  validateProfile,
} from "@/js/boardview/schema.js";
import boardProfiles from "@/tabs/journey/board_profiles.json";

const v1 = {
  id: "TEST-F405",
  match: { manufacturerId: ["TEST"], boardName: ["TESTF405"] },
  display: "Test F405",
  mcu: "STM32F405",
  outline: { width: 40, height: 30, mountHoles: [[3, 3]] },
  pads: [
    { pin: "b7", silkscreen: "S1", x: 4, y: 28, side: "top", group: "outputs" },
    { pin: "A09", silkscreen: "T1", x: 1, y: 10, side: "top", group: "uart" },
  ],
};

describe("normalisePin", () => {
  it("canonicalises the CLI pin spellings", () => {
    expect(normalisePin("b7")).toBe("B07");
    expect(normalisePin("PA9")).toBe("A09");
    expect(normalisePin("C06")).toBe("C06");
  });

  it("leaves something it does not recognise alone", () => {
    expect(normalisePin("NONE")).toBe("NONE");
  });
});

describe("normaliseProfile", () => {
  it("turns a version 1 profile into a single top view", () => {
    const profile = normaliseProfile(v1);
    expect(profile.schema).toBe(3);
    expect(Object.keys(profile.views)).toEqual(["top"]);
    expect(profile.views.top.width).toBe(40);
    expect(profile.pads.every((pad) => pad.view === "top")).toBe(true);
    expect(profile.pads[0].pin).toBe("B07");
    expect(profile.outline).toEqual({
      width: 40,
      height: 30,
      mountHoles: [[3, 3]],
    });
  });

  it("keeps every view a version 2 profile declares", () => {
    const profile = normaliseProfile({
      ...v1,
      outline: undefined,
      views: {
        top: { width: 40, height: 30 },
        left: { width: 40, height: 10 },
        right: { width: 40, height: 10 },
      },
      pads: [{ pin: "A09", silkscreen: "T1", x: 5, y: 5, view: "left" }],
    });
    expect(Object.keys(profile.views).sort()).toEqual(["left", "right", "top"]);
    expect(profile.pads[0].view).toBe("left");
  });

  it("drops a pad pointing at a view the profile does not have", () => {
    const profile = normaliseProfile({
      ...v1,
      pads: [...v1.pads, { pin: "C01", x: 1, y: 1, view: "right" }],
    });
    expect(profile.pads.map((pad) => pad.pin)).not.toContain("C01");
  });

  it("does not mutate what it was given", () => {
    const before = JSON.stringify(v1);
    normaliseProfile(v1);
    expect(JSON.stringify(v1)).toBe(before);
  });
});

describe("serialiseProfile", () => {
  it("round-trips through normalise unchanged", () => {
    const once = normaliseProfile(v1);
    const twice = normaliseProfile(serialiseProfile(once));
    expect(serialiseProfile(twice)).toEqual(serialiseProfile(once));
  });

  it("omits optional fields that carry no information", () => {
    const written = serialiseProfile(normaliseProfile(v1));
    expect(written.pads[0]).not.toHaveProperty("labelSide");
    expect(written.pads[0]).not.toHaveProperty("reserved");
    expect(written).not.toHaveProperty("outline");
  });
});

describe("validateProfile", () => {
  it("passes a sound profile", () => {
    expect(validateProfile(normaliseProfile(v1))).toEqual([]);
  });

  it("catches the same pin placed twice", () => {
    const problems = validateProfile(
      normaliseProfile({
        ...v1,
        pads: [...v1.pads, { pin: "B07", x: 9, y: 9, group: "uart" }],
      }),
    );
    expect(problems.some((p) => p.level === "error" && p.pin === "B07")).toBe(true);
  });

  it("warns about a port pin that has no pad", () => {
    const problems = validateProfile(
      normaliseProfile({
        ...v1,
        ports: [{ id: "UART1", identifier: 0, tx: "A09", rx: "A10" }],
      }),
    );
    expect(problems).toContainEqual(
      expect.objectContaining({ level: "warning", pin: "A10" }),
    );
  });

  it("rejects two ports claiming one serial identifier", () => {
    const problems = validateProfile(
      normaliseProfile({
        ...v1,
        ports: [
          { id: "a", identifier: 0, tx: "A09" },
          { id: "b", identifier: 0, tx: "B07" },
        ],
      }),
    );
    expect(problems.some((p) => p.level === "error")).toBe(true);
  });
});

describe("the profiles shipped in this build", () => {
  // The file starts empty: a board earns an entry only once someone
  // has it in hand and can place the pads where they really are.
  // Everything else falls back to the synthesised schematic.
  it("is a well-formed file", () => {
    expect(Array.isArray(boardProfiles.boards)).toBe(true);
  });

  it("holds only profiles that normalise, validate and match by identity", () => {
    for (const board of boardProfiles.boards) {
      const profile = normaliseProfile(board);
      expect(
        validateProfile(profile).filter((p) => p.level === "error"),
        board.id,
      ).toEqual([]);
      expect(profile.pads.length, board.id).toBeGreaterThan(0);
      // Without a board name a profile can never be found, so shipping
      // one would be shipping dead data.
      expect(profile.match.boardName.length, board.id).toBeGreaterThan(0);
    }
  });
});

describe("match", () => {
  it("upper-cases the identity, so a lower-case file still matches", () => {
    const profile = normaliseProfile({
      ...v1,
      match: { manufacturerId: ["mtks"], boardName: ["matekh743"] },
    });
    expect(profile.match).toEqual({
      manufacturerId: ["MTKS"],
      boardName: ["MATEKH743"],
    });
  });

  it("drops a legacy target-name match rather than pretending it works", () => {
    const profile = normaliseProfile({
      ...v1,
      match: { targetName: ["MATEKF405"], boardDesign: ["MATEKF405"] },
    });
    expect(profile.match).toEqual({ manufacturerId: [], boardName: [] });
  });
});
