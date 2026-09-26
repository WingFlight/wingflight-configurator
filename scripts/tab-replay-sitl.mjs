/**
 * The configurator's own MSP stack against SITL, with addressed access on:
 * the check that the tabs keep working when the config opcodes they send are
 * answered by the virtual layer instead of the firmware.
 *
 * Loads msp.svelte.js, MSPHelper and param/msp_routing.js through Vite (SSR),
 * gives them a `serial` that is a TCP connection to SITL, and then does what
 * the tabs do, through MSP.send_message and MSPHelper.process_data:
 *
 *   1. read every config opcode that has a reply codec, legacy path only,
 *      and keep the decoded FC state;
 *   2. connect addressed access as serial_backend.js does
 *      (startAddressedReplies, both options on), read everything again, and
 *      require the same FC state -- served from PARAM_READ this time;
 *   3. send every config setter the tabs build with mspHelper.crunch(), from
 *      that state: the first request of each goes to the firmware and must
 *      verify, the second must be written through PARAM_WRITE;
 *      The indexed setters the tabs send through mspHelper.send*() are
 *      exercised the same way, at their first, middle and last element;
 *   4. with routing off, read everything from the firmware again: writing
 *      the current values back must have changed nothing;
 *   5. edit values as a tab would, write them routed, and require the
 *      firmware's own reply (routing off) to show the edit.
 *
 * The manifest comes from a fake localStorage cache, keyed by build ID, as
 * a returning user's would; it must be the one made for this SITL build.
 *
 *   node scripts/tab-replay-sitl.mjs <SITL binary> <SITL manifest.json>
 */

import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const [binary, manifestPath] = process.argv.slice(2);
if (!binary || !manifestPath) {
    console.error("usage: node scripts/tab-replay-sitl.mjs <SITL binary> <SITL manifest.json>");
    process.exit(2);
}
const PORT = 5761;
const manifestText = readFileSync(manifestPath, "utf8");
const manifestRaw = JSON.parse(manifestText);

// --- SITL ------------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), "wf-sitl-"));
const exe = join(dir, process.platform === "win32" ? "sitl.exe" : "sitl");
copyFileSync(binary, exe);
const start = () => spawn(exe, [], { cwd: dir, stdio: "ignore" });
const first = start();
await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    first.once("exit", () => {
        clearTimeout(timer);
        resolve();
    });
});
first.kill();
const sitl = start();
let socket;
for (let attempt = 0; attempt < 50 && !socket; attempt++) {
    socket = await new Promise((resolve) => {
        const s = net.connect(PORT, "127.0.0.1", () => resolve(s));
        s.once("error", () => setTimeout(() => resolve(null), 200));
    });
}
if (!socket) throw new Error(`SITL did not open port ${PORT}`);

// --- the browser globals the MSP stack reaches for -----------------------------------

const store = new Map([[`wf-manifest-${manifestRaw.build.id}`, manifestText]]);
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
};
globalThis.CONFIGURATOR = { virtualMode: false, cliEngineActive: false, connectionValid: true };
globalThis.GUI = { active_tab: "replay", timeout_add: () => {}, interval_remove: () => {} };

// Every opcode sent, by code, so a phase can say what went over the wire.
const wire = [];
const frameCode = (bytes) => (bytes[2] === 0x3c && bytes[1] === 0x58 ? bytes[4] | (bytes[5] << 8) : bytes[4]);
globalThis.serial = {
    connected: true,
    send(data, callback) {
        const bytes = new Uint8Array(data);
        wire.push(frameCode(bytes));
        socket.write(Buffer.from(bytes));
        callback?.({ bytesSent: bytes.length });
    },
};

// --- the configurator's modules ----------------------------------------------------

const server = await createServer({
    configFile: "vite.config.mjs",
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    logLevel: "error",
});
const load = (p) => server.ssrLoadModule(p);
const { MSP } = await load("/src/js/msp.svelte.js");
const { MspHelper } = await load("/src/js/msp/MSPHelper.js");
const { MSPCodes } = await load("/src/js/msp/MSPCodes.js");
const { FC } = await load("/src/js/fc.svelte.js");
const config = await load("/src/js/config.js");
// The globals main.svelte.js installs, which MSPHelper uses bare.
await load("/src/js/injected_methods.js");
Object.assign(globalThis, {
    ...(await load("/src/js/utils/common.js")),
    MSP,
    MSPCodes,
    FC,
    MspHelper,
    Features: (await load("/src/js/features.svelte.js")).Features,
    Beepers: (await load("/src/js/Beepers.js")).Beepers,
    Mixer: (await load("/src/js/Mixer.js")).Mixer,
    i18n: { getMessage: (key) => key },
});
const serialBackend = await load("/src/js/serial_backend.js");
Object.assign(globalThis, {
    bit_check: serialBackend.bit_check,
    bit_set: serialBackend.bit_set,
    // UI updates process_data triggers; there is no UI here
    updateTabList: () => {},
    showErrorDialog: (message) => console.log(`   (error dialog: ${message})`),
    sensor_status: () => {},
    update_dataflash_global: () => {},
});
const routing = await load("/src/js/param/msp_routing.js");
const { indexRequest } = await load("/src/js/param/virtual_msp.js");

socket.on("data", (chunk) => MSP.read({ data: chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.length) }));
const mspHelper = new MspHelper();
globalThis.mspHelper = mspHelper;
MSP.listen(mspHelper.process_data.bind(mspHelper));

const names = Object.fromEntries(Object.entries(MSPCodes).map(([name, code]) => [code, name]));
const name = (code) => names[code] ?? `opcode ${code}`;
const codecs = manifestRaw.msp_codecs;

let failures = 0;
const fail = (line) => {
    failures++;
    console.log(`FAIL ${line}`);
};

// FC state as data: what a tab renders from.
const snapshot = () =>
    JSON.parse(
        JSON.stringify(FC, (key, value) => (typeof value === "function" ? undefined : value)),
    );
function differences(a, b, path = "FC", out = []) {
    if (out.length > 20) return out;
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
        if (a !== b) out.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
        return out;
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], `${path}.${key}`, out);
    return out;
}

// Every reply codec with a name, and each request it takes.
const reads = [];
for (const [code, codec] of Object.entries(codecs)) {
    if (codec.dir !== "out" || !names[code]) continue;
    const requests = codec.index ? Array.from({ length: codec.index.max }, (_, i) => indexRequest(codec, i)) : [[]];
    for (const request of requests) reads.push([Number(code), request]);
}
async function readAll() {
    for (const [code, request] of reads) {
        const reply = await MSP.promise(code, request.length ? request : false);
        if (!reply || reply.unsupported) fail(`${name(code)}[${request}] got no reply`);
    }
    return snapshot();
}

try {
    // 1. the legacy path
    const legacy = await readAll();
    console.log(`# 1. read ${reads.length} config requests from the firmware's own opcodes`);

    // 2. addressed access, connected as serial_backend.js does
    config.set({ addressedConfigReplies: true, addressedConfigSetters: true });
    await routing.startAddressedReplies((line) => console.log(`   ${line}`));
    if (!MSP.virtualLayer) throw new Error("addressed access did not start");
    const router = MSP.virtualLayer;
    wire.length = 0;
    const routed = await readAll();
    const legacySent = wire.filter((c) => codecs[c]).length;
    const diff = differences(legacy, routed);
    if (diff.length) fail(`FC state differs when served from addressed access:\n     ${diff.join("\n     ")}`);
    console.log(`# 2. read them again: ${reads.length - legacySent} answered from PARAM_READ, ` +
        `${legacySent} still sent as legacy opcodes; FC state ${diff.length ? "DIFFERS" : "identical"}`);

    // 3. setters, as the tabs build them
    const tally = { verified: 0, kept: 0, pending: 0, routed: 0, notRouted: 0, skipped: 0 };
    for (const [code, codec] of Object.entries(codecs)) {
        if (codec.dir !== "in" || !names[code]) continue;
        let payload;
        try {
            payload = mspHelper.crunch(Number(code));
        } catch {
            payload = null;
        }
        if (!payload || (!payload.length && codec.ops.length)) {
            tally.skipped++; // not a setter the tabs build with crunch()
            continue;
        }
        const firstReply = await MSP.promise(Number(code), payload);
        if (!firstReply || firstReply.unsupported) {
            fail(`${name(code)}: the firmware refused the tab's own request`);
            continue;
        }
        for (let wait = 0; wait < 100 && router.setterState.get(Number(code)) === "pending"; wait++) {
            await new Promise((r) => setTimeout(r, 20));
        }
        const state = router.setterState.get(Number(code));
        if (state === true) tally.verified++;
        else if (state === false) {
            tally.kept++;
            console.log(`   KEPT ${name(code)} (see the log line above)`);
            continue;
        } else {
            tally.pending++;
            continue;
        }
        wire.length = 0;
        const second = await MSP.promise(Number(code), payload);
        const sentLegacy = wire.includes(Number(code));
        if (!second || second.unsupported || sentLegacy) {
            tally.notRouted++;
            fail(`${name(code)}: verified, but its second request was ${sentLegacy ? "sent to the firmware" : "refused"}`);
        } else tally.routed++;
    }
    console.log(`# 3. setters from mspHelper.crunch(): ${tally.verified} verified on first use, ` +
        `${tally.routed} then written through PARAM_WRITE, ${tally.kept} kept on the firmware, ` +
        `${tally.pending} unverified, ${tally.skipped} not built by crunch()`);

    // 3b. the indexed setters the tabs send element by element
    const send = (method, index) => new Promise((resolve) => mspHelper[method](index, resolve));
    const helpers = [
        ["sendMixerInput", MSPCodes.MSP_SET_MIXER_INPUT, () => FC.MIXER_INPUTS],
        ["sendMixerRule", MSPCodes.MSP_SET_MIXER_RULE, () => FC.MIXER_RULES],
        ["sendMixerCurve", MSPCodes.MSP_SET_MIXER_CURVE, () => FC.MIXER_CURVES],
        ["sendGainCurve", MSPCodes.MSP_SET_GAIN_CURVE, () => FC.GAIN_CURVES],
        ["sendLogicCondition", MSPCodes.MSP_SET_LOGIC_CONDITION, () => FC.LOGIC_CONDITIONS],
        ["sendAdjustmentRange", MSPCodes.MSP_SET_ADJUSTMENT_RANGE, () => FC.ADJUSTMENT_RANGES],
    ];
    let indexedRouted = 0;
    for (const [method, code, list] of helpers) {
        if (!codecs[code]) {
            console.log(`   ${name(code)}: no codec on this target`);
            continue;
        }
        const count = list()?.length ?? 0;
        if (!count) {
            fail(`${name(code)}: FC holds no elements to send`);
            continue;
        }
        const reply = await send(method, 0);
        if (!reply || reply.unsupported) {
            fail(`${name(code)}: the firmware refused the tab's own request`);
            continue;
        }
        for (let wait = 0; wait < 100 && router.setterState.get(code) === "pending"; wait++) {
            await new Promise((r) => setTimeout(r, 20));
        }
        if (router.setterState.get(code) !== true) {
            fail(`${name(code)}: not verified on first use (${router.setterState.get(code)})`);
            continue;
        }
        for (const i of new Set([0, Math.floor(count / 2), count - 1])) {
            wire.length = 0;
            const routedReply = await send(method, i);
            if (!routedReply || routedReply.unsupported || wire.includes(code)) {
                fail(`${name(code)}[${i}]: not written through PARAM_WRITE`);
            }
        }
        indexedRouted++;
    }
    console.log(`# 3b. indexed setters from mspHelper.send*(): ${indexedRouted} of ${helpers.length} verified and written through PARAM_WRITE at their first, middle and last element`);

    // 4. the firmware's view, routing off
    MSP.virtualLayer = null;
    const after = await readAll();
    const changed = differences(legacy, after);
    if (changed.length) fail(`writing current values back changed the firmware's state:\n     ${changed.join("\n     ")}`);
    console.log(`# 4. firmware state after the routed writes: ${changed.length ? "CHANGED" : "unchanged"}`);

    // 5. an edit, as a tab makes one: routed write, then the firmware's own reply
    MSP.virtualLayer = router;
    const edits = [
        ["mixer input 1 rate", () => FC.MIXER_INPUTS[1], "rate", MSPCodes.MSP_MIXER_INPUTS,
            () => new Promise((r) => mspHelper.sendMixerInput(1, r))],
        ["logic condition 2 operand A", () => FC.LOGIC_CONDITIONS[2], "operandAValue", MSPCodes.MSP_LOGIC_CONDITIONS,
            () => new Promise((r) => mspHelper.sendLogicCondition(2, r))],
    ];
    let edited = 0;
    for (const [label, target, field, getCode, write] of edits) {
        if (!target()) continue;
        const want = (target()[field] + 7) & 0x7fff;
        target()[field] = want;
        wire.length = 0;
        await write();
        const routedWrite = !wire.some((c) => codecs[c]?.dir === "in");
        MSP.virtualLayer = null;
        await MSP.promise(getCode);
        MSP.virtualLayer = router;
        if (!routedWrite) fail(`${label}: the edit went to the firmware's setter`);
        else if (target()[field] !== want) fail(`${label}: the firmware reports ${target()[field]}, the tab wrote ${want}`);
        else edited++;
    }
    console.log(`# 5. edits written through PARAM_WRITE and seen in the firmware's own reply: ${edited} of ${edits.length}`);
} finally {
    socket.destroy();
    sitl.kill();
    await server.close();
    await new Promise((r) => setTimeout(r, 300));
    rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failures` : "\nall phases passed");
process.exit(failures ? 1 : 0);
