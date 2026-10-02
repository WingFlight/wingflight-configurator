import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

// Exercise the actual component handlers with browser/hardware boundaries stubbed.
const source = readFileSync(new URL('../../src/tabs/firmware_flasher/FirmwareFlasher.svelte', import.meta.url), 'utf8');
const names = ['hasPendingRestore', 'requestExit', 'cancelExit', 'confirmExit', 'saveBeforeExit', 'restoreBeforeExit', 'warnBeforeUnload', 'runRestore', 'saveBackupFile'];
const handlers = names.map((name) => {
    const match = source.match(new RegExp(`  (?:export )?(?:async )?function ${name}\\([^]*?\\n  }`));
    assert.ok(match, name);
    return match[0].replace('export ', '');
}).join('\n');
function setup(overrides = {}) {
    const context = {
        restoreText: 'original settings', restorePort: 'COM3', restoreBaud: 115200,
        restoreRun: { status: 'prompt' }, backupRun: { saved: false, text: 'original settings' },
        flashInProgress: false, backupOrRestoreBusy: false, savingExitBackup: false,
        pendingExit: null, exitSaveFailed: false, wizardStep: 6,
        exitDialogEl: { open: false, showModal() { this.open = true; }, close() { this.open = false; } },
        GUI: { connect_lock: false }, console: { warn() {} },
        setTimeout(callback) { callback(); },
        saveBackupToFile: async () => true,
        restoreOverSerial: async () => true,
        portFailDetail: () => '',
        ...overrides,
    };
    vm.createContext(context);
    vm.runInContext(handlers, context);
    return context;
}
test('pending or failed restore blocks leaving; explicit leave resumes once', () => {
    for (const status of ['prompt', 'failed', 'skipped']) {
        const c = setup({ restoreRun: { status } }); let exits = 0;
        c.requestExit(() => exits++);
        assert.equal(exits, 0); assert.equal(c.exitDialogEl.open, true);
        c.confirmExit(); c.confirmExit(); assert.equal(exits, 1);
    }
});
test('completed restore permits leaving without warning', () => {
    const c = setup({ restoreRun: { status: 'done' } }); let exits = 0;
    c.requestExit(() => exits++); assert.equal(exits, 1); assert.equal(c.exitDialogEl.open, false);
});
test('stay and cancelled or failed saves preserve the buffer and do not leave', async () => {
    for (const save of [async () => undefined, async () => { throw Error('disk full'); }]) {
        const c = setup({ saveBackupToFile: save }); let exits = 0;
        c.requestExit(() => exits++); await c.saveBeforeExit();
        assert.equal(exits, 0); assert.equal(c.restoreText, 'original settings');
        assert.equal(c.exitDialogEl.open, true); assert.equal(c.exitSaveFailed, true);
        c.cancelExit(); assert.equal(c.pendingExit, null); assert.equal(exits, 0);
    }
});
test('save completes before leaving and writes the exact restore buffer', async () => {
    let savedText;
    const c = setup({ saveBackupToFile: async (text) => { savedText = text; return true; } });
    let exits = 0; c.requestExit(() => exits++); await c.saveBeforeExit();
    assert.equal(savedText, 'original settings'); assert.equal(exits, 1); assert.equal(c.backupRun.saved, true);
});
for (const fails of [async () => false, async () => { throw Error('port lost'); }]) {
    test('restore failure releases connection lock and prompts for an unsaved buffer', async () => {
        const c = setup({ restoreOverSerial: fails }); await c.runRestore();
        assert.equal(c.GUI.connect_lock, false); assert.equal(c.restoreRun.status, 'failed');
        assert.equal(c.exitDialogEl.open, true); assert.equal(c.restoreText, 'original settings');
    });
}
test('previously saved backup suppresses automatic failure prompt', async () => {
    const c = setup({ backupRun: { saved: true }, restoreOverSerial: async () => false });
    await c.runRestore(); assert.equal(c.exitDialogEl.open, false); assert.equal(c.restoreRun.status, 'failed');
});
test('cancelling another save does not forget a previously saved backup', async () => {
    const c = setup({ backupRun: { saved: true, text: 'original settings' }, saveBackupToFile: async () => undefined });
    await c.saveBackupFile(); assert.equal(c.backupRun.saved, true);
});
test('successful restore reaches Finished without a recovery dialog', async () => {
    const c = setup(); await c.runRestore(); assert.equal(c.wizardStep, 7);
    assert.equal(c.restoreRun.status, 'done'); assert.equal(c.exitDialogEl.open, false);
});
test('busy operations block navigation and browser unload warns', () => {
    const c = setup({ backupOrRestoreBusy: true }); let exits = 0;
    c.requestExit(() => exits++); assert.equal(exits, 0);
    const event = { preventDefault() { this.prevented = true; } };
    c.warnBeforeUnload(event); assert.equal(event.prevented, true);
});
