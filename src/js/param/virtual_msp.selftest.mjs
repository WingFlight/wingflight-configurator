/**
 * Offline checks for the virtual MSP layer (param/virtual_msp.js).
 *
 * Two parts. Synthetic codecs pin the encoding rules the layer must share
 * with C: widening, truncation, profiles, indexed elements, optional tails,
 * refusals. Then every codec in a real manifest is exercised against a fake
 * board for round trips between each GET and its SET.
 *
 * What this cannot show is that a codec matches the firmware: that is
 * verify_msp's job, on a board (or SITL) that still has the real opcodes.
 *
 *   node src/js/param/virtual_msp.selftest.mjs <manifest.json>
 */

import { readFileSync } from "node:fs";
import { Manifest } from "./manifest.js";
import { VirtualMsp, VirtualMspError } from "./virtual_msp.js";
import { ReplyRouter } from "./reply_router.js";
import { MSPCodes } from "../msp/MSPCodes.js";
import { verifyReplies, verifySetters, symmetricPairs } from "./verify_msp.js";

let checks = 0;
let failures = 0;

function check(what, condition, detail = "") {
    checks++;
    if (!condition) {
        failures++;
        console.error(`FAIL  ${what}${detail ? ` -- ${detail}` : ""}`);
    }
}

async function refuses(what, fn) {
    checks++;
    try {
        await fn();
        failures++;
        console.error(`FAIL  ${what} -- expected a refusal`);
    } catch (error) {
        if (!(error instanceof VirtualMspError)) {
            failures++;
            console.error(`FAIL  ${what} -- ${error.constructor.name}: ${error.message}`);
        }
    }
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");

/** A board holding raw group bytes, logging writes. */
function board(manifest, fill = () => 0) {
    const groups = new Map(manifest.raw.pgs.map((pg) => [pg.pgn, Uint8Array.from({ length: pg.size }, (_, i) => fill(pg.pgn, i))]));
    return {
        groups,
        writes: 0,
        async readRange(pgn, offset, length) {
            if (length > 160) throw new Error(`read of ${length} bytes would not fit one MSP reply`);
            return new DataView(groups.get(pgn).buffer, offset, length);
        },
        async writeRange(pgn, offset, bytes) {
            if (bytes.length > 160) throw new Error(`write of ${bytes.length} bytes would not fit one MSP request`);
            this.writes++;
            groups.get(pgn).set(bytes, offset);
        },
    };
}

// --- synthetic codecs ----------------------------------------------------------

{
    const raw = {
        schema: 1,
        build: { id: "0000000000000000" },
        pgs: [
            { pgn: 18, symbol: "systemConfig_System", size: 8, length: 1, elem_size: 8, version: 0,
                fields: [{ name: "pidProfileIndex", kind: "uint", off: 5, size: 1 }] },
            { pgn: 10, symbol: "demo_System", size: 8, length: 1, elem_size: 8, version: 0, fields: [] },
            { pgn: 14, symbol: "pidProfiles_SystemArray", size: 6, length: 3, elem_size: 2, version: 0, fields: [] },
            { pgn: 20, symbol: "rows_SystemArray", size: 12, length: 4, elem_size: 3, version: 0, fields: [] },
        ],
        settings: [],
        msp_codecs: {
            1: { dir: "out", ops: [["f", 2, 10, 0, 1, "s"], ["f", 2, 10, 1, 1, ""], ["c", 1, 7, ""], ["f", 1, 10, 2, 4, ""], ["d", 2, 10, 6, ""]] },
            2: { dir: "out", ops: [["f", 1, 14, 1, 1, "P"]] },
            3: { dir: "in", ops: [["f", 1, 10, 0, 2, "w"], ["s", 1, ""], ["f", 2, 10, 4, 2, "o"]] },
            4: { dir: "in", index: { w: 1, max: 4 }, ops: [["f", 2, 20, 0, 2, "i"], ["f", 1, 20, 2, 1, "i", { min: 2, max: 6 }]] },
            5: { dir: "in", len: 2, ops: [["f", 2, 10, 0, 2, ""]] },
        },
    };
    const manifest = new Manifest(raw);
    const b = board(manifest);
    const v = new VirtualMsp(manifest, b);
    const demo = b.groups.get(10);
    demo.set([0xfe, 0x80, 0x34, 0x12, 0x00, 0x00, 0xaa, 0xbb]);

    check("a signed byte widens by sign extension, an unsigned one by zero",
        hex(await v.read(1)).startsWith("fe ff 80 00"), hex(await v.read(1)));
    check("a constant goes out as written, a wide field truncates to the wire",
        hex(await v.read(1)) === "fe ff 80 00 07 34 aa bb", hex(await v.read(1)));

    b.groups.get(14).set([1, 2, 3, 4, 5, 6]);
    b.groups.get(18)[5] = 2;
    check("a profile field is read from the selected profile", hex(await v.read(2)) === "06", hex(await v.read(2)));

    await v.write(3, [0xff, 9, 0x11, 0x22]);
    check("a signed wire byte sign-extends into a wider field", demo[0] === 0xff && demo[1] === 0xff, hex(demo));
    check("skipped wire bytes are not stored, an optional tail is", demo[4] === 0x11 && demo[5] === 0x22, hex(demo));
    demo.set([0, 0, 0, 0, 0x55, 0x55]);
    await v.write(3, [1, 9]);
    check("an optional tail the request leaves out is left alone", demo[4] === 0x55 && demo[0] === 1, hex(demo));

    await v.write(4, [2, 0x34, 0x12, 5]);
    check("an indexed setter writes into its element", hex(b.groups.get(20).slice(6, 9)) === "34 12 05", hex(b.groups.get(20)));
    await refuses("an index past the bound is refused", () => v.write(4, [4, 0, 0, 3]));
    await refuses("a value outside a checked range is refused", () => v.write(4, [1, 0, 0, 7]));
    await refuses("a request of the wrong length is refused", () => v.write(5, [1, 2, 3]));
    await refuses("a request too short for a required field is refused", () => v.write(3, []));
    await refuses("an opcode without a codec is refused", () => v.read(99));
    check("has() answers for codecs only", v.has(1) && !v.has(99));
}

// --- routing ---------------------------------------------------------------------

{
    const raw = {
        schema: 1,
        build: { id: "0000000000000000" },
        pgs: [{ pgn: 10, symbol: "demo_System", size: 4, length: 1, elem_size: 4, version: 0, fields: [] }],
        settings: [],
        msp_codecs: { 7: { dir: "out", ops: [["f", 1, 10, 0, 1, ""], ["f", 2, 10, 2, 2, ""]] } },
    };
    const b = board(new Manifest(raw));
    b.groups.get(10).set([9, 0, 0x34, 0x12]);
    const delivered = [];
    const resent = [];
    const msp = {
        listeners: [(handler) => delivered.push(handler)],
        send_message: (...args) => resent.push(args),
    };
    const router = new ReplyRouter(new VirtualMsp(new Manifest(raw), b), [7], msp);

    check("routes a plain request for a verified opcode", router.routes(7, false) && router.routes(7, []));
    check("does not route a request carrying arguments", !router.routes(7, [1]));
    check("does not route an opcode it was not given", !router.routes(8, false));

    const callback = () => {};
    router.answer(7, false, callback, false);
    await new Promise((r) => setTimeout(r, 10));
    const h = delivered[0];
    check("delivers the reply through the listeners", delivered.length === 1 && h?.code === 7 && !h.crcError && !h.unsupported);
    check("delivers the virtual reply's bytes", h && hex(new Uint8Array(h.dataView.buffer, h.dataView.byteOffset, h.dataView.byteLength)) === "09 34 12");
    check("hands the caller's callback to process_data", h?.callbacks?.[0]?.callback === callback && h.callbacks[0].code === 7);

    // A read that fails falls back to the firmware, and stops routing that opcode.
    b.readRange = async () => {
        throw new Error("refused");
    };
    router.answer(7, false, callback, true);
    await new Promise((r) => setTimeout(r, 10));
    check("a failed virtual reply is re-sent to the firmware", resent.length === 1 && resent[0][0] === 7 && resent[0][3] === callback);
    check("and that opcode is no longer routed", !router.routes(7, false));
}

// --- every codec in a real manifest ---------------------------------------------

const path = process.argv[2];
if (path) {
    const manifest = new Manifest(JSON.parse(readFileSync(path, "utf8")));
    const codecs = manifest.raw.msp_codecs ?? {};
    const byCode = Object.fromEntries(Object.entries(MSPCodes).map(([name, code]) => [code, name]));
    const codeOf = (name) => MSPCodes[name];
    let seed = 1;
    // Math.imul: a plain multiply here overflows 2^53, loses the low bits and
    // decays to zeros -- which made the round trips far weaker than they looked.
    const random = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) >>> 16) & 0xff;

    let reads = 0;
    let pairs = 0;
    const asymmetric = [];
    for (const [code, codec] of Object.entries(codecs)) {
        if (codec.dir !== "out") continue;
        const b = board(manifest, () => random());
        b.groups.get(18)?.fill(0); // selected profiles 0
        const v = new VirtualMsp(manifest, b);
        const reply = await v.read(Number(code));
        reads++;
        const expected = codec.ops.reduce((n, op) => n + (op[0] === "d" ? op[1] : op[1]), 0);
        check(`${byCode[code] ?? code} reply length matches its codec`, reply.length === expected, `${reply.length} vs ${expected}`);

        const name = byCode[code];
        const setName = name?.replace(/^MSP_/, "MSP_SET_").replace(/^MSP2_WING_/, "MSP2_WING_SET_");
        const setCode = setName && codeOf(setName);
        const setCodec = setCode && codecs[setCode];
        if (!setCodec || setCodec.dir !== "in" || setCodec.index || setCodec.len !== undefined) continue;

        // Where each field sits on the wire, keyed by what it addresses.
        const layout = (ops) => {
            const out = new Map();
            let pos = 0;
            for (const op of ops) {
                if (op[0] === "f") out.set(`${op[2]}:${op[3]}:${op[5].replace(/[osw]/g, "")}`, { pos, w: op[1], size: op[4] });
                pos += op[1];
            }
            return out;
        };
        const got = layout(codec.ops);
        const set = layout(setCodec.ops);
        const aligned = [...set].every(([key, f]) => got.get(key)?.pos === f.pos && got.get(key)?.w === f.w);
        if (!aligned) {
            asymmetric.push(`${name}/${setName}`);
            continue;
        }
        pairs++;
        // Fields that survive a trip over the wire: not truncated by it.
        const lossless = [...set].filter(([, f]) => f.w >= f.size).map(([key]) => key);

        const before = new Map([...b.groups].map(([pgn, bytes]) => [pgn, bytes.slice()]));
        try {
            await v.write(setCode, reply);
        } catch (error) {
            check(`${setName} accepts ${name}'s reply`, false, error.message);
            continue;
        }
        const moved = lossless.filter((key) => {
            const [pgn, off] = key.split(":").map(Number);
            const size = set.get(key).size;
            return hex(b.groups.get(pgn).slice(off, off + size)) !== hex(before.get(pgn).slice(off, off + size));
        });
        check(`${setName} with ${name}'s reply stores back what was there`, moved.length === 0, moved.join(", "));

        for (const bytes of b.groups.values()) bytes.forEach((_, i) => (bytes[i] = random()));
        b.groups.get(18)?.fill(0);
        await v.write(setCode, reply);
        const again = await v.read(Number(code));
        const differs = lossless.filter((key) => {
            const { pos, w } = got.get(key);
            return hex(again.slice(pos, pos + w)) !== hex(reply.slice(pos, pos + w));
        });
        check(`${setName} restores what ${name} reports`, differs.length === 0, differs.join(", "));
    }
    // --- the verifier must catch what it exists to catch ----------------------
    {
        const b = board(manifest, () => random());
        b.groups.get(18)?.fill(0);
        const v = new VirtualMsp(manifest, b);
        const names = byCode;
        // A "firmware" that agrees with the codecs...
        const agreeing = async (c) => v.read(c);
        const clean = await verifyReplies(v, agreeing, names);
        check("verify_msp passes a firmware that agrees", clean.bad === 0 && clean.ok === reads, clean.lines.at(-1));
        // ...and one that differs in a single byte of one reply.
        const victim = Number(Object.keys(codecs).find((c) => codecs[c].dir === "out" && codecs[c].ops.some((op) => op[0] === "f")));
        const fieldPos = (() => {
            let pos = 0;
            for (const op of codecs[victim].ops) {
                if (op[0] === "f") return pos;
                pos += op[1];
            }
            return 0;
        })();
        const differing = async (c) => {
            const r = await v.read(c);
            if (c === victim) r[fieldPos] ^= 0xff;
            return r;
        };
        const caught = await verifyReplies(v, differing, names);
        check("verify_msp catches one wrong byte", caught.bad === 1 && caught.lines[0].includes(names[victim] ?? String(victim)),
            caught.lines[0]);
        check("verify_msp names the field at the wrong byte", /pgn \d+ offset \d+/.test(caught.lines[0]), caught.lines[0]);

        // Setters: a board whose GET is the codec's own read; a correct setter
        // leaves it unchanged, a setter aimed one byte off does not.
        const pairsFound = symmetricPairs(codecs, MSPCodes);
        const good = await verifySetters(v, agreeing, names, pairsFound);
        check("verify_msp setters passes correct setters", good.bad === 0 && good.ok > 0, good.lines.at(-1));

        const [getCode, setCode] = pairsFound.find(([, s]) => codecs[s].ops.filter((op) => op[0] === "f").length > 1) ?? [];
        if (setCode) {
            const broken = JSON.parse(JSON.stringify(manifest.raw));
            const ops = broken.msp_codecs[setCode].ops.filter((op) => op[0] === "f");
            [ops[0][3], ops[1][3]] = [ops[1][3], ops[0][3]]; // two fields swapped
            const bv = new VirtualMsp(new Manifest(broken), b);
            for (const bytes of b.groups.values()) bytes.forEach((_, i) => (bytes[i] = random()));
            b.groups.get(18)?.fill(0);
            const badSet = await verifySetters(bv, (c) => bv.read(c), names, [[getCode, setCode]]);
            check("verify_msp setters catches two swapped fields", badSet.bad === 1, badSet.lines.join(" | "));
        }
    }

    if (asymmetric.length) {
        console.log(`skipped ${asymmetric.length} pairs whose layouts differ by design: ${asymmetric.join(", ")}`);
    }
    console.log(`exercised ${reads} reply codecs and ${pairs} GET/SET pairs from ${manifest.raw.build?.target ?? path}`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
