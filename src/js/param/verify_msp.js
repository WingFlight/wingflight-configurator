/**
 * `verify_msp`: check the virtual MSP layer against the firmware itself.
 *
 * While the firmware still has its config catalogue, every reply the virtual
 * layer would give can be compared with the real one, byte for byte. That is
 * the test that decides whether a codec may be trusted; nothing offline can
 * show it. See virtual_msp.js.
 *
 * With `setters`, each GET/SET pair is also checked by writing the current
 * values back through the virtual setter and reading the real GET again: a
 * setter that addresses the right fields changes nothing. That writes RAM
 * config (never saved), so it is opt-in.
 */

import { VirtualMspError, indexRequest } from "./virtual_msp.js";
import { readSpan, writeChunked } from "./group_io.js";

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");

/** The codec op that produces reply byte `pos`, for a readable mismatch. */
function opAt(codec, pos) {
    let at = 0;
    for (const op of codec.ops) {
        if (op[0] === "z") return `pgn ${op[2]} offset ${op[3]} (a string)`; // variable length from here on
        if (pos < at + op[1]) {
            if (op[0] === "f" || op[0] === "x") return `pgn ${op[2]} offset ${op[3]}`;
            return op[0] === "c" ? "a constant" : "raw bytes";
        }
        at += op[1];
    }
    return "past the codec";
}

/** The requests to check a reply codec with: none, or each index it takes. */
function requestsFor(codec) {
    if (!codec.index) return [[]];
    return Array.from({ length: codec.index.max }, (_, i) => indexRequest(codec, i));
}

function firstDifference(a, b) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
        if (a[i] !== b[i]) return i;
    }
    return -1;
}

/**
 * @param virtual     a VirtualMsp
 * @param rawRequest  (code, payload?) => Uint8Array of the firmware's reply, or null if refused
 * @param names       { code: "MSP_NAME" } for the report
 */
export async function verifyReplies(virtual, rawRequest, names = {}) {
    const lines = [];
    const matched = [];
    let ok = 0;
    let bad = 0;
    for (const [code, codec] of Object.entries(virtual.codecs)) {
        if (codec.dir !== "out") continue;
        const name = names[code] ?? `opcode ${code}`;
        // A request-indexed reply is checked at every index it takes, and
        // counts as matching only if all of them do.
        let verdict = "ok";
        for (const request of requestsFor(codec)) {
            const label = request.length ? `${name}[${request.join(",")}]` : name;
            const real = await rawRequest(Number(code), request.length ? request : undefined);
            if (real === null) {
                lines.push(`SKIP ${label}: the firmware refused the request`);
                verdict = verdict === "ok" ? "skip" : verdict;
                continue;
            }
            let mine;
            try {
                mine = await virtual.read(Number(code), request);
            } catch (error) {
                lines.push(`FAIL ${label}: ${error.message}`);
                verdict = "bad";
                break;
            }
            const at = firstDifference(real, mine);
            if (at >= 0) {
                lines.push(
                    `FAIL ${label}: byte ${at} (${opAt(codec, at)}) is ${hex(mine.slice(at, at + 1))} here, ` +
                        `${hex(real.slice(at, at + 1))} on the board (${mine.length} vs ${real.length} bytes)`,
                );
                verdict = "bad";
                break;
            }
        }
        if (verdict === "ok") {
            ok++;
            matched.push(Number(code));
        } else if (verdict === "bad") {
            bad++;
        }
    }
    lines.push(`# replies: ${ok} match the firmware, ${bad} do not`);
    return { ok, bad, lines, matched };
}

/**
 * { get, set, indexed } for each GET/SET pair whose codecs put the same
 * fields at the same wire positions -- the ones where writing a GET's reply
 * back through the SET is meaningful:
 *   MSP_X / MSP_SET_X            plain pairs, and string pairs (NAME)
 *   MSP_GET_X / MSP_SET_X        request-indexed reply / indexed setter; the
 *                                SET payload is the index, then the reply
 * Pairs with a header byte on one side only (MSP_DEBUG_CONFIG) are left out.
 */
export function symmetricPairs(codecs, codes) {
    const key = (op) => {
        if (op[0] === "f" || op[0] === "x") return `${op[2]}:${op[3]}:${op[5].replace(/[osw]/g, "")}`;
        if (op[0] === "z") return `str:${op[2]}:${op[3]}`;
        if (op[0] === "Z") return `str:${op[3]}:${op[4]}`;
        return null;
    };
    const layout = (ops) => {
        const out = new Map();
        let pos = 0;
        for (const op of ops) {
            const k = key(op);
            if (k) out.set(k, { pos, w: op[0] === "z" || op[0] === "Z" ? 0 : op[1] });
            pos += op[0] === "z" || op[0] === "Z" ? 0 : op[1];
        }
        return out;
    };
    const aligned = (get, set) => {
        const g = layout(get.ops);
        const s = layout(set.ops);
        return s.size > 0 && [...s].every(([k, f]) => g.get(k)?.pos === f.pos && g.get(k)?.w === f.w);
    };
    const pairs = [];
    for (const [name, code] of Object.entries(codes)) {
        const get = codecs[code];
        if (!get || get.dir !== "out") continue;
        if (get.index) {
            const setCode = codes[name.replace(/^MSP_GET_/, "MSP_SET_")];
            const set = setCode !== undefined && setCode !== code ? codecs[setCode] : null;
            if (set?.dir === "in" && set.index && set.index.w === get.index.w && aligned(get, set)) {
                pairs.push({ get: code, set: setCode, indexed: get.index });
            }
            continue;
        }
        const setCode = codes[name.replace(/^MSP_/, "MSP_SET_").replace(/^MSP2_WING_/, "MSP2_WING_SET_")];
        const set = setCode !== undefined ? codecs[setCode] : null;
        if (!set || set.dir !== "in" || set.index || set.len !== undefined) continue;
        if (aligned(get, set)) pairs.push({ get: code, set: setCode, indexed: null });
    }
    return pairs;
}

/** SET with the current values must leave the real GET unchanged. */
export async function verifySetters(virtual, rawRequest, names = {}, pairs = []) {
    const lines = [];
    let ok = 0;
    let bad = 0;
    for (const { get: getCode, set: setCode, indexed } of pairs) {
        const name = names[setCode] ?? `opcode ${setCode}`;
        // Indexed pairs at their first, middle and last index.
        const indices = indexed ? [...new Set([0, Math.floor(indexed.max / 2), indexed.max - 1])] : [null];
        let verdict = "ok";
        for (const i of indices) {
            const request = i === null ? [] : indexRequest(virtual.codec(setCode), i);
            const before = await rawRequest(getCode, request.length ? request : undefined);
            if (before === null) {
                verdict = "skip";
                continue;
            }
            try {
                await virtual.write(setCode, Uint8Array.from([...request, ...before]));
            } catch (error) {
                if (error instanceof VirtualMspError) {
                    lines.push(`SKIP ${name}${i === null ? "" : `[${i}]`}: ${error.message}`);
                    verdict = "skip";
                    continue;
                }
                throw error;
            }
            const after = await rawRequest(getCode, request.length ? request : undefined);
            const at = firstDifference(before, after ?? []);
            if (at >= 0) {
                lines.push(`FAIL ${name}${i === null ? "" : `[${i}]`}: writing the current values changed byte ${at} of ${names[getCode] ?? getCode}`);
                verdict = "bad";
                break;
            }
        }
        if (verdict === "ok") ok++;
        else if (verdict === "bad") bad++;
    }
    lines.push(`# setters: ${ok} leave the firmware's reply unchanged, ${bad} do not`);
    return { ok, bad, lines };
}

/**
 * A request for setter `codec` at element `i` (or none), with values the
 * codec's range checks accept, and random bytes elsewhere. `i === "miss"`
 * selects no element.
 */
export function samplePayload(codec, i, random) {
    const out = [];
    const put = (value, w) => {
        for (let k = 0; k < w; k++, value = Math.floor(value / 256)) out.push(value % 256);
    };
    if (codec.index) {
        if (i === "miss") {
            let value = codec.index.max;
            while (codec.index.map?.includes(value)) value++;
            put(value, codec.index.w);
        } else {
            out.push(...indexRequest(codec, i));
        }
    }
    for (const op of codec.ops) {
        const check = op[0] === "f" ? op[6] : undefined;
        if (check) {
            const lo = check.min ?? 0;
            const hi = check.max ?? lo + 255;
            put((lo + (random() % (hi - lo + 1)) + 2 ** 32) % 2 ** 32, op[1]);
        } else if (op[0] === "f" || op[0] === "x" || op[0] === "s") {
            for (let k = 0; k < op[1]; k++) out.push(random());
        } else if (op[0] === "Z") {
            for (let k = 0; k < op[1] + 3; k++) out.push(random()); // past its max, which is dropped
        }
    }
    if (codec.len !== undefined) {
        while (out.length < codec.len) out.push(random());
        out.length = codec.len;
    }
    return out;
}

/**
 * Every setter codec against the firmware's own setter, by effect: the same
 * request through each, from the same configuration, must leave the same
 * group bytes (or be refused by both). Covers setters without a matching
 * getter, which verifySetters cannot. It writes random values into RAM and
 * restores them after, and the firmware's setter also runs its side effects:
 * for SITL, not for a board.
 *
 * With `save`, both sides are compared after it: a setter's validation
 * (validateAndFixGyroConfig(), ...) is not replayed by the codec, and it is
 * the save that has to apply it. Run the save once before, so the starting
 * configuration is one validation leaves alone.
 *
 * @param io     { readRange, writeRange } -- PARAM_READ / PARAM_WRITE
 * @param random () => a byte
 * @param save   async () => void, e.g. MSP_EEPROM_WRITE
 */
export async function verifySetterEffects(virtual, rawRequest, io, names = {}, random = () => 0, save = null) {
    const lines = [];
    let ok = 0;
    let bad = 0;
    for (const [code, codec] of Object.entries(virtual.codecs)) {
        if (codec.dir !== "in") continue;
        const name = names[code] ?? `opcode ${code}`;
        const pgns = [...new Set(codec.ops.filter((op) => op[0] !== "c" && op[0] !== "s").map((op) => (op[0] === "Z" ? op[3] : op[2])))];
        const snapshot = async () => {
            const map = new Map();
            for (const pgn of pgns) {
                map.set(pgn, Uint8Array.from(await readSpan(io, pgn, 0, virtual.manifest.group(pgn).size)));
            }
            return map;
        };
        const restore = async (map) => {
            for (const [pgn, bytes] of map) await writeChunked(io, pgn, 0, bytes);
        };
        const samples = codec.index
            ? [...new Set([0, Math.floor(codec.index.max / 2), codec.index.max - 1]), "miss"]
            : [null];
        let verdict = "ok";
        for (const i of samples) {
            const label = `${name}${i === null ? "" : `[${i}]`}`;
            const payload = samplePayload(codec, i, random);
            const before = await snapshot();
            const realRefused = (await rawRequest(Number(code), payload)) === null;
            if (save) await save();
            const real = await snapshot();
            await restore(before);
            let virtualRefused = false;
            try {
                await virtual.write(Number(code), payload);
            } catch (error) {
                if (!(error instanceof VirtualMspError)) throw error;
                virtualRefused = true;
            }
            if (save) await save();
            const mine = await snapshot();
            await restore(before);
            if (realRefused !== virtualRefused) {
                lines.push(`FAIL ${label}: the firmware ${realRefused ? "refused" : "accepted"} it, the codec ${virtualRefused ? "refused" : "accepted"} it`);
                verdict = "bad";
                break;
            }
            const diff = pgns
                .map((pgn) => [pgn, firstDifference(real.get(pgn), mine.get(pgn))])
                .find(([, at]) => at >= 0);
            if (diff) {
                lines.push(`FAIL ${label}: pgn ${diff[0]} differs at offset ${diff[1]} ` +
                    `(firmware ${real.get(diff[0])[diff[1]]}, codec ${mine.get(diff[0])[diff[1]]})`);
                verdict = "bad";
                break;
            }
        }
        if (verdict === "ok") ok++;
        else bad++;
    }
    lines.push(`# setter effects: ${ok} store what the firmware's setter stores, ${bad} do not`);
    return { ok, bad, lines };
}

/**
 * Verify a setter codec on its first use, without writing anything: the
 * firmware's own setter has just accepted `payload`, so a correct codec
 * would store exactly the bytes that are now there. A codec aimed at the
 * wrong field finds other bytes there -- unless they happen to be equal,
 * which the SITL check (verifySetterEffects) does not leave to chance.
 * A setter whose validation changed what it stored fails too, which only
 * keeps it on the firmware's opcode.
 *
 * @returns { ok: true } | { ok: false, reason } | { ok: null, reason }
 *          (null: nothing to compare -- the request stored nothing)
 */
export async function checkSetterAfterFirmware(virtual, io, code, payload) {
    let runs;
    try {
        runs = await virtual.plan(code, payload);
    } catch (error) {
        if (!(error instanceof VirtualMspError)) throw error;
        return { ok: false, reason: `the firmware accepted a request the codec refuses (${error.message})` };
    }
    if (!runs.length) return { ok: null, reason: "the request stored nothing" };
    for (const { pgn, offset, bytes } of runs) {
        const stored = await readSpan(io, pgn, offset, bytes.length);
        const at = firstDifference(stored, bytes);
        if (at >= 0) {
            return { ok: false, reason: `pgn ${pgn} offset ${offset + at}: the firmware stored ${stored[at]}, the codec would store ${bytes[at]}` };
        }
    }
    return { ok: true };
}
