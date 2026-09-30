import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
globalThis.LRUMap = require('lru_map').LRUMap;
// The web build, whose chrome.storage is the localStorage shim.
globalThis.__BACKEND__ = 'web';

// localStorage stand-in with a tiny quota, so a firmware-sized write fails
// the same way the browser's does.
const QUOTA = 1000;
const store = new Map();
const used = () => [...store.values()].reduce((n, v) => n + v.length, 0);
globalThis.localStorage = {
    get length() {
        return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
        if (used() - (store.get(key)?.length ?? 0) + value.length > QUOTA) {
            throw new DOMException('quota', 'QuotaExceededError');
        }
        store.set(key, value);
    },
    removeItem: (key) => store.delete(key),
};

const { installChromeStorageShimIfMissing } = await import('../../src/js/chromeStorageShim.js');
installChromeStorageShimIfMissing();
const { FirmwareCache } = await import('../../src/js/FirmwareCache.js');

// Outside Vite the build's base path is "/", so this build's caches live under
// "build:/:".
const OWN = 'build:/:';
const tick = () => new Promise((resolve) => setTimeout(resolve));

FirmwareCache.load();
await tick();

const release = { file: 'wingflight_4.6.0_STM32H743.hex' };

test('a write over quota does not throw or leave the release journalled', async () => {
    assert.doesNotThrow(() => FirmwareCache.put(release, ':'.repeat(5000)));
    await tick();
    assert.equal(FirmwareCache.has(release), false);
});

test('a small write is cached and readable', async () => {
    FirmwareCache.put(release, ':firmware');
    await tick();
    assert.equal(FirmwareCache.has(release), true);
    const cached = await new Promise((resolve) => FirmwareCache.get(release, resolve));
    assert.equal(cached.hexdata, ':firmware');
});

test('a journal entry with no stored data is dropped on read', async () => {
    const stale = { file: 'wingflight_4.6.0_STM32F405.hex' };
    FirmwareCache.put(stale, ':firmware');
    await tick();
    store.delete(OWN + 'cache:' + stale.file);
    const cached = await new Promise((resolve) => FirmwareCache.get(stale, resolve));
    assert.equal(cached, null);
    assert.equal(FirmwareCache.has(stale), false);
});

test('each build reads only its own caches', async () => {
    // Another deployed build's cache, in a format this one can't read, and
    // one written before caches were namespaced.
    store.set('build:/release/1.0.0/:unifiedSourceCache', JSON.stringify({ unifiedSourceCache: 'old format' }));
    store.set('unifiedSourceCache', JSON.stringify({ unifiedSourceCache: 'old format' }));
    const result = await new Promise((resolve) => chrome.storage.local.get('unifiedSourceCache', resolve));
    assert.deepEqual(result, {});
});

test("a full store drops other builds' caches but keeps settings", async () => {
    store.clear();
    store.set('build:/release/1.0.0/:firmwareReleaseData', 'x'.repeat(400));
    store.set('firmwareReleaseData', 'x'.repeat(300));
    store.set('darkTheme', JSON.stringify({ darkTheme: 1 }));
    const error = await new Promise((resolve) =>
        chrome.storage.local.set({ firmwareReleaseData: 'y'.repeat(400) }, () => resolve(chrome.runtime?.lastError)),
    );
    assert.equal(error, undefined);
    assert.equal(store.has('build:/release/1.0.0/:firmwareReleaseData'), false);
    assert.equal(store.has('firmwareReleaseData'), false);
    assert.equal(store.get('darkTheme'), JSON.stringify({ darkTheme: 1 }));
    assert.ok(store.has(OWN + 'firmwareReleaseData'));
});

test('a write that still does not fit reports lastError instead of throwing', async () => {
    const error = await new Promise((resolve) =>
        chrome.storage.local.set({ big: 'z'.repeat(5000) }, () => resolve(chrome.runtime?.lastError)),
    );
    assert.ok(error?.message);
    assert.equal(chrome.runtime.lastError, undefined);
});
