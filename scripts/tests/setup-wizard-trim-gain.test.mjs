import { test } from "node:test";
import assert from "node:assert/strict";

import {
  gainMode,
  gainRange,
  mappedValue,
  slotFor,
  trimRange,
} from "../../src/tabs/setup_wizard/trimGain.js";

function off() {
  return {
    adjFunction: 0,
    adjChannel: 0,
    adjRange1: { start: 1500, end: 1500 },
  };
}

test("a centered trim channel adds nothing; the ends give +-100 us", () => {
  const range = trimRange("roll", 4);
  assert.equal(range.adjFunction, 89);
  assert.equal(range.adjStep, 0);
  assert.equal(mappedValue(range, 1500), 0);
  assert.equal(mappedValue(range, 975), -100);
  assert.equal(mappedValue(range, 2025), 100);
  assert.equal(mappedValue(range, 2100), 100);
});

test("a gain knob spans 0-150% and is 75% centered", () => {
  const range = gainRange("pitch", 2);
  assert.equal(range.adjFunction, 84);
  assert.equal(mappedValue(range, 1500), 75);
  assert.equal(mappedValue(range, 975), 0);
  assert.equal(mappedValue(range, 2025), 150);
});

test("slotFor reuses the function's own slot, else the first free one", () => {
  const ranges = [gainRange("roll", 1), off(), trimRange("yaw", 3), off()];
  assert.equal(slotFor(ranges, 85), 0);
  assert.equal(slotFor(ranges, 91), 2);
  assert.equal(slotFor(ranges, 89), 1);
  assert.equal(slotFor([gainRange("roll", 1)], 89), -1);
});

test("gainMode tells one knob from three", () => {
  assert.equal(gainMode([off(), off()]), "none");
  assert.equal(
    gainMode([gainRange("roll", 2), gainRange("pitch", 2), gainRange("yaw", 2)]),
    "single",
  );
  assert.equal(
    gainMode([gainRange("roll", 2), gainRange("pitch", 3), gainRange("yaw", 4)]),
    "separate",
  );
});
