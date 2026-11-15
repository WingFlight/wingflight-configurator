import assert from 'node:assert/strict';
import test from 'node:test';
import { BUS_TRIAL, busTrialEnded, readBusTrial } from '../../src/tabs/setup_wizard/busWiringTrial.js';

// A reply as the app's DataView helpers read it
function reply(bytes) {
    let offset = 0;
    return {
        byteLength: bytes.length,
        readU8: () => bytes[offset++],
        readU16: () => {
            const value = bytes[offset] | (bytes[offset + 1] << 8);
            offset += 2;
            return value;
        },
    };
}

test('a trial reply is decoded in the firmware order', () => {
    // state, combo index, combo count, pin swap, inverted, u16 frames, port open
    const status = readBusTrial(reply([BUS_TRIAL.RUNNING, 2, 4, 1, 0, 0x2c, 0x01, 1]));
    assert.deepEqual(status, {
        state: BUS_TRIAL.RUNNING,
        comboIndex: 2,
        comboCount: 4,
        pinSwap: true,
        inverted: false,
        frames: 300,
        portOpen: true,
    });
});

test('firmware without the trial answers with no payload', () => {
    assert.equal(readBusTrial(reply([])), null);
    assert.equal(readBusTrial(null), null);
    assert.equal(readBusTrial(reply([1, 0, 4, 0, 1, 0, 0])), null);
});

test('only a running trial is polled again', () => {
    assert.equal(busTrialEnded(BUS_TRIAL.RUNNING), false);
    for (const state of [BUS_TRIAL.IDLE, BUS_TRIAL.SUCCESS, BUS_TRIAL.FAILED, BUS_TRIAL.REJECTED]) {
        assert.equal(busTrialEnded(state), true);
    }
});
