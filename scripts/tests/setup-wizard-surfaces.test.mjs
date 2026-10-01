import assert from 'node:assert/strict';
import test from 'node:test';
import {
    surfacesFromRules, primaryAxis, outputForAxis, servoSide,
    travelReach, gainForThrow, scaleForThrow,
} from '../../src/tabs/setup_wizard/surfaces.js';

const SET = 1, ADD = 2;
const rule = (oper, src, dst, weight, weightNeg = weight) => ({ oper, src, dst, weight, weightNeg });
const servo = (overrides = {}) => ({ mid: 1520, min: -500, max: 500, rneg: 500, rpos: 500, flags: 0, ...overrides });
const gains = { roll: 1, pitch: 1, yaw: 1 };

test('conventional layout names each surface from its axes', () => {
    const rules = [
        rule(SET, 1, 1, 1000), rule(SET, 1, 2, -1000),
        rule(SET, 2, 3, 1000), rule(SET, 3, 4, 1000),
        rule(SET, 4, 27, 1000), // throttle to a motor, not a servo
    ];
    const surfaces = surfacesFromRules(rules, 8);
    assert.deepEqual(surfaces.map((s) => [s.servo, s.kind]),
        [[0, 'aileron'], [1, 'aileron'], [2, 'elevator'], [3, 'rudder']]);
    assert.equal(primaryAxis(surfaces[0]), 'roll');
    assert.equal(primaryAxis(surfaces[3]), 'yaw');
});

test('elevon sums pitch and roll and clips at full deflection on both', () => {
    const rules = [rule(SET, 2, 1, 1000), rule(ADD, 1, 1, 1000)];
    const [elevon] = surfacesFromRules(rules, 8);
    assert.equal(elevon.kind, 'elevon');
    assert.equal(primaryAxis(elevon), 'pitch');
    const reach = travelReach(elevon, servo({ max: 450, min: -450 }), gains);
    assert.equal(reach.pos.us, 1000);
    assert.ok(Math.abs(reach.pos.fraction - 1000 / 450) < 1e-9);
    assert.ok(reach.neg.fraction > 2);
});

test('a later SET replaces earlier rules on the same output and axis', () => {
    const rules = [rule(SET, 2, 1, 1000), rule(SET, 2, 1, 600)];
    const [surface] = surfacesFromRules(rules, 8);
    assert.equal(surface.axes.pitch.pos, 0.6);
});

test('differential weights give different reach per side', () => {
    const rules = [rule(SET, 1, 1, 1000, 500)];
    const [aileron] = surfacesFromRules(rules, 8);
    assert.equal(outputForAxis(aileron, 'roll', 1, gains), 1);
    assert.equal(outputForAxis(aileron, 'roll', -1, gains), -0.5);
    const reach = travelReach(aileron, servo(), gains);
    assert.equal(reach.pos.us, 500);
    assert.equal(reach.neg.us, 250);
});

test('servo reverse moves the output to the other side', () => {
    assert.equal(servoSide(0.8, false), 'pos');
    assert.equal(servoSide(0.8, true), 'neg');
    const [aileron] = surfacesFromRules([rule(SET, 1, 1, 1000, 500)], 8);
    const reach = travelReach(aileron, servo({ flags: 1 }), gains);
    assert.equal(reach.pos.us, 250);
    assert.equal(reach.neg.us, 500);
});

test('axis gain scales the reach', () => {
    const [elevator] = surfacesFromRules([rule(SET, 2, 1, 1000)], 8);
    const reach = travelReach(elevator, servo(), { ...gains, pitch: 0.5 });
    assert.equal(reach.pos.fraction, 0.5);
});

test('gain and scale corrections', () => {
    assert.equal(gainForThrow(100, 30, 25), 83);
    assert.equal(gainForThrow(100, 10, 40), 200); // capped at the Mixer tab's 200%
    assert.equal(gainForThrow(100, 0, 25), 100);  // nothing measured, no change
    // full output, inside the limit: plain ratio
    assert.equal(scaleForThrow(500, 1, 20, 15, 700), 375);
    // output 0.83 (gain 83%): ratio is the same, limit is checked at 0.83
    assert.equal(scaleForThrow(500, 0.83, 20, 15, 700), 375);
    // more throw wanted than the limit allows: stops where full output meets the limit
    assert.equal(scaleForThrow(500, 1, 20, 40, 600), 600);
    assert.equal(scaleForThrow(500, 1, 20, 1, 700), 50); // never below the minimum
});

test('scale correction starts from where a clipped servo actually got to', () => {
    // 500 us x 0.83 = 415 us, but the limit is 110 us, so the measured 20 degrees
    // is at 110 us. Wanting 15 degrees means 82.5 us, i.e. scale 99 at 0.83.
    assert.equal(scaleForThrow(500, 0.83, 20, 15, 110), 99);
    // negative-side output is used by magnitude
    assert.equal(scaleForThrow(500, -0.83, 20, 15, 110), 99);
});
