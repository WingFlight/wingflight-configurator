import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
globalThis.LRUMap = require('lru_map').LRUMap;

// localStorage stand-in with a tiny quota, so a firmware-sized write fails
// the same way the browser's does.
const store = new Map();
globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
        if (value.length > 1000) throw new DOMException('quota', 'QuotaExceededError');
        store.set(key, value);
    },
    removeItem: (key) => store.delete(key),
};

const { installChromeStorageShimIfMissing } = await import('../../src/js/chromeStorageShim.js');
installChromeStorageShimIfMissing();
const { FirmwareCache } = await import('../../src/js/FirmwareCache.js');

FirmwareCache.load();
await new Promise((resolve) => setTimeout(resolve));

const release = { file: 'wingflight_4.6.0_STM32H743.hex' };

test('a write over quota does not throw or leave the release journalled', () => {
    assert.doesNotThrow(() => FirmwareCache.put(release, ':'.repeat(5000)));
    assert.equal(FirmwareCache.has(release), false);
});

test('a small write is cached and readable', async () => {
    FirmwareCache.put(release, ':firmware');
    assert.equal(FirmwareCache.has(release), true);
    const cached = await new Promise((resolve) => FirmwareCache.get(release, resolve));
    assert.equal(cached.hexdata, ':firmware');
});

test('a journal entry with no stored data is dropped on read', async () => {
    const stale = { file: 'wingflight_4.6.0_STM32F405.hex' };
    FirmwareCache.put(stale, ':firmware');
    store.delete('cache:' + stale.file);
    const cached = await new Promise((resolve) => FirmwareCache.get(stale, resolve));
    assert.equal(cached, null);
    assert.equal(FirmwareCache.has(stale), false);
});
