import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

// Exercise the real replayBackup()/endsWithSave() with the CLI engine stubbed
// (cli_backup.js itself pulls in browser-only modules).
const source = readFileSync(new URL('../../src/js/cli_backup.js', import.meta.url), 'utf8');
const functions = ['endsWithSave', 'replayBackup'].map((name) => {
    const match = source.match(new RegExp(`^(?:export )?(?:async )?function ${name}\\([^]*?\\n}`, 'm'));
    assert.ok(match, name);
    return match[0].replace('export ', '');
}).join('\n');

// Tail of a real `diff all` capture: the FC prints `save` and then its prompt.
const capture = [
    '# diff all',
    '# version',
    '# Wingflight / STM32H743 (SH74) 4.6.0-0.0.26',
    'batch start',
    'defaults nosave',
    'set some_renamed_setting = 5',
    '# save configuration',
    'save',
    '# ',
].join('\r\n');

// Simulated FC: rejects the first `save` if any line errored (as cliSave()'s
// tryPrepareSave() does), accepts the next one.
function setup({ erroringLines = [] } = {}) {
    const sent = [];
    const context = {
        SAVE_RETRY_ATTEMPTS: 2, CLI_IDLE_MS: 0, console: { log() {} },
        CONFIGURATOR: { cliEngineValid: true },
        waitForIdle: async () => {},
    };
    let batchError = false;
    const fc = (line) => {
        sent.push(line);
        if (erroringLines.includes(line)) batchError = true;
        if (line === 'save') {
            if (batchError) batchError = false;
            else context.CONFIGURATOR.cliEngineValid = false; // "Rebooting"
        }
    };
    context.cliEngine = {
        executeCommands: async (text) => text.split('\n').map((l) => l.trim()).filter(Boolean).forEach(fc),
        sendLine: fc,
    };
    vm.createContext(context);
    vm.runInContext(functions, context);
    return { context, sent };
}

test('a capture ending in the CLI prompt still counts as ending with save', () => {
    const { context } = setup();
    assert.equal(context.endsWithSave(capture), true);
    assert.equal(context.endsWithSave('set a = 1\n# comment\n'), false);
});

test('a save rejected because of CLI errors is resent until the FC reboots', async () => {
    const { context, sent } = setup({ erroringLines: ['set some_renamed_setting = 5'] });
    assert.equal(await context.replayBackup(context.cliEngine, capture), true);
    assert.deepEqual(sent.filter((l) => l === 'save'), ['save', 'save']);
});

test('reports failure when the FC never reboots', async () => {
    const { context } = setup();
    context.cliEngine.sendLine = () => {};
    context.cliEngine.executeCommands = async () => {};
    assert.equal(await context.replayBackup(context.cliEngine, capture), false);
});
