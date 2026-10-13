import assert from 'node:assert/strict';
import test from 'node:test';
import {
    AUTO_PROGRAM_PLAN,
    autoProgramValues,
    buildMuxOverridePayload,
    fbusChannels,
    isolateChannelModes,
    otherDevicePhysicalIds,
    planAutoProgram,
} from '../../src/tabs/xact_servo/mux_programming.js';

// FC.FBUS_MUX of an RF007 V3 with S2, S3 and TAIL saved as FBUS and DSHOT on the ESC
const MUX = {
    channels: ['PWM', 'FBUS', 'FBUS', 'FBUS', 'DSHOT'].map((mode) => ({ mode, activeMode: mode })),
};

test('auto-programming visits the outputs saved as FBUS', () => {
    assert.deepEqual(fbusChannels(MUX), [2, 3, 4]);
    assert.deepEqual(fbusChannels(null), []);
});

test('FBUS goes on one output only, the other outputs keep their saved mode or leave FBUS', () => {
    assert.deepEqual(isolateChannelModes(MUX, 3), [0, 0, 1, 0, 2]);
    assert.deepEqual(isolateChannelModes(MUX, 1), [1, 0, 0, 0, 2]);
});

test('override payload', () => {
    assert.deepEqual(buildMuxOverridePayload(3000, [1, 0, 0, 0, 0]), [0xb8, 0x0b, 5, 1, 0, 0, 0, 0]);
    assert.deepEqual(buildMuxOverridePayload(0), [0, 0]);
});

// MSP2_WING_FBUS_SENSORS as read with FBUS on S1 of the bench unit: a GPS and an XACT servo
// (the stale entry under its Physical ID before it was renamed)
const SENSORS = [
    { physicalId: 3, name: 'GPS', appIds: [0x800, 0x820, 0x830, 0x850] },
    { physicalId: 14, name: 'XACT_SERVO', appIds: [0x6802] },
];

test('other devices are everything that is not an XACT servo', () => {
    assert.deepEqual([...otherDevicePhysicalIds(SENSORS)], [3]);
});

const factoryServo = (physicalId = 14) => ({
    physicalId, appIdOffset: 2, channel: 2, range: 1, conflict: false, duplicateAppId: false,
});

test('plans the fixed values per output and leaves the ESC alone', () => {
    const plan = planAutoProgram([
        { channel: 1, servos: [factoryServo()] },
        { channel: 2, servos: [] },
        { channel: 4, servos: [{ ...factoryServo(), physicalId: 4, appIdOffset: 3, channel: 3, range: 0 }] },
        { channel: 5, servos: [] },
    ], new Set());
    assert.deepEqual(plan.map((e) => e.status), ['program', 'noServo', 'unchanged', 'notPlanned']);
    assert.deepEqual(plan[0].target, { physicalId: 1, appIdOffset: 0, channel: 0 });
});

test('servos that cannot be told apart are skipped', () => {
    const plan = planAutoProgram([
        { channel: 1, servos: [factoryServo(), factoryServo(15)] },
        { channel: 2, servos: [{ ...factoryServo(), conflict: true }] },
        { channel: 3, servos: [{ ...factoryServo(), duplicateAppId: true }] },
    ], new Set());
    assert.deepEqual(plan.map((e) => e.status), ['multipleServos', 'multipleServos', 'multipleServos']);
});

test('a target Physical ID used by another device on the bus is skipped', () => {
    // The GPS has Physical ID 3, S3's target
    const plan = planAutoProgram([
        { channel: 1, servos: [factoryServo()] },
        { channel: 3, servos: [factoryServo()] },
    ], otherDevicePhysicalIds(SENSORS));
    assert.deepEqual(plan.map((e) => e.status), ['program', 'idClash']);
});

test('a servo that keeps its IDs on the ESC output blocks the same IDs', () => {
    const plan = planAutoProgram([
        { channel: 2, servos: [factoryServo()] },
        { channel: 5, servos: [{ ...factoryServo(), physicalId: 2, appIdOffset: 9 }] },
    ], new Set());
    assert.equal(plan[0].status, 'idClash');
});

test('the written values change only ID, App ID, channel and range', () => {
    const params = { ...factoryServo(), dataRate: 1000, direction: 1, center: -5, holdingStrength: 4 };
    assert.deepEqual(autoProgramValues(params, AUTO_PROGRAM_PLAN[2]), {
        ...params, physicalId: 2, appIdOffset: 1, channel: 1, range: 0,
    });
});
