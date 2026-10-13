import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    fbusMuxModeCommands,
    fbusMuxSerialIdentifier,
    findFbusMuxIssues,
    isDshotChannel,
    isFbusMuxSerialPort,
    parseFbusMuxPrerequisites,
    readFbusMuxConfig,
} from '../../src/js/FbusMux.js';
import {
    buildDesignOrder,
    buildHiddenPins,
    buildMuxChannelPins,
    buildReferenceLabels,
    buildReservedPins,
} from '../../src/js/remap_fc/reference_design_labels.js';

function reader(bytes) {
    let offset = 0;
    return {
        remaining: () => bytes.length - offset,
        readU8: () => bytes[offset++],
        readU32: () => {
            const value = bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24;
            offset += 4;
            return value >>> 0;
        },
    };
}

// MSP2_WING_FBUS_MUX_CONFIG as read from an RF007 V3 with ch2-4 on FBUS
const RF007V3_REPLY = [1, 5, 0x18, 6, 4, 0x01, 0x01, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];

test('decodes the mux config reply', () => {
    const mux = readFbusMuxConfig(reader(RF007V3_REPLY));
    assert.deepEqual(mux, {
        dshotMask: 0x18,
        serialPort: 6,
        status: 'READY',
        modeWord: 0x101,
        channels: [
            { mode: 'PWM', activeMode: 'PWM' },
            { mode: 'FBUS', activeMode: 'FBUS' },
            { mode: 'FBUS', activeMode: 'FBUS' },
            { mode: 'FBUS', activeMode: 'FBUS' },
            { mode: 'PWM', activeMode: 'PWM' },
        ],
        overrideActive: false,
    });
    assert.equal(isDshotChannel(mux, 4), true);
    assert.equal(isDshotChannel(mux, 5), true);
    assert.equal(isDshotChannel(mux, 1), false);
});

test('reports a held override, and none on a reply without the flag', () => {
    const held = [...RF007V3_REPLY.slice(0, 19), 1];
    assert.equal(readFbusMuxConfig(reader(held)).overrideActive, true);
    assert.equal(readFbusMuxConfig(reader(RF007V3_REPLY.slice(0, 19))).overrideActive, false);
});

test('an empty or short reply means no mux', () => {
    assert.equal(readFbusMuxConfig(reader([])), null);
    assert.equal(readFbusMuxConfig(reader(RF007V3_REPLY.slice(0, 8))), null);
    assert.equal(fbusMuxSerialIdentifier(null), null);
});

test('the FPGA configuration UART maps to its MSP port identifier', () => {
    const mux = readFbusMuxConfig(reader(RF007V3_REPLY));
    assert.equal(fbusMuxSerialIdentifier(mux), 5); // UART6
    assert.equal(isFbusMuxSerialPort(mux, { identifier: 5 }), true);
    assert.equal(isFbusMuxSerialPort(mux, { identifier: 0 }), false);
    assert.equal(isFbusMuxSerialPort(null, { identifier: 5 }), false);
    assert.equal(isFbusMuxSerialPort({ ...mux, serialPort: 0 }, { identifier: 0 }), false);
});

test('only changed channels become set commands', () => {
    assert.deepEqual(
        fbusMuxModeCommands(['PWM', 'FBUS', 'FBUS', 'FBUS', 'PWM'], ['PWM', 'FBUS', 'PWM', 'FBUS', 'DSHOT']),
        ['set fbus_mux_ch3_mode = PWM', 'set fbus_mux_ch5_mode = DSHOT'],
    );
    assert.deepEqual(fbusMuxModeCommands(['PWM'], ['PWM']), []);
});

const CLI_OUTPUT = [
    '# dump hardware',
    'resource MOTOR 1 A08',
    'resource FBUS_MASTER_SEND 1 C08',
    '# get motor_pwm_protocol',
    'motor_pwm_protocol = DSHOT300',
    'Allowed values: PWM, ONESHOT125, ONESHOT42, MULTISHOT, BRUSHED, DSHOT150, DSHOT300, DSHOT600, PROSHOT1000, DISABLED',
    '',
    '# get dshot_bidir',
    'dshot_bidir = OFF',
    'Allowed values: OFF, ON',
    '',
    '# serial',
    'serial 20 1 115200 57600 0 115200',
    'serial 0 524288 115200 57600 0 115200',
    'serial 4 64 115200 57600 0 115200',
].join('\r\n');

test('reads the mux prerequisites from the CLI output', () => {
    assert.deepEqual(parseFbusMuxPrerequisites(CLI_OUTPUT), {
        motorProtocol: 'DSHOT300',
        dshotBidir: false,
        fbusMasterPort: true,
        sendPinAssigned: true,
    });
    const without = parseFbusMuxPrerequisites(
        CLI_OUTPUT.replace('resource FBUS_MASTER_SEND 1 C08', 'resource FBUS_MASTER_SEND 1 NONE')
            .replace('serial 0 524288', 'serial 0 0'),
    );
    assert.equal(without.sendPinAssigned, false);
    assert.equal(without.fbusMasterPort, false);
});

const CHANNEL_PINS = { 1: 'B04', 2: 'B05', 3: 'B00', 4: 'B03', 5: 'A08' };
const HARDWARE = {
    M1: { pin: 'A08' }, S1: { pin: 'B04' }, S2: { pin: 'B05' }, S3: { pin: 'B00' }, S4: { pin: 'B03' },
};
const READY = { motorProtocol: 'DSHOT600', dshotBidir: true, fbusMasterPort: true, sendPinAssigned: true };

test('no issues when every mode can run', () => {
    assert.deepEqual(findFbusMuxIssues(['PWM', 'FBUS', 'FBUS', 'PWM', 'DSHOT'], CHANNEL_PINS, HARDWARE, READY), []);
});

test('FBUS needs the master port and the send pin', () => {
    const issues = findFbusMuxIssues(['PWM', 'FBUS', 'PWM', 'PWM', 'PWM'], CHANNEL_PINS, HARDWARE,
        { ...READY, fbusMasterPort: false, sendPinAssigned: false });
    assert.deepEqual(issues.map((i) => i.issue), ['fbusNeedsMasterPort', 'fbusNeedsSendPin']);
    assert.equal(issues[0].channel, 2);
    assert.equal(issues[0].pin, 'B05');
});

test('DShot needs bidirectional DShot300/600 and a motor on the pin', () => {
    const modes = ['PWM', 'PWM', 'PWM', 'DSHOT', 'DSHOT'];
    assert.deepEqual(
        findFbusMuxIssues(modes, CHANNEL_PINS, HARDWARE, { ...READY, motorProtocol: 'DSHOT150' })
            .map((i) => `${i.channel}:${i.issue}`),
        ['4:dshotNeedsBidirProtocol', '4:dshotNeedsMotor', '5:dshotNeedsBidirProtocol'],
    );
    // TAIL remapped to a second motor
    const remapped = { ...HARDWARE, M2: { pin: 'B03' } };
    delete remapped.S4;
    assert.deepEqual(findFbusMuxIssues(modes, CHANNEL_PINS, remapped, READY), []);
    assert.equal(findFbusMuxIssues(modes, CHANNEL_PINS, remapped, { ...READY, dshotBidir: false }).length, 2);
});

const designs = {
    ...JSON.parse(readFileSync(new URL('../../src/tabs/remap_fc/reference_designs.json', import.meta.url))),
    ...JSON.parse(readFileSync(new URL('../../src/tabs/remap_fc/manufacturer_designs.json', import.meta.url))),
};

test('the RF007 V3 uses its own pinout, not the RF007 or F7B one', () => {
    const labels = buildReferenceLabels(designs, 'F7B5M', 'VANTAC_RF007V3');
    assert.equal(labels.A08, 'ESC');
    assert.equal(labels.B03, 'TAIL');
    assert.equal(labels.C04, 'Gyro INT');
    assert.equal(labels.A09, 'FBUS Mux Tx');
    assert.equal(labels.A15, 'FPGA CS');
    assert.equal(labels.B01, undefined); // F7B's Servo 4

    const reserved = buildReservedPins(designs, 'F7B5M', 'VANTAC_RF007V3');
    assert.equal(reserved.has('A08'), false); // ESC, F7B's "Gyro INT"
    assert.equal(reserved.has('C04'), true);

    const hidden = buildHiddenPins(designs, 'F7B5M', 'VANTAC_RF007V3');
    for (const pin of ['A09', 'A10', 'C06', 'C07', 'C08', 'A15', 'C09', 'C03']) {
        assert.equal(hidden.has(pin), true, pin);
    }
});

test('the RF007 V3 maps its mux channels to S1, S2, S3, TAIL and ESC', () => {
    assert.deepEqual(buildMuxChannelPins(designs, 'VANTAC_RF007V3'), CHANNEL_PINS);
    assert.deepEqual(buildMuxChannelPins(designs, 'VANTAC_RF007'), {});
    const order = buildDesignOrder(designs, 'F7B5M', 'VANTAC_RF007V3', HARDWARE);
    assert.deepEqual(order, ['S1', 'S2', 'S3', 'S4', 'M1']);
});

test('the RF007 keeps merging its F7B family', () => {
    const labels = buildReferenceLabels(designs, 'F7B5', 'VANTAC_RF007');
    assert.equal(labels.A09, 'ESC');
    assert.equal(buildReservedPins(designs, 'F7B5', 'VANTAC_RF007').has('A08'), true);
});
