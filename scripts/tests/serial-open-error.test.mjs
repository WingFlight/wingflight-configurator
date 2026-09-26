import assert from 'node:assert/strict';
import { test } from 'node:test';

// A port the browser knows about, whose open() behaves as given.
let openImpl = async () => {};
const fakePort = {
    getInfo: () => ({ usbVendorId: 0x0483, usbProductId: 0x5740 }),
    open: (...args) => openImpl(...args),
};
Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node', serial: { getPorts: async () => [fakePort] } },
    configurable: true,
});

const { connectWebSerial, loadWebSerialPorts } = await import('../../src/js/protocols/WebSerial.js');

function connect(self, path) {
    return new Promise((resolve) => connectWebSerial(self, path, {}, resolve));
}

test('a port held by another program is reported as openFailed', async () => {
    const self = { webSerialPorts: [], lastOpenError: null };
    const [entry] = await loadWebSerialPorts(self);
    openImpl = async () => { throw new DOMException('Failed to open serial port.', 'NetworkError'); };
    assert.equal(await connect(self, entry.path), false);
    assert.equal(self.lastOpenError, 'openFailed');
});

test('a port that is no longer there is reported as notFound', async () => {
    const self = { webSerialPorts: [], lastOpenError: null };
    assert.equal(await connect(self, 'no-such-port'), false);
    assert.equal(self.lastOpenError, 'notFound');
});
