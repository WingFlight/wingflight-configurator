import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STEPPED_TRIM_STEP,
  TRIM_BUTTONS,
  buttonAt,
  buttonValue,
  buttonWindow,
  gainMode,
  gainRange,
  mappedValue,
  slotFor,
  steppedTrimRange,
  trimMode,
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

test("each trim button's value sits well inside its own window", () => {
  TRIM_BUTTONS.forEach((b, i) => {
    const value = buttonValue(b.weight);
    const window = buttonWindow(i);
    assert.ok(window.start % 5 === 0 && window.end % 5 === 0);
    assert.ok(value - window.start >= 20, `${b.button} low margin`);
    assert.ok(window.end - value >= 20, `${b.button} high margin`);
    assert.equal(buttonAt(Math.round(value)), b);
    if (i > 0) assert.equal(buttonWindow(i - 1).end, window.start);
  });
});

test("no button pressed (1500) and a stick channel match no button", () => {
  assert.equal(buttonAt(1500), null);
  assert.equal(buttonAt(1000), null);
  assert.equal(buttonAt(2012), null);
  assert.equal(buttonAt(undefined), null);
});

test("stepped trim ranges: left/up step down, right/down step up", () => {
  const roll = steppedTrimRange("roll", 3);
  assert.equal(roll.adjFunction, 89);
  assert.equal(roll.adjChannel, 3);
  assert.equal(roll.adjStep, STEPPED_TRIM_STEP);
  assert.deepEqual(roll.adjRange1, { start: 1835, end: 1885 }); // T1 Left 70%
  assert.deepEqual(roll.adjRange2, { start: 1885, end: 1935 }); // T1 Right 80%

  const pitch = steppedTrimRange("pitch", 3);
  assert.deepEqual(pitch.adjRange1, { start: 1780, end: 1835 }); // T2 Up 60%
  assert.deepEqual(pitch.adjRange2, { start: 1730, end: 1780 }); // T2 Down 50%

  const yaw = steppedTrimRange("yaw", 3);
  assert.deepEqual(yaw.adjRange1, { start: 1630, end: 1680 }); // T4 Left 30%
  assert.deepEqual(yaw.adjRange2, { start: 1680, end: 1730 }); // T4 Right 40%
});

test("trim mode is read back from the ranges", () => {
  assert.equal(trimMode([off(), off()]), null);
  assert.equal(trimMode([trimRange("roll", 4), off()]), "programmable");
  assert.equal(
    trimMode([steppedTrimRange("roll", 3), steppedTrimRange("yaw", 3)]),
    "buttons",
  );
});
