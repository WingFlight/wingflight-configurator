import assert from 'node:assert/strict';
import test from 'node:test';
import { gimbalsFromRules, surfacesFromRules } from '../../src/tabs/setup_wizard/surfaces.js';

const SET = 1, ADD = 2;
const rule = (oper, src, dst, weight, weightNeg = weight) => ({ oper, src, dst, weight, weightNeg });
const TV_PITCH = 28, TV_YAW = 29;

test('4D layout A: gimbal pitch on servo 5, rudder servo also tilts the gimbal', () => {
    const rules = [
        rule(SET, 1, 1, 1000), rule(SET, 1, 2, -1000),
        rule(SET, 2, 3, 1000), rule(SET, 3, 4, 1000),
        rule(SET, 4, 27, 1000),          // motor
        rule(SET, TV_PITCH, 5, 1000),    // gimbal pitch
    ];
    assert.deepEqual(gimbalsFromRules(rules, 5), [{ servo: 4, axis: 'pitch', input: TV_PITCH }]);
    // the gimbal servo is not a control surface
    assert.deepEqual(surfacesFromRules(rules, 5).map((s) => s.servo), [0, 1, 2, 3]);
});

test('layout B: separate gimbal yaw servo', () => {
    const rules = [rule(SET, 1, 1, 1000), rule(SET, TV_YAW, 2, 1000), rule(SET, TV_PITCH, 5, 1000)];
    assert.deepEqual(gimbalsFromRules(rules, 5).map((g) => [g.servo, g.axis]), [[1, 'yaw'], [4, 'pitch']]);
});

test('ignores zero-weight rules, motors and servos past the board', () => {
    const rules = [
        rule(SET, TV_PITCH, 5, 0),
        rule(SET, TV_PITCH, 27, 1000),   // a motor output
        rule(ADD, TV_YAW, 9, 1000),      // past servoCount
    ];
    assert.deepEqual(gimbalsFromRules(rules, 5), []);
});
