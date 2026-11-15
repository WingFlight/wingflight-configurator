import assert from 'node:assert/strict';
import test from 'node:test';
import {
    SRXL2_ESC_FUNCTION,
    clearSrxl2Port, needsSerialPort, setSrxl2Port, srxl2Port, telemetryForProtocol,
} from '../../src/tabs/setup_wizard/escSerial.js';

const SERIAL_RX = 64;
const ESC_SENSOR = 1024;
// Index of SRXL2 in the ESC telemetry protocol list
const SRXL2_TELEMETRY = 14;
const makePorts = (masks = [0, 0, 0]) => masks.map((functionMask, identifier) => ({ identifier, functionMask }));

test('only SRXL2 takes its signal on a serial port', () => {
    assert.equal(needsSerialPort('SRXL2'), true);
    // Castle Link is a PWM signal on the motor output
    assert.equal(needsSerialPort('CASTLE'), false);
    assert.equal(needsSerialPort('PWM'), false);
    assert.equal(needsSerialPort('DSHOT300'), false);
    assert.equal(needsSerialPort(undefined), false);
});

test('the function bit matches the firmware', () => {
    assert.equal(SRXL2_ESC_FUNCTION, 2097152);
});

test('the SRXL2 ESC moves between free ports', () => {
    const ports = makePorts([0, SERIAL_RX, 0]);
    assert.equal(srxl2Port(ports), null);

    assert.equal(setSrxl2Port(ports, ports[0]), true);
    assert.equal(srxl2Port(ports), ports[0]);

    // Choosing the same port again keeps it
    assert.equal(setSrxl2Port(ports, ports[0]), true);
    assert.deepEqual(ports.map((p) => p.functionMask), [SRXL2_ESC_FUNCTION, SERIAL_RX, 0]);

    // Another free port: the old one is released
    assert.equal(setSrxl2Port(ports, ports[2]), true);
    assert.deepEqual(ports.map((p) => p.functionMask), [0, SERIAL_RX, SRXL2_ESC_FUNCTION]);
});

test('a port in use is never taken', () => {
    const ports = makePorts([SRXL2_ESC_FUNCTION, SERIAL_RX, ESC_SENSOR]);
    assert.equal(setSrxl2Port(ports, ports[1]), false);
    assert.equal(setSrxl2Port(ports, ports[2]), false);
    assert.equal(setSrxl2Port(ports, null), false);
    assert.deepEqual(ports.map((p) => p.functionMask), [SRXL2_ESC_FUNCTION, SERIAL_RX, ESC_SENSOR]);
});

test('clearing takes SRXL2 off and leaves other functions', () => {
    const ports = makePorts([SRXL2_ESC_FUNCTION, SERIAL_RX, 0]);
    assert.equal(clearSrxl2Port(ports), true);
    assert.deepEqual(ports.map((p) => p.functionMask), [0, SERIAL_RX, 0]);
    assert.equal(clearSrxl2Port(ports), false);

    // A port with no functionMask yet (the Virtual FC's USB port)
    assert.equal(clearSrxl2Port([{ identifier: 20 }]), false);
    assert.equal(srxl2Port([{ identifier: 20 }]), null);
});

test('a change between ordinary protocols leaves ESC telemetry alone', () => {
    assert.equal(telemetryForProtocol('PWM', 'DSHOT300', 1, SRXL2_TELEMETRY), null);
    assert.equal(telemetryForProtocol('DSHOT300', 'DISABLED', 0, SRXL2_TELEMETRY), null);
    assert.equal(telemetryForProtocol('CASTLE', 'CASTLE', 0, SRXL2_TELEMETRY), null);
});

test('SRXL2 brings its own telemetry, on half duplex', () => {
    assert.deepEqual(telemetryForProtocol('PWM', 'SRXL2', 1, SRXL2_TELEMETRY), {
        protocol: SRXL2_TELEMETRY,
        feature: true,
        halfDuplex: true,
    });
    // With no protocol to come from (SRXL2 saved, its port missing)
    assert.equal(telemetryForProtocol(undefined, 'SRXL2', 0, SRXL2_TELEMETRY).feature, true);
    // Firmware without SRXL2 telemetry in its list
    assert.deepEqual(telemetryForProtocol('PWM', 'SRXL2', 1, -1), { protocol: 0, feature: false, halfDuplex: true });
});

test('Castle Link turns the ESC sensor on with no serial protocol', () => {
    assert.deepEqual(telemetryForProtocol('PWM', 'CASTLE', 3, SRXL2_TELEMETRY), { protocol: 0, feature: true });
    assert.deepEqual(telemetryForProtocol('SRXL2', 'CASTLE', SRXL2_TELEMETRY, SRXL2_TELEMETRY), {
        protocol: 0,
        feature: true,
    });
});

test('leaving SRXL2 or Castle Link puts ESC telemetry back', () => {
    // SRXL2 telemetry goes with its bus
    assert.deepEqual(telemetryForProtocol('SRXL2', 'PWM', SRXL2_TELEMETRY, SRXL2_TELEMETRY), {
        protocol: 0,
        feature: false,
    });
    // Castle had no serial protocol
    assert.deepEqual(telemetryForProtocol('CASTLE', 'DSHOT300', 0, SRXL2_TELEMETRY), { protocol: 0, feature: false });
    // A serial ESC telemetry protocol that was set stays, with its feature
    assert.deepEqual(telemetryForProtocol('CASTLE', 'PWM', 3, SRXL2_TELEMETRY), { protocol: 3, feature: true });
});
