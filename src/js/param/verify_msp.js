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

import { VirtualMspError } from "./virtual_msp.js";

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
    const out = [];
    for (let i = 0; i < codec.index.max; i++) {
        const bytes = [];
        for (let k = 0, v = i; k < codec.index.w; k++, v = Math.floor(v / 256)) bytes.push(v % 256);
        out.push(bytes);
    }
    return out;
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
            const request = i === null ? [] : [i];
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
