import assert from 'node:assert/strict';
import test from 'node:test';
import {
    readReverseFlightConfig,
    readReverseFlightStatus,
    writeReverseFlightConfig,
    motorMaskForThrottleMode,
    escNeutralPulse,
    THROTTLE_MODE_BIDIRECTIONAL,
    THROTTLE_MODE_NORMAL,
} from '../../src/js/ReverseFlight.js';

function reader(bytes) {
    let offset = 0;
    const next = () => bytes[offset++];
    return {
        byteLength: bytes.length,
        readU8: next,
        read8: () => (next() << 24) >> 24,
        readU16: () => next() | (next() << 8),
        read16: () => ((next() | (next() << 8)) << 16) >> 16,
    };
}
function encode(config) {
    const bytes = [];
    const buffer = {
        push8(value) { bytes.push(value & 0xff); return buffer; },
        push16(value) { bytes.push(value & 0xff, (value >> 8) & 0xff); return buffer; },
    };
    writeReverseFlightConfig(buffer, config);
    return bytes;
}

// MSP2_WING_REVERSE_FLIGHT_CONFIG as msp.c writes it (firmware defaults, bidirectional,
// yaw coupled, neutral 1500, one motor bidirectional, one motor)
const CONFIG_REPLY = [
    1,                  // payload version
    1, 40, 50, 100,     // mode, deadband, hysteresis, reverse limit
    80, 0, 144, 1,      // motor time 80, time constant 400
    100, 0,             // surface gain 100
    15, 0, 4,           // fade, dwell, coupled axes (yaw)
    220, 5,             // neutral 1500
    1, 1,               // motor mask, motor count
];

test('empty reply from older firmware hides the feature', () => {
    assert.equal(readReverseFlightConfig(reader([])), null);
    assert.equal(readReverseFlightStatus(reader([])), null);
});

test('config reply decodes in firmware order', () => {
    const config = readReverseFlightConfig(reader(CONFIG_REPLY));
    assert.deepEqual(config, {
        throttle_mode: THROTTLE_MODE_BIDIRECTIONAL,
        throttle_deadband: 40,
        throttle_reverse_hysteresis: 50,
        throttle_reverse_limit: 100,
        reverse_motor_time: 80,
        reverse_time_constant: 400,
        reverse_surface_gain: 100,
        reverse_fade: 15,
        reverse_motor_dwell: 0,
        reverse_coupled_axes: 4,
        throttle_neutral: 1500,
        motor_bidir_mask: 1,
        motor_count: 1,
    });
});

test('set payload is the 14 bytes msp.c expects', () => {
    const config = readReverseFlightConfig(reader(CONFIG_REPLY));
    const bytes = encode(config);
    assert.equal(bytes.length, 14);
    // the read without version, neutral and motor count
    assert.deepEqual(bytes, [...CONFIG_REPLY.slice(1, 14), 1]);
});

test('status reply decodes signed values', () => {
    const s16 = (v) => [v & 0xff, (v >> 8) & 0xff];
    const status = readReverseFlightStatus(reader([
        1, 1, 5, 0xff, 0,     // version, enabled, state handover, direction -1, not in deadband
        ...s16(1138),         // throttle channel
        ...s16(-700), ...s16(-700), ...s16(250), ...s16(400),
        ...s16(1000), ...s16(0),
    ]));
    assert.equal(status.enabled, true);
    assert.equal(status.state, 5);
    assert.equal(status.direction, -1);
    assert.equal(status.stickInDeadband, false);
    assert.equal(status.throttleChannel, 1138);
    assert.equal(status.motorCommand, -0.7);
    assert.equal(status.thrustEstimate, 0.25);
    assert.equal(status.vectorFactor, 1);
    assert.equal(status.surfaceFactor, 0);
});

test('bidirectional throttle sets every motor bidirectional', () => {
    assert.equal(motorMaskForThrottleMode(THROTTLE_MODE_BIDIRECTIONAL, 1), 0b1);
    assert.equal(motorMaskForThrottleMode(THROTTLE_MODE_BIDIRECTIONAL, 2), 0b11);
    assert.equal(motorMaskForThrottleMode(THROTTLE_MODE_NORMAL, 2), 0);
});

test('ESC neutral is the middle of the motor range', () => {
    assert.equal(escNeutralPulse({ minthrottle: 1070, maxthrottle: 2000 }), 1535);
    assert.equal(escNeutralPulse({ minthrottle: 1000, maxthrottle: 2000 }), 1500);
});
