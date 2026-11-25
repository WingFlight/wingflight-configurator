import { test } from "node:test";
import assert from "node:assert/strict";

import {
  centreFromSamples,
  centreIsOff,
  mapFromDetected,
  movedChannel,
  orderLabel,
  suggestedCentre,
} from "../../src/tabs/setup_wizard/receiver.js";

test("orderLabel names the common orders", () => {
  assert.equal(orderLabel([0, 1, 3, 2, 4, 5, 6, 7]), "AETR1234");
  assert.equal(orderLabel([1, 2, 3, 0, 4, 5, 6, 7]), "TAER1234");
});

test("mapFromDetected puts aux on the remaining channels in order", () => {
  // Receiver sends T E A R on channels 0-3.
  assert.deepEqual(
    mapFromDetected([2, 1, 3, 0], 8),
    [2, 1, 3, 0, 4, 5, 6, 7],
  );
  // Sticks on channels 4-7: aux fills 0-3.
  assert.deepEqual(
    mapFromDetected([4, 5, 6, 7], 8),
    [4, 5, 6, 7, 0, 1, 2, 3],
  );
  assert.equal(orderLabel(mapFromDetected([2, 1, 3, 0], 8)), "TEAR1234");
});

test("movedChannel waits for a clear winner", () => {
  assert.equal(movedChannel([0, 0, 0, 0]), -1);
  // Not far enough yet.
  assert.equal(movedChannel([0, 200, 0, 0]), -1);
  assert.equal(movedChannel([10, 450, 20, 0]), 1);
  // Two channels moving together (a mixed stick or a bumped one): not clear.
  assert.equal(movedChannel([400, 450, 0, 0]), -1);
});

test("movedChannel ignores channels already found", () => {
  assert.equal(movedChannel([500, 30, 420, 0], [0]), 2);
  assert.equal(movedChannel([500, 0, 0, 0], [0]), -1);
});

test("centreFromSamples finds a 1520 us centre", () => {
  const samples = [
    [1519, 1520, 1521],
    [1520, 1521, 1520],
    [1521, 1519, 1520],
  ];
  assert.deepEqual(centreFromSamples(samples), { status: "ok", centre: 1520 });
  assert.equal(centreIsOff(1520, 1500), true);
  assert.equal(centreIsOff(1502, 1500), false);
});

test("centreFromSamples needs a signal and still sticks", () => {
  assert.deepEqual(centreFromSamples([]), { status: "noSignal" });
  assert.deepEqual(centreFromSamples([[1500, 0, 1500]]), {
    status: "noSignal",
  });
  assert.deepEqual(
    centreFromSamples([
      [1500, 1500, 1500],
      [1530, 1500, 1500],
    ]),
    { status: "moving" },
  );
});

test("centreFromSamples names the axis with its trim off", () => {
  // Roll and yaw at 1520, pitch trimmed up to 1540.
  assert.deepEqual(centreFromSamples([[1520, 1540, 1520]]), {
    status: "trim",
    axis: 1,
    centre: 1527,
  });
  // Within CENTRE_AGREE_US is fine.
  assert.equal(centreFromSamples([[1518, 1522, 1520]]).status, "ok");
});

test("suggestedCentre only for resting sticks near the centre", () => {
  assert.equal(suggestedCentre([[1520, 1520, 1521]], 1500), 1520);
  // Already right.
  assert.equal(suggestedCentre([[1501, 1500, 1500]], 1500), null);
  // Sticks held somewhere else, not centred.
  assert.equal(suggestedCentre([[1590, 1590, 1590]], 1500), null);
  // A trim off: Detect explains that, the hint stays quiet.
  assert.equal(suggestedCentre([[1520, 1540, 1520]], 1500), null);
});

test("centreFromSamples refuses a centre outside the range", () => {
  assert.deepEqual(centreFromSamples([[1700, 1700, 1700]]), {
    status: "range",
    centre: 1700,
  });
});
