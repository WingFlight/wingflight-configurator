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
        if (pos < at + op[1]) {
            return op[0] === "f" ? `pgn ${op[2]} offset ${op[3]}` : op[0] === "c" ? "a constant" : "raw bytes";
        }
        at += op[1];
    }
    return "past the codec";
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
    let ok = 0;
    let bad = 0;
    for (const [code, codec] of Object.entries(virtual.codecs)) {
        if (codec.dir !== "out") continue;
        const name = names[code] ?? `opcode ${code}`;
        const real = await rawRequest(Number(code));
        if (real === null) {
            lines.push(`SKIP ${name}: the firmware refused the request`);
            continue;
        }
        let mine;
        try {
            mine = await virtual.read(Number(code));
        } catch (error) {
            lines.push(`FAIL ${name}: ${error.message}`);
            bad++;
            continue;
        }
        const at = firstDifference(real, mine);
        if (at < 0) {
            ok++;
        } else {
            bad++;
            lines.push(
                `FAIL ${name}: byte ${at} (${opAt(codec, at)}) is ${hex(mine.slice(at, at + 1))} here, ` +
                    `${hex(real.slice(at, at + 1))} on the board (${mine.length} vs ${real.length} bytes)`,
            );
        }
    }
    lines.push(`# replies: ${ok} match the firmware, ${bad} do not`);
    return { ok, bad, lines };
}

/**
 * [getCode, setCode] for each MSP_X / MSP_SET_X pair whose codecs put the
 * same fields at the same wire positions -- the ones where writing a GET's
 * reply back through the SET is meaningful. Pairs with a header byte on one
 * side only (MSP_DEBUG_CONFIG) or an index are left out.
 */
export function symmetricPairs(codecs, codes) {
    const layout = (ops) => {
        const out = new Map();
        let pos = 0;
        for (const op of ops) {
            if (op[0] === "f") out.set(`${op[2]}:${op[3]}:${op[5].replace(/[osw]/g, "")}`, { pos, w: op[1] });
            pos += op[1];
        }
        return out;
    };
    const pairs = [];
    for (const [name, code] of Object.entries(codes)) {
        const get = codecs[code];
        if (!get || get.dir !== "out") continue;
        const setCode = codes[name.replace(/^MSP_/, "MSP_SET_").replace(/^MSP2_WING_/, "MSP2_WING_SET_")];
        const set = setCode !== undefined ? codecs[setCode] : null;
        if (!set || set.dir !== "in" || set.index || set.len !== undefined) continue;
        const g = layout(get.ops);
        const s = layout(set.ops);
        if (s.size && [...s].every(([key, f]) => g.get(key)?.pos === f.pos && g.get(key)?.w === f.w)) {
            pairs.push([code, setCode]);
        }
    }
    return pairs;
}

/** SET with the current values must leave the real GET unchanged. */
export async function verifySetters(virtual, rawRequest, names = {}, pairs = []) {
    const lines = [];
    let ok = 0;
    let bad = 0;
    for (const [getCode, setCode] of pairs) {
        const name = names[setCode] ?? `opcode ${setCode}`;
        const before = await rawRequest(getCode);
        if (before === null) continue;
        try {
            await virtual.write(setCode, before);
        } catch (error) {
            if (error instanceof VirtualMspError) {
                lines.push(`SKIP ${name}: ${error.message}`);
                continue;
            }
            throw error;
        }
        const after = await rawRequest(getCode);
        const at = firstDifference(before, after ?? []);
        if (at < 0) {
            ok++;
        } else {
            bad++;
            lines.push(`FAIL ${name}: writing the current values changed byte ${at} of ${names[getCode] ?? getCode}`);
        }
    }
    lines.push(`# setters: ${ok} leave the firmware's reply unchanged, ${bad} do not`);
    return { ok, bad, lines };
}
