import assert from 'node:assert/strict';
import { test } from 'node:test';
import { downloadFirmware } from '../../src/js/FirmwareDownload.js';

const options = { retryDelayMs: 0, timeoutMs: 1000 };
const ok = () => ({ ok: true, text: async () => ':firmware' });

test('returns the complete firmware without retrying a successful transfer', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => ok());
    assert.equal(await downloadFirmware('https://example.test/fw.hex', options), ':firmware');
    assert.equal(fetch.mock.callCount(), 1);
});

test('retries a failed body read, not just the initial request', async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => ++calls === 1
        ? { ok: true, text: async () => { throw new TypeError('connection reset'); } }
        : ok());
    assert.equal(await downloadFirmware('https://example.test/fw.hex', options), ':firmware');
    assert.equal(calls, 2);
});

for (const phase of ['headers', 'body']) {
    test(`aborts stalled ${phase} and retries with a fresh signal`, async (t) => {
        const signals = [];
        t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
            signals.push(signal);
            if (signals.length === 2) {
                assert.equal(signal.aborted, false);
                return ok();
            }
            const stalled = () => new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true });
            });
            return phase === 'headers' ? stalled() : { ok: true, text: stalled };
        });
        assert.equal(await downloadFirmware('https://example.test/fw.hex', { ...options, timeoutMs: 10 }), ':firmware');
        assert.equal(signals.length, 2);
        assert.equal(signals[0].aborted, true);
        assert.notEqual(signals[0], signals[1]);
    });
}

for (const failure of [408, 429, 503, 'network', 'empty']) {
    test(`recovers from transient ${failure} failure`, async (t) => {
        let calls = 0;
        t.mock.method(globalThis, 'fetch', async () => {
            if (++calls > 1) return ok();
            if (failure === 'network') throw new TypeError('offline');
            if (failure === 'empty') return { ok: true, text: async () => '  ' };
            return { ok: false, status: failure };
        });
        assert.equal(await downloadFirmware('https://example.test/fw.hex', options), ':firmware');
        assert.equal(calls, 2);
    });
}

test('does not retry a missing firmware file', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }));
    await assert.rejects(downloadFirmware('https://example.test/fw.hex', options), /HTTP 404/);
    assert.equal(fetch.mock.callCount(), 1);
});

test('reports failure after the bounded retry', async (t) => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline'); });
    await assert.rejects(downloadFirmware('https://example.test/fw.hex', options), /offline/);
    assert.equal(fetch.mock.callCount(), 2);
});
