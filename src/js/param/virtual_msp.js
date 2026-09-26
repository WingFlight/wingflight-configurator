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

import { readGroup, writeChunked, readProfileSelection } from "./group_io.js";

export class VirtualMspError extends Error {}

const PROFILE_FLAGS = { P: "pid", R: "rate", T: "tv" };

function flagsOf(op) {
    switch (op[0]) {
        case "f":
            return op[5];
        case "c":
            return op[3];
        case "s":
            return op[2];
        default:
            return op[4];
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

    /** The groups an opcode touches, and where the selected profiles start. */
    async #context(codec) {
        const groups = new Map();
        let selection = null;
        for (const op of codec.ops) {
            if (op[0] === "f" || op[0] === "d") {
                const pgn = op[2];
                if (!groups.has(pgn)) {
                    const group = this.manifest.group(pgn);
                    if (!group) {
                        throw new VirtualMspError(`codec names pgn ${pgn}, which this manifest does not have`);
                    }
                    groups.set(pgn, group);
                }
                if (!selection && /[PRT]/.test(flagsOf(op))) {
                    selection = await readProfileSelection(this.manifest, this.io);
                }
            }
        }
        return { groups, selection };
    }

    /** Byte offset of an op in its group, given the profile selection or element index. */
    static #offset(op, group, selection, index) {
        const flags = flagsOf(op);
        const off = op[3]; // "f" and "d" both carry the offset fourth
        const elem = group.size / group.length;
        const profile = [...flags].map((f) => PROFILE_FLAGS[f]).find(Boolean);
        if (profile) {
            return off + selection[profile] * elem;
        }
        if (flags.includes("i")) {
            return off + index * elem;
        }
        return off;
    }

    /** The reply the firmware would give to request `code`. */
    async read(code) {
        const codec = this.codec(code);
        if (!codec || codec.dir !== "out") {
            throw new VirtualMspError(`no reply codec for opcode ${code}`);
        }
        const { groups, selection } = await this.#context(codec);
        const bytes = new Map();
        for (const [pgn, group] of groups) {
            bytes.set(pgn, await readGroup(this.io, group));
        }

        const out = [];
        for (const op of codec.ops) {
            if (op[0] === "c") {
                putInt(out, op[2], op[1]);
            } else if (op[0] === "f") {
                const [, w, pgn, , size, flags] = op;
                const at = VirtualMsp.#offset(op, groups.get(pgn), selection, 0);
                // C widens a signed field by sign extension, an unsigned one by zero.
                putInt(out, getInt(bytes.get(pgn), at, size, flags.includes("s")), w);
            } else if (op[0] === "d") {
                const [, len, pgn] = op;
                const at = VirtualMsp.#offset(op, groups.get(pgn), selection, 0);
                out.push(...bytes.get(pgn).slice(at, at + len));
            } else {
                throw new VirtualMspError(`op ${op[0]} in a reply codec`);
            }
        }
        return Uint8Array.from(out);
    }

    /**
     * Apply a setter's payload as the firmware would: returns once written,
     * throws VirtualMspError where the firmware answered MSP_RESULT_ERROR.
     */
    async write(code, payload) {
        const codec = this.codec(code);
        if (!codec || codec.dir !== "in") {
            throw new VirtualMspError(`no setter codec for opcode ${code}`);
        }
        const data = payload instanceof Uint8Array ? payload : Uint8Array.from(payload ?? []);
        if (codec.len !== undefined && data.length !== codec.len) {
            throw new VirtualMspError(`opcode ${code} takes ${codec.len} bytes, got ${data.length}`);
        }
        if (codec.min_len !== undefined && data.length < codec.min_len) {
            throw new VirtualMspError(`opcode ${code} takes at least ${codec.min_len} bytes, got ${data.length}`);
        }

        let at = 0;
        const take = (w, signed) => {
            const v = getInt(data, at, w, signed);
            at += w;
            return v;
        };

        let index = 0;
        if (codec.index) {
            if (data.length < codec.index.w) {
                throw new VirtualMspError(`opcode ${code} is missing its index`);
            }
            index = take(codec.index.w, false);
            if (index >= codec.index.max) {
                throw new VirtualMspError(`opcode ${code}: index ${index} is past ${codec.index.max - 1}`);
            }
        }

        const { groups, selection } = await this.#context(codec);
        const patches = new Map(); // pgn -> Map(offset -> byte)
        for (const op of codec.ops) {
            const w = op[1];
            const flags = flagsOf(op);
            if (at + w > data.length) {
                if (flags.includes("o")) {
                    continue; // an optional tail the request did not send
                }
                // The firmware would read past the buffer; refuse instead.
                throw new VirtualMspError(`opcode ${code}: request is ${data.length} bytes, too short`);
            }
            if (op[0] === "s") {
                at += w;
                continue;
            }
            if (op[0] !== "f") {
                throw new VirtualMspError(`op ${op[0]} in a setter codec`);
            }
            const [, , pgn, , size, , check] = op;
            const value = take(w, flags.includes("w"));
            if (check && ((check.min !== undefined && value < check.min) || (check.max !== undefined && value > check.max))) {
                throw new VirtualMspError(`opcode ${code}: ${value} is out of range`);
            }
            const off = VirtualMsp.#offset(op, groups.get(pgn), selection, index);
            const bytes = [];
            putInt(bytes, value, size); // the store truncates to the field
            if (!patches.has(pgn)) patches.set(pgn, new Map());
            bytes.forEach((b, i) => patches.get(pgn).set(off + i, b));
        }

        // Contiguous runs, so a whole struct goes in as few writes as possible.
        for (const [pgn, patch] of patches) {
            const offsets = [...patch.keys()].sort((a, b) => a - b);
            let start = 0;
            while (start < offsets.length) {
                let end = start;
                while (end + 1 < offsets.length && offsets[end + 1] === offsets[end] + 1) end++;
                const run = offsets.slice(start, end + 1).map((o) => patch.get(o));
                await writeChunked(this.io, pgn, offsets[start], Uint8Array.from(run));
                start = end + 1;
            }
        }
    }
}
