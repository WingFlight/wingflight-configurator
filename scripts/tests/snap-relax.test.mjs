import assert from 'node:assert/strict';
import test from 'node:test';
import { readSnapRelax, writeSnapRelax } from '../../src/js/SnapRelax.js';

function decode(bytes, profile = { hasLevelDamping: true }) {
    let offset = 0;
    const next = () => bytes[offset++];
    readSnapRelax({
        remaining: () => bytes.length - offset,
        readU8: next,
        readU16: () => next() | (next() << 8),
    }, profile);
    return profile;
}
function encode(profile) {
    const bytes = [];
    const buffer = {
        push8(value) { bytes.push(value & 0xff); return buffer; },
        push16(value) { bytes.push(value & 0xff, (value >> 8) & 0xff); return buffer; },
    };
    writeSnapRelax(buffer, profile);
    return bytes;
}

test('old and truncated replies do not enable or write snap relax', () => {
    for (const bytes of [[], [100], [100, 60, 144, 1, 150]]) {
        const profile = decode(bytes);
        assert.equal(profile.hasSnapRelax, false);
        assert.deepEqual(encode(profile), []);
    }
});
test('needs the level damping byte before it', () => {
    const profile = decode([100, 60, 144, 1, 150, 0], { hasLevelDamping: false });
    assert.equal(profile.hasSnapRelax, false);
    assert.deepEqual(encode(profile), []);
});
test('new reply round-trips in firmware order', () => {
    const profile = decode([100, 60, 144, 1, 150, 0]);
    assert.equal(profile.hasSnapRelax, true);
    assert.equal(profile.snapRelaxStrength, 100);
    assert.equal(profile.snapRelaxThreshold, 60);
    assert.equal(profile.snapRelaxWindow, 400);
    assert.equal(profile.snapRelaxHold, 150);
    assert.deepEqual(encode(profile), [100, 60, 144, 1, 150, 0]);
});
