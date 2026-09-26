/**
 * Legacy MSP config opcodes, answered client-side.
 *
 * Step 5 of the firmware's parameter-addressing-design.md deletes the
 * hand-written MSP config catalogue. The configurator's tabs still speak it
 * (msp-opcode-classification.md: 110 of 130 config opcodes), so instead of
 * rewriting each tab this layer answers those opcodes itself: a reply is built
 * from PARAM_READ, a setter becomes PARAM_WRITEs. Tabs, FC state and
 * MSPHelper's decoders see the same bytes they always did.
 *
 * What each opcode's bytes mean comes from the manifest's `msp_codecs`,
 * extracted at build time from the firmware's own msp.c for that exact build
 * (wf_msp_codecs.py, which documents the op encoding). Opcodes it could not
 * extract have no codec, and this layer does not handle them.
 *
 * Nothing here is used until it has been verified: verify() compares every
 * reply this would give with the firmware's real one, while both exist.
 */

import { readSpan, writeChunked, readProfileSelection } from "./group_io.js";

export class VirtualMspError extends Error {}

const PROFILE_FLAGS = { P: "pid", R: "rate", T: "tv" };

/**
 * One shape for every op kind: where its bytes are, how many, its flags.
 * `wire` is how many request/reply bytes it takes (strings: variable).
 */
function info(op) {
    switch (op[0]) {
        case "f":
            return { kind: "f", w: op[1], pgn: op[2], off: op[3], size: op[4], flags: op[5], check: op[6] };
        case "x":
            return {
                kind: "x", w: op[1], pgn: op[2], off: op[3], size: op[4], flags: op[5],
                sel: { pgn: op[6], off: op[7], size: op[8] }, stride: op[9], count: op[10],
            };
        case "d":
            return { kind: "d", w: op[1], pgn: op[2], off: op[3], size: op[1], flags: op[4] };
        case "z":
            return { kind: "z", pgn: op[2], off: op[3], size: op[1], flags: op[4] };
        case "Z":
            return { kind: "Z", max: op[1], pgn: op[3], off: op[4], size: op[2], flags: op[5] };
        case "c":
            return { kind: "c", w: op[1], value: op[2], flags: op[3] };
        case "s":
            return { kind: "s", w: op[1], flags: op[2] };
        default:
            throw new VirtualMspError(`unknown codec op ${op[0]}`);
    }
}

/** Two's complement of `value` in `bytes` little-endian bytes. */
function putInt(out, value, bytes) {
    let v = BigInt.asUintN(bytes * 8, BigInt(Math.trunc(value)));
    for (let i = 0; i < bytes; i++) {
        out.push(Number(v & 0xffn));
        v >>= 8n;
    }
}

/**
 * The request bytes that select element `i` of an indexed codec: the index
 * itself, or the id a const table gives element `i` (index.map).
 */
export function indexRequest(codec, i) {
    const value = codec.index.map ? codec.index.map[i] : i;
    const out = [];
    putInt(out, value, codec.index.w);
    return out;
}

function getInt(bytes, at, size, signed) {
    let v = 0n;
    for (let i = size - 1; i >= 0; i--) {
        v = (v << 8n) | BigInt(bytes[at + i]);
    }
    return Number(signed ? BigInt.asIntN(size * 8, v) : v);
}

export class VirtualMsp {
    /**
     * @param manifest a Manifest carrying msp_codecs
     * @param io       { readRange, writeRange }
     */
    constructor(manifest, io) {
        this.manifest = manifest;
        this.io = io;
        this.codecs = manifest.raw.msp_codecs ?? {};
    }

    codec(code) {
        return this.codecs[String(code)] ?? null;
    }

    has(code) {
        return this.codec(code) !== null;
    }

    #group(pgn) {
        const group = this.manifest.group(pgn);
        if (!group) {
            throw new VirtualMspError(`codec names pgn ${pgn}, which this manifest does not have`);
        }
        return group;
    }

    /**
     * The element a request selects (a setter's first bytes, or a
     * request-indexed reply's), or null where the firmware accepts a request
     * that selects none and does nothing (index.miss "ignore").
     */
    static #index(code, codec, data) {
        if (codec.len !== undefined && data.length !== codec.len) {
            throw new VirtualMspError(`opcode ${code} takes ${codec.len} bytes, got ${data.length}`);
        }
        if (codec.min_len !== undefined && data.length < codec.min_len) {
            throw new VirtualMspError(`opcode ${code} takes at least ${codec.min_len} bytes, got ${data.length}`);
        }
        if (!codec.index) return 0;
        if (data.length < codec.index.w) {
            throw new VirtualMspError(`opcode ${code} is missing its index`);
        }
        const value = getInt(data, 0, codec.index.w, false);
        // index.map: the request names an element by the id a const table gives it
        const index = codec.index.map ? codec.index.map.indexOf(value) : value;
        if (index < 0 || index >= codec.index.max) {
            if (codec.index.miss === "ignore") return null;
            throw new VirtualMspError(`opcode ${code}: index ${value} selects no element`);
        }
        return index;
    }

    /**
     * Everything that decides where ops land before their bytes are read: the
     * profile selection, the index, and each selected element's selector.
     */
    async #where(codec, ops, index) {
        let selection = null;
        if (ops.some((o) => o.flags && /[PRT]/.test(o.flags))) {
            selection = await readProfileSelection(this.manifest, this.io);
        }
        const offsets = [];
        for (const o of ops) {
            if (o.pgn === undefined) {
                offsets.push(null);
                continue;
            }
            const group = this.#group(o.pgn);
            const elem = group.size / group.length;
            let at = o.off;
            const profile = [...o.flags].map((f) => PROFILE_FLAGS[f]).find(Boolean);
            if (profile) {
                at += selection[profile] * elem;
            } else if (o.flags.includes("i")) {
                at += index * (codec.index?.stride ?? elem);
            }
            if (o.kind === "x") {
                const view = await readSpan(this.io, o.sel.pgn, o.sel.off, o.sel.size);
                const which = getInt(view, 0, o.sel.size, false);
                if (which >= o.count) {
                    throw new VirtualMspError(`selector for pgn ${o.pgn}+${o.off} is ${which}, past ${o.count - 1}`);
                }
                at += which * o.stride;
            }
            if (at + o.size > group.size) {
                throw new VirtualMspError(`codec reaches past pgn ${o.pgn}'s ${group.size} bytes`);
            }
            offsets.push(at);
        }
        return offsets;
    }

    /** The reply the firmware would give to request `code` (with `payload`, for an indexed reply). */
    async read(code, payload = []) {
        const codec = this.codec(code);
        if (!codec || codec.dir !== "out") {
            throw new VirtualMspError(`no reply codec for opcode ${code}`);
        }
        const data = payload instanceof Uint8Array ? payload : Uint8Array.from(payload || []);
        const index = VirtualMsp.#index(code, codec, data);
        if (index === null) return new Uint8Array(0); // the firmware writes nothing
        const ops = codec.ops.map(info);
        const offsets = await this.#where(codec, ops, index);

        // Only the span of each group the reply needs: three fields of
        // pidProfiles should not cost the whole 612-byte group.
        const spans = new Map();
        ops.forEach((o, i) => {
            if (offsets[i] === null) return;
            const s = spans.get(o.pgn) ?? { lo: offsets[i], hi: offsets[i] + o.size };
            spans.set(o.pgn, { lo: Math.min(s.lo, offsets[i]), hi: Math.max(s.hi, offsets[i] + o.size) });
        });
        const bytes = new Map();
        for (const [pgn, { lo, hi }] of spans) {
            const view = new Uint8Array(this.#group(pgn).size);
            view.set(await readSpan(this.io, pgn, lo, hi - lo), lo);
            bytes.set(pgn, view);
        }

        const out = [];
        ops.forEach((o, i) => {
            const b = bytes.get(o.pgn);
            const at = offsets[i];
            switch (o.kind) {
                case "c":
                    putInt(out, o.value, o.w);
                    break;
                case "f":
                case "x":
                    if (o.w === o.size) {
                        out.push(...b.slice(at, at + o.size)); // exact, whatever the width
                    } else {
                        // C widens a signed field by sign extension, an unsigned one by zero.
                        putInt(out, getInt(b, at, o.size, o.flags.includes("s")), o.w);
                    }
                    break;
                case "d":
                    out.push(...b.slice(at, at + o.size));
                    break;
                case "z":
                    for (let k = 0; k < o.size && b[at + k] !== 0; k++) out.push(b[at + k]);
                    break;
                default:
                    throw new VirtualMspError(`op ${o.kind} in a reply codec`);
            }
        });
        return Uint8Array.from(out);
    }

    /**
     * Apply a setter's payload as the firmware would: returns once written,
     * throws VirtualMspError where the firmware answered MSP_RESULT_ERROR.
     */
    async write(code, payload) {
        for (const { pgn, offset, bytes } of await this.plan(code, payload)) {
            await writeChunked(this.io, pgn, offset, bytes);
        }
    }

    /**
     * What write() would store, without storing it: contiguous runs of
     * { pgn, offset, bytes }, empty where the firmware stores nothing.
     * Throws VirtualMspError where the firmware refuses the request.
     */
    async plan(code, payload) {
        const codec = this.codec(code);
        if (!codec || codec.dir !== "in") {
            throw new VirtualMspError(`no setter codec for opcode ${code}`);
        }
        const data = payload instanceof Uint8Array ? payload : Uint8Array.from(payload ?? []);
        const index = VirtualMsp.#index(code, codec, data);
        if (index === null) return []; // accepted, and nothing stored
        let at = codec.index ? codec.index.w : 0;

        const ops = codec.ops.map(info);
        const offsets = await this.#where(codec, ops, index);
        const patches = new Map(); // pgn -> Map(offset -> byte)
        const patch = (pgn, off, bytes) => {
            if (!patches.has(pgn)) patches.set(pgn, new Map());
            bytes.forEach((b, i) => patches.get(pgn).set(off + i, b));
        };

        for (let i = 0; i < ops.length; i++) {
            const o = ops[i];
            if (o.kind === "Z") {
                // memset the field, then copy what the request sent, at most max
                const n = Math.min(o.max, data.length - at);
                const bytes = new Array(o.size).fill(0);
                for (let k = 0; k < n; k++) bytes[k] = data[at + k];
                at += n;
                patch(o.pgn, offsets[i], bytes);
                continue;
            }
            if (at + o.w > data.length) {
                if (o.flags.includes("o")) continue; // an optional tail the request left out
                // The firmware would read past the buffer; refuse instead.
                throw new VirtualMspError(`opcode ${code}: request is ${data.length} bytes, too short`);
            }
            if (o.kind === "s") {
                at += o.w;
                continue;
            }
            if (o.kind !== "f" && o.kind !== "x") {
                throw new VirtualMspError(`op ${o.kind} in a setter codec`);
            }
            if (o.w === o.size && !o.check) {
                patch(o.pgn, offsets[i], [...data.slice(at, at + o.w)]); // exact, whatever the width
                at += o.w;
                continue;
            }
            const value = getInt(data, at, o.w, o.flags.includes("w"));
            at += o.w;
            if (o.check && ((o.check.min !== undefined && value < o.check.min) || (o.check.max !== undefined && value > o.check.max))) {
                throw new VirtualMspError(`opcode ${code}: ${value} is out of range`);
            }
            const bytes = [];
            putInt(bytes, value, o.size); // the store truncates to the field
            patch(o.pgn, offsets[i], bytes);
        }

        // Contiguous runs, so a whole struct goes in as few writes as possible.
        const runs = [];
        for (const [pgn, map] of patches) {
            const offs = [...map.keys()].sort((a, b) => a - b);
            let start = 0;
            while (start < offs.length) {
                let end = start;
                while (end + 1 < offs.length && offs[end + 1] === offs[end] + 1) end++;
                const run = offs.slice(start, end + 1).map((o) => map.get(o));
                runs.push({ pgn, offset: offs[start], bytes: Uint8Array.from(run) });
                start = end + 1;
            }
        }
        return runs;
    }
}
