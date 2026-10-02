import assert from 'node:assert/strict';
import test from 'node:test';
import { readAttitudeLimits, writeAttitudeLimits } from '../../src/js/AttitudeLimits.js';

function decode(bytes, profile = { levelAngleLimit: 55, acroTrainerLimit: 20 }) {
    let offset = 0;
    readAttitudeLimits({ remaining: () => bytes.length - offset, readU8: () => bytes[offset++] }, profile);
    return profile;
}
function encode(profile) {
    const bytes = [];
    writeAttitudeLimits({ push8: value => bytes.push(value) }, profile);
    return bytes;
}

test('old and truncated replies do not enable or write axis controls', () => {
    for (const bytes of [[], [30], [30, 40], [30, 40, 50]]) {
        const profile = decode(bytes);
        assert.equal(profile.hasAxisLimits, false);
        assert.equal(profile.trainerRollLimit, 20);
        assert.deepEqual(encode(profile), []);
    }
});
test('new reply preserves axis order and unrelated profile settings', () => {
    const profile = decode([60, 25, 45, 20]);
    assert.equal(profile.hasAxisLimits, true);
    assert.equal(profile.angleRollLimit, 60);
    assert.equal(profile.anglePitchLimit, 25);
    assert.equal(profile.trainerRollLimit, 45);
    assert.equal(profile.trainerPitchLimit, 20);
    assert.equal(profile.levelAngleLimit, 55);
    assert.deepEqual(encode(profile), [60, 25, 45, 20]);
});
test('untouched inherited limits round-trip zero; editing one axis changes only it', () => {
    const profile = decode([0, 0, 0, 0]);
    assert.equal(profile.angleRollLimit, 55);
    assert.equal(profile.trainerPitchLimit, 20);
    assert.deepEqual(encode(profile), [0, 0, 0, 0]);
    profile.trainerRollLimit = 60;
    assert.deepEqual(encode(profile), [0, 0, 60, 0]);
});
test('effective bounds agree with firmware without silently rewriting stored values', () => {
    const profile = decode([255, 255, 1, 1]);
    assert.equal(profile.angleRollLimit, 90);
    assert.equal(profile.anglePitchLimit, 75);
    assert.equal(profile.trainerRollLimit, 10);
    assert.equal(profile.trainerPitchLimit, 10);
    assert.deepEqual(encode(profile), [255, 255, 1, 1]);
});
test('reconnecting to old firmware clears capability and stale limits', () => {
    const profile = decode([60, 25, 45, 20]);
    decode([], profile);
    assert.equal(profile.hasAxisLimits, false);
    assert.equal(profile.trainerRollLimit, 20);
    assert.deepEqual(encode(profile), []);
});
