import assert from 'node:assert/strict';
import test from 'node:test';
import { readPropHang, writePropHang } from '../../src/js/PropHang.js';

function decode(bytes, profile = { hasSnapRelax: true }) {
    let offset = 0;
    const next = () => bytes[offset++];
    readPropHang({
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
    writePropHang(buffer, profile);
    return bytes;
}

test('old and truncated replies do not enable or write prop-hang relax', () => {
    for (const bytes of [[], [100], [100, 20, 244]]) {
        const profile = decode(bytes);
        assert.equal(profile.hasPropHang, false);
        assert.deepEqual(encode(profile), []);
    }
});
test('needs the snap relax tail before it', () => {
    const profile = decode([100, 20, 244, 1], { hasSnapRelax: false });
    assert.equal(profile.hasPropHang, false);
    assert.deepEqual(encode(profile), []);
});
test('new reply round-trips in firmware order', () => {
    const profile = decode([100, 20, 244, 1]);
    assert.equal(profile.hasPropHang, true);
    assert.equal(profile.propHangStrength, 100);
    assert.equal(profile.propHangAngle, 20);
    assert.equal(profile.propHangFade, 500);
    assert.deepEqual(encode(profile), [100, 20, 244, 1]);
});
