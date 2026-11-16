import assert from 'node:assert/strict';
import test from 'node:test';
import {
    sameMix, referenceCandidates, mixDirection, holdCommands,
    resampleCurve, servoOutput, nudgeCurvePoint, pointOffsetUs, pointUse,
    commandFromOutput, nearestPoint,
} from '../../src/js/servoBalance.js';
import { ServoBalanceCurve } from '../../src/js/ServoBalanceCurve.js';

const SET = 1, ADD = 2, ROLL = 1, PITCH = 2, FLAP = 13;
const rule = (oper, src, dst, weight, weightNeg = weight) => ({ oper, src, dst, weight, weightNeg });
const servo = (overrides = {}) => ({ mid: 1500, min: -600, max: 600, rneg: 500, rpos: 500, flags: 0, ...overrides });

// Two servos on each aileron: S1+S2 left, S3+S4 right (S4 mirrored in the mix)
const rules = [
    rule(SET, ROLL, 1, 1000), rule(ADD, FLAP, 1, 500),
    rule(SET, ROLL, 2, 1000), rule(ADD, FLAP, 2, 500),
    rule(SET, ROLL, 3, -1000), rule(ADD, FLAP, 3, 500),
    rule(SET, ROLL, 4, 1000), rule(ADD, FLAP, 4, -500),
    rule(SET, PITCH, 5, 1000),
];

test('servos on one surface are found by their mix', () => {
    assert.ok(sameMix(rules, 0, 1));
    // Mirrored in the mix: every weight the other way
    assert.ok(sameMix(rules, 2, 3));
    // Left and right ailerons differ on roll vs flap
    assert.ok(!sameMix(rules, 0, 2));
    assert.ok(!sameMix(rules, 0, 4));
    assert.deepEqual(referenceCandidates(rules, 0, 5), [1]);
    assert.deepEqual(referenceCandidates(rules, 3, 5), [2]);
    // A servo with no rules matches nothing
    assert.deepEqual(referenceCandidates(rules, 7, 8), []);
});

test('the hold follows the mix direction, so mirrored servos never fight', () => {
    assert.equal(mixDirection(rules, 0, 1), 1);
    assert.equal(mixDirection(rules, 3, 2), -1);
    assert.equal(mixDirection(rules, 0, 4), null);
    assert.deepEqual(holdCommands(500, -1), { servo: 500, reference: -500 });
    assert.deepEqual(holdCommands(500, null), { servo: 500, reference: 500 });
});

test('resampling keeps the offsets', () => {
    const tilted = { count: 2, points: [{ x: -1000, y: -40 }, { x: 1000, y: 40 }] };
    const five = resampleCurve(tilted, 5);
    assert.equal(five.count, 5);
    assert.equal(five.points.length, ServoBalanceCurve.POINT_COUNT);
    assert.deepEqual(five.points.slice(0, 5).map((p) => [p.x, p.y]),
        [[-1000, -40], [-500, -20], [0, 0], [500, 20], [1000, 40]]);
    assert.deepEqual(resampleCurve(null, 9).points.slice(0, 9).map((p) => p.y), [0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('a nudge moves the output at that point by that much', () => {
    for (const flags of [0, 1]) {
        const config = servo({ flags, rpos: 400, rneg: 600 });
        const curve = resampleCurve(null, 9);
        for (let i = 0; i < 9; i++) {
            const x = curve.points[i].x;
            const before = servoOutput(config, curve, x);
            assert.ok(nudgeCurvePoint(config, curve, i, 10));
            const after = servoOutput(config, curve, x);
            // Rounded to whole curve steps
            assert.ok(Math.abs(after - before - 10) <= 1, `point ${i} flags ${flags}: ${after - before}`);
            assert.ok(Math.abs(pointOffsetUs(config, curve, i) - 10) <= 1);
        }
    }
});

test('a nudge only moves its own point', () => {
    const config = servo();
    const curve = resampleCurve(null, 5);
    nudgeCurvePoint(config, curve, 3, 15);
    assert.deepEqual(curve.points.slice(0, 5).map((p) => p.y), [0, 0, 0, 30, 0]);
});

test('the live position is worked back from the output pulse', () => {
    const config = servo({ rpos: 400, rneg: 600 });
    assert.equal(commandFromOutput(config, 1700), 500);
    assert.equal(commandFromOutput(config, 1200), -500);
    assert.equal(commandFromOutput(servo({ flags: 1 }), 1750), -500);
    assert.equal(commandFromOutput(config, 1520, 20), 0);
    assert.equal(commandFromOutput(config, 2500), 1000);
    const curve = resampleCurve(null, 5);
    assert.equal(nearestPoint(curve, 300), 3);
    assert.equal(nearestPoint(curve, -900), 0);
});

test('a point at the limit of the curve stops there', () => {
    const config = servo();
    const curve = resampleCurve(null, 2);
    curve.points[1].y = ServoBalanceCurve.Y_MAX;
    assert.equal(nudgeCurvePoint(config, curve, 1, 5), false);
    assert.equal(pointUse(curve, 1), 1);
    // A tiny nudge still moves an unlimited point one step
    assert.ok(nudgeCurvePoint(config, curve, 0, 0.1));
    assert.equal(curve.points[0].y, 1);
});
