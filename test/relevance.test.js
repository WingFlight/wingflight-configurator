import { beforeEach, describe, expect, it } from "vitest";

import {
  allFields,
  clearRegistry,
  getField,
  isVisible,
  registerField,
  registerFields,
  tierVisible,
  visible,
  when,
} from "@/js/relevance.js";
import { deriveProfile } from "@/js/profile/derive.js";
import { conventionalTrainer, vtailGliderWithFlaps, flyingWingTwoMotors } from "./fixtures/fc_fixtures.js";

describe("tierVisible", () => {
  it("shows a tier at or below the level", () => {
    expect(tierVisible("essential", "essential")).toBe(true);
    expect(tierVisible("standard", "essential")).toBe(false);
    expect(tierVisible("expert", "standard")).toBe(false);
    expect(tierVisible("expert", "expert")).toBe(true);
  });

  it("treats unknown tiers and levels as standard", () => {
    expect(tierVisible(undefined, undefined)).toBe(true);
    expect(tierVisible("bogus", "essential")).toBe(false);
    expect(tierVisible("expert", "bogus")).toBe(false);
  });
});

describe("isVisible", () => {
  const trainer = deriveProfile(conventionalTrainer());
  const glider = deriveProfile(vtailGliderWithFlaps());

  it("combines tier and predicate", () => {
    const def = { tier: "standard", when: when.hasMotors };
    expect(isVisible(def, trainer, "standard")).toBe(true);
    expect(isVisible(def, glider, "standard")).toBe(false);
    expect(isVisible(def, trainer, "essential")).toBe(false);
  });

  it("accepts booleans and never lets a throwing predicate hide a field", () => {
    expect(isVisible({ tier: "essential", when: false }, trainer, "expert")).toBe(false);
    expect(isVisible({ tier: "essential", when: true }, trainer, "essential")).toBe(true);
    expect(
      isVisible(
        {
          tier: "essential",
          when: () => {
            throw new Error("boom");
          },
        },
        trainer,
        "essential",
      ),
    ).toBe(true);
  });
});

describe("registry", () => {
  beforeEach(() => clearRegistry());

  it("starts empty and treats unregistered ids as visible", () => {
    expect(allFields()).toEqual([]);
    expect(visible("nope.field", null, "essential")).toBe(true);
  });

  it("registers fields with a default standard tier", () => {
    registerField("servos.table.rate", { tier: "expert", when: when.hasServos });
    registerFields({ "mixer.rules": { when: when.isCustomMixer } });
    expect(getField("servos.table.rate").tier).toBe("expert");
    expect(getField("mixer.rules").tier).toBe("standard");
    expect(allFields().map((f) => f.id).sort()).toEqual(["mixer.rules", "servos.table.rate"]);
  });

  it("resolves visibility through the registry", () => {
    registerField("motors.diffThrust", { tier: "standard", when: when.twoMotors });
    expect(visible("motors.diffThrust", deriveProfile(flyingWingTwoMotors()), "standard")).toBe(true);
    expect(visible("motors.diffThrust", deriveProfile(conventionalTrainer()), "standard")).toBe(false);
  });
});

describe("predicates", () => {
  it("compose with not/all/any", () => {
    const wing = deriveProfile(flyingWingTwoMotors());
    expect(when.all(when.isFlyingWing, when.twoMotors)(wing)).toBe(true);
    expect(when.not(when.isConventional)(wing)).toBe(true);
    expect(when.any(when.isGlider, when.hasGps)(wing)).toBe(true);
    expect(when.hasVtail(deriveProfile(vtailGliderWithFlaps()))).toBe(true);
  });
});
