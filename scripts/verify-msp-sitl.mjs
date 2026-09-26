/**
 * Run verify_msp against SITL: the virtual MSP layer checked against the
 * firmware's real msp.c, with no board.
 *
 * Starts the SITL binary in a scratch directory, talks MSPv2 to it over TCP,
 * and runs the same verifyReplies / verifySetters the CLI's `verify_msp`
 * does -- with the virtual layer's reads and writes going over PARAM_READ /
 * PARAM_WRITE to the same SITL. The manifest must be the one made for that
 * SITL build (make manifest TARGET=SITL).
 *
 *   node scripts/verify-msp-sitl.mjs <wingflight_SITL binary> <SITL manifest.json> [--setters]
 */

import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Manifest } from "../src/js/param/manifest.js";
import { VirtualMsp } from "../src/js/param/virtual_msp.js";
import { verifyReplies, verifySetters, symmetricPairs } from "../src/js/param/verify_msp.js";
import { MSPCodes } from "../src/js/msp/MSPCodes.js";

const [binary, manifestPath, ...flags] = process.argv.slice(2);
if (!binary || !manifestPath) {
    console.error("usage: node scripts/verify-msp-sitl.mjs <SITL binary> <SITL manifest.json> [--setters]");
    process.exit(2);
}
const PORT = 5761;
const PARAM_READ = MSPCodes.MSP2_WING_PARAM_READ;
const PARAM_WRITE = MSPCodes.MSP2_WING_PARAM_WRITE;

// --- SITL ------------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), "wf-sitl-"));
const exe = join(dir, process.platform === "win32" ? "sitl.exe" : "sitl");
copyFileSync(binary, exe);

function start() {
    return spawn(exe, [], { cwd: dir, stdio: "ignore" });
}

async function connect() {
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            return await new Promise((resolve, reject) => {
                const socket = net.connect(PORT, "127.0.0.1", () => resolve(socket));
                socket.once("error", reject);
            });
        } catch {
            await new Promise((r) => setTimeout(r, 200));
        }
    }
    throw new Error(`SITL did not open port ${PORT}`);
}

// A fresh SITL writes its eeprom.bin and resets, which in SITL means exit.
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
const socket = await connect();

// --- MSPv2 over TCP ------------------------------------------------------------------

function crc8DvbS2(bytes) {
    let crc = 0;
    for (const b of bytes) {
        crc ^= b;
        for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0xd5) & 0xff : (crc << 1) & 0xff;
    }
    return crc;
}

let pending = null;
let buffer = Buffer.alloc(0);
socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
        const at = buffer.indexOf("$X");
        if (at < 0 || buffer.length < at + 8) return;
        const size = buffer.readUInt16LE(at + 6);
        if (buffer.length < at + 9 + size) return;
        const frame = buffer.subarray(at, at + 9 + size);
        buffer = buffer.subarray(at + 9 + size);
        const code = frame.readUInt16LE(4);
        const ok = frame[2] === ">".charCodeAt(0);
        if (pending && pending.code === code) {
            const { resolve } = pending;
            pending = null;
            resolve(ok ? Uint8Array.from(frame.subarray(8, 8 + size)) : null);
        }
    }
});

let chain = Promise.resolve();
function request(code, payload = []) {
    const run = () =>
        new Promise((resolve, reject) => {
            const body = Buffer.alloc(5 + payload.length);
            body[0] = 0;
            body.writeUInt16LE(code, 1);
            body.writeUInt16LE(payload.length, 3);
            Buffer.from(payload).copy(body, 5);
            const frame = Buffer.concat([Buffer.from("$X<"), body, Buffer.from([crc8DvbS2(body)])]);
            const timer = setTimeout(() => {
                pending = null;
                reject(new Error(`no reply to opcode ${code}`));
            }, 2000);
            pending = {
                code,
                resolve: (v) => {
                    clearTimeout(timer);
                    resolve(v);
                },
            };
            socket.write(frame);
        });
    chain = chain.then(run, run);
    return chain;
}

const u16 = (v) => [v & 0xff, (v >> 8) & 0xff];
const io = {
    async readRange(pgn, offset, length) {
        const reply = await request(PARAM_READ, [...u16(pgn), ...u16(offset), ...u16(length)]);
        if (!reply || reply.length < length) throw new Error(`PARAM_READ of pgn ${pgn}+${offset} refused`);
        return new DataView(reply.buffer, reply.byteOffset, length);
    },
    async writeRange(pgn, offset, bytes) {
        const reply = await request(PARAM_WRITE, [...u16(pgn), ...u16(offset), ...bytes]);
        if (reply === null) throw new Error(`PARAM_WRITE of pgn ${pgn}+${offset} refused`);
    },
};
const rawRequest = (code, payload) => request(code, payload ?? []);

// --- verify ------------------------------------------------------------------------

let failed = false;
try {
    const manifest = new Manifest(JSON.parse(readFileSync(manifestPath, "utf8")));
    const virtual = new VirtualMsp(manifest, io);
    const names = Object.fromEntries(Object.entries(MSPCodes).map(([name, code]) => [code, name]));

    if (flags.includes("--perturb")) {
        // With defaults, most fields are 0 and a codec reading the wrong
        // offset would still match. Give every byte a small, distinct value
        // first, so a wrong offset shows. Small, so fields the flight loop
        // uses as indices stay in range. Left alone: systemConfig, whose
        // profile selection the firmware latched at boot, and serialConfig,
        // which carries this very port. RAM only; nothing is saved.
        const KEEP = new Set([13, 18]);
        let written = 0;
        for (const pg of manifest.raw.pgs) {
            if (KEEP.has(pg.pgn)) continue;
            const bytes = Uint8Array.from({ length: pg.size }, (_, i) => ((7 * i + pg.pgn) % 13) + 1);
            for (let at = 0; at < pg.size; at += 96) {
                await io.writeRange(pg.pgn, at, [...bytes.slice(at, at + 96)]);
            }
            written += pg.size;
        }
        // A field that selects an array element (batteryProfile for
        // batteryCapacity[]) must stay in range: out of range, the firmware
        // itself reads past the array.
        for (const codec of Object.values(manifest.raw.msp_codecs ?? {})) {
            for (const op of codec.ops) {
                // A string field always ends in a NUL, as its setter leaves it.
                if (op[0] === "z") await io.writeRange(op[2], op[3] + op[1] - 1, [0]);
                if (op[0] !== "x") continue;
                const [, , , , , , selPgn, selOff, selSize, , count] = op;
                const value = Math.min(count - 1, 1);
                await io.writeRange(selPgn, selOff, [value, ...new Array(selSize - 1).fill(0)]);
            }
        }
        console.log(`# perturbed ${written} bytes of configuration (RAM only)`);
    }

    const replies = await verifyReplies(virtual, rawRequest, names);
    replies.lines.forEach((l) => console.log(l));
    failed ||= replies.bad > 0;

    if (flags.includes("--setters")) {
        const setters = await verifySetters(virtual, rawRequest, names, symmetricPairs(virtual.codecs, MSPCodes));
        setters.lines.forEach((l) => console.log(l));
        failed ||= setters.bad > 0;
    }
} finally {
    socket.destroy();
    sitl.kill();
    await new Promise((r) => setTimeout(r, 300));
    rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
