import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { allFields, TIERS, when } from "@/js/relevance.js";
import { deriveProfile } from "@/js/profile/derive.js";
import "@/js/fields/index.js";

import { conventionalTrainer, flyingWingTwoMotors, vtailGliderWithFlaps } from "./fixtures/fc_fixtures.js";

// Every registered field must be well-formed: a known tier, a tab that
// exists, an id namespaced by that tab, label/help keys that exist in the
// English locale, and a predicate that evaluates on every fixture profile
// without throwing.
const TABS = fs
  .readdirSync(path.resolve(import.meta.dirname, "../src/tabs"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const messages = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../locales/en/messages.json"), "utf8"));

const profiles = [conventionalTrainer(), flyingWingTwoMotors(), vtailGliderWithFlaps()].map((fc) => deriveProfile(fc));

describe("field registry", () => {
  const fields = allFields();

  it("registers only well-formed fields", () => {
    const seen = new Set();
    for (const f of fields) {
      expect(TIERS, `${f.id}: tier`).toContain(f.tier);
      expect(TABS, `${f.id}: tab`).toContain(f.tab);
      expect(f.id.startsWith(`${f.tab}.`), `${f.id}: id must start with "${f.tab}."`).toBe(true);
      expect(seen.has(f.id), `${f.id}: duplicate`).toBe(false);
      seen.add(f.id);
      if (f.labelKey) expect(messages[f.labelKey], `${f.id}: labelKey ${f.labelKey}`).toBeDefined();
      if (f.helpKey) expect(messages[f.helpKey], `${f.id}: helpKey ${f.helpKey}`).toBeDefined();
      expect(f.labelKey || f.label, `${f.id}: needs labelKey or label`).toBeTruthy();
      if (f.when !== undefined) {
        expect(typeof f.when === "function" || typeof f.when === "boolean", `${f.id}: when`).toBe(true);
        if (typeof f.when === "function") {
          for (const p of profiles) expect(() => f.when(p), `${f.id}: predicate throws`).not.toThrow();
        }
      }
    }
  });

  it("exposes the shared predicates used by registrations", () => {
    expect(typeof when.hasServos).toBe("function");
    expect(typeof when.twoMotors).toBe("function");
  });
});
