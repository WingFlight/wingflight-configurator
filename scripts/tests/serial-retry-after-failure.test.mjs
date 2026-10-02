import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

// Resolve the app's "@/..." import alias (normally handled by Vite).
const srcRoot = new URL('../../src/', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
    export function resolve(specifier, context, next) {
        if (specifier.startsWith('@/')) specifier = ${JSON.stringify(srcRoot)} + specifier.slice(2);
        return next(specifier, context);
    }`));

// Desktop (chrome.serial) backend, with the port busy until `portFree`.
let portFree = false;
const listeners = () => ({ listeners: [], addListener() {}, removeListener() {} });
globalThis.__BACKEND__ = 'nwjs';
globalThis.GUI = { log() {} };
globalThis.i18n = { getMessage: (key) => key };
globalThis.checkChromeRuntimeError = () => !!globalThis.chrome.runtime.lastError;
globalThis.chrome = {
    runtime: {},
    serial: {
        connect(_path, _options, callback) {
            setTimeout(() => callback(portFree ? { connectionId: 1, bitrate: 115200 } : undefined));
        },
        disconnect(_id, callback) { setTimeout(() => callback(true)); },
        onReceive: listeners(),
        onReceiveError: listeners(),
    },
};

const { serial } = await import('../../src/js/serial.js');

const connect = () => new Promise((resolve) => serial.connect('COM3', { bitrate: 115200 }, resolve));

test('retrying after a failed open works once the port is free', async () => {
    assert.equal(await connect(), false);
    assert.equal(serial.lastOpenError, 'openFailed');

    // Callers (e.g. Detect board) clean up after a failed open like this.
    serial.disconnect();

    portFree = true;
    const openInfo = await connect();
    assert.ok(openInfo, 'second attempt should open, not be treated as cancelled');
    assert.equal(serial.lastOpenError, null);
    assert.equal(serial.connected, true);
});
