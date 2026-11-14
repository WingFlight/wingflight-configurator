import assert from 'node:assert/strict';
import test from 'node:test';
import {
    FBUS_OUT_FUNCTION, SBUS_OUT_FUNCTION,
    busPort, busProtocol, clearBusOutput, needsPinSwap, recommendedPort,
    sbusConnectorIdentifier, setBusOutput,
} from '../../src/tabs/setup_wizard/busOutput.js';

const SERIAL_RX = 64;
// F7B5 / F7C5 (RF007, Nexus X): UART1 is the SBUS connector
const NAMES = { 0: 'S.BUS', 1: 'TELEM', 2: 'Port C' };
const makePorts = (masks = [0, 0, 0]) => masks.map((functionMask, identifier) => ({ identifier, functionMask }));

test('the SBUS connector is found by its name', () => {
    assert.equal(sbusConnectorIdentifier(NAMES), 0);
    assert.equal(sbusConnectorIdentifier({ 0: 'DSM', 1: 'S.BUS' }), 1);
    assert.equal(sbusConnectorIdentifier({ 2: 'RX', 3: 'C1' }), null);
    assert.equal(sbusConnectorIdentifier(undefined), null);
});

test('F.Bus needs the pin swap only on the SBUS connector', () => {
    const ports = makePorts();
    assert.equal(needsPinSwap(NAMES, ports[0]), true);
    assert.equal(needsPinSwap(NAMES, ports[2]), false);
    assert.equal(needsPinSwap(undefined, ports[0]), false);
    assert.equal(needsPinSwap(NAMES, null), false);
});

test('the SBUS connector is offered first when it is free', () => {
    assert.equal(recommendedPort(makePorts(), NAMES).identifier, 0);
    assert.equal(recommendedPort(makePorts([SERIAL_RX, 0, 0]), NAMES), null);
    assert.equal(recommendedPort(makePorts(), NAMES, (port) => port.identifier === 0), null);
    assert.equal(recommendedPort(makePorts(), { 2: 'RX' }), null);
});

test('a bus output moves between ports and protocols', () => {
    const ports = makePorts([0, SERIAL_RX, 0]);
    assert.equal(busProtocol(ports), null);
    assert.equal(busPort(ports), null);

    assert.equal(setBusOutput(ports, ports[0], 'fbus'), true);
    assert.equal(busProtocol(ports), 'fbus');
    assert.equal(busPort(ports), ports[0]);

    // Same port, other protocol
    assert.equal(setBusOutput(ports, ports[0], 'sbus'), true);
    assert.equal(ports[0].functionMask, SBUS_OUT_FUNCTION);
    assert.equal(busProtocol(ports), 'sbus');

    // Another free port: the old one is released
    assert.equal(setBusOutput(ports, ports[2], 'fbus'), true);
    assert.deepEqual(ports.map((p) => p.functionMask), [0, SERIAL_RX, FBUS_OUT_FUNCTION]);
});

test('a port in use is never taken, and clearing leaves other functions', () => {
    const ports = makePorts([0, SERIAL_RX, FBUS_OUT_FUNCTION]);
    assert.equal(setBusOutput(ports, ports[1], 'fbus'), false);
    assert.equal(setBusOutput(ports, ports[0], 'crsf'), false);
    assert.deepEqual(ports.map((p) => p.functionMask), [0, SERIAL_RX, FBUS_OUT_FUNCTION]);

    clearBusOutput(ports);
    assert.deepEqual(ports.map((p) => p.functionMask), [0, SERIAL_RX, 0]);
});
