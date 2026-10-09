import { test } from "node:test";
import assert from "node:assert/strict";

import {
  mapFromDetected,
  movedChannel,
  orderLabel,
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
