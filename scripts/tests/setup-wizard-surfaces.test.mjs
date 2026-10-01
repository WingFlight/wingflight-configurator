import assert from 'node:assert/strict';
import test from 'node:test';
import {
    surfacesFromRules, primaryAxis, outputForAxis, servoSide,
    travelReach, maxScale,
} from '../../src/tabs/setup_wizard/surfaces.js';
import { STYLES, applyStyle, matchingStyle } from '../../src/tabs/setup_wizard/styles.js';

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

test('largest scale that keeps full stick inside the binding limit', () => {
    assert.equal(maxScale(1, 700), 700);
    // axis gain 83%: full stick is output 0.83, so the scale may be larger
    assert.equal(maxScale(0.83, 700), 843);
    assert.equal(maxScale(-0.83, 700), 843); // either side, by magnitude
    assert.equal(maxScale(0.5, 700), 1000);  // never past the servo travel limit
    assert.equal(maxScale(1, 20), 50);       // never below the minimum
    assert.equal(maxScale(0, 700), 1000);    // axis gain 0: nothing to limit
});

test('flying styles set rates and I-term relax, and are recognised afterwards', () => {
    const rcTuning = {};
    const pidProfile = {};
    for (const axis of ['roll', 'pitch', 'yaw']) {
        rcTuning[`${axis}_rc_rate`] = 0.5;
        rcTuning[`${axis}_rc_expo`] = 0;
    }
    assert.equal(matchingStyle(rcTuning, pidProfile), null);

    const threeD = STYLES.find((s) => s.key === '3d');
    applyStyle(threeD, rcTuning, pidProfile);
    assert.equal(rcTuning.roll_rc_rate, 1);    // 500 deg/s, stored as deg/s / 500
    assert.equal(rcTuning.yaw_rc_expo, 0.6);
    assert.equal(pidProfile.bouncebackPitch, 7);
    assert.equal(pidProfile.itermRelaxLevelYaw, 15);
    assert.equal(matchingStyle(rcTuning, pidProfile).key, '3d');

    rcTuning.yaw_rc_rate = 0.7; // edited on the Rates tab: no longer a preset
    assert.equal(matchingStyle(rcTuning, pidProfile), null);
});
