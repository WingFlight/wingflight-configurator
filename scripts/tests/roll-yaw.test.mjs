import assert from 'node:assert/strict';
import test from 'node:test';
import { readRollYaw, writeRollYaw } from '../../src/js/RollYaw.js';

function decode(bytes, profile = { hasPropHang: true }) {
    let offset = 0;
    readRollYaw({
        remaining: () => bytes.length - offset,
        readU8: () => bytes[offset++],
    }, profile);
    return profile;
}
function encode(profile) {
    const bytes = [];
    const buffer = {
        push8(value) { bytes.push(value & 0xff); return buffer; },
    };
    writeRollYaw(buffer, profile);
    return bytes;
}

test('old replies do not enable or write roll-yaw coupling', () => {
    const profile = decode([]);
    assert.equal(profile.hasRollYaw, false);
    assert.deepEqual(encode(profile), []);
});
test('needs the prop-hang relax tail before it', () => {
    const profile = decode([23], { hasPropHang: false });
    assert.equal(profile.hasRollYaw, false);
    assert.deepEqual(encode(profile), []);
});
test('positive and negative values round-trip as a signed byte', () => {
    for (const [byte, value] of [[0, 0], [23, 23], [100, 100], [233, -23], [156, -100]]) {
        const profile = decode([byte]);
        assert.equal(profile.hasRollYaw, true);
        assert.equal(profile.rollYawCoupling, value);
        assert.deepEqual(encode(profile), [byte]);
    }
});
