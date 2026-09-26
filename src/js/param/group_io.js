/**
 * Whole-group transfers and the board's profile selection, over addressed
 * access. Shared by the CLI's table commands and the virtual MSP layer.
 */

/**
 * Largest range moved per request. The smallest MSP buffers are 320 bytes out
 * and 192 in (msp_serial.h), and mixerRules alone is 512 bytes, so a whole
 * group cannot be assumed to fit either way.
 */
export const CHUNK = 128;

async function readChunked(read, group) {
    const out = new Uint8Array(group.size);
    for (let off = 0; off < group.size; off += CHUNK) {
        const view = await read(group.pgn, off, Math.min(CHUNK, group.size - off));
        out.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), off);
    }
    return out;
}

export function readGroup(io, group) {
    return readChunked((pgn, off, len) => io.readRange(pgn, off, len), group);
}

export function readDefaultGroup(io, group) {
    return io.readDefaultRange ? readChunked((pgn, off, len) => io.readDefaultRange(pgn, off, len), group) : null;
}

export async function writeChunked(io, pgn, offset, bytes) {
    for (let at = 0; at < bytes.length; at += CHUNK) {
        await io.writeRange(pgn, offset + at, [...bytes.slice(at, at + CHUNK)]);
    }
}

const SYSTEM_CONFIG_PGN = 18;
const SELECTION_FIELDS = { pid: "pidProfileIndex", rate: "activeRateProfile", tv: "tvProfileIndex" };

/** The board's selected pid / rate / tv profile, from systemConfig. */
export async function readProfileSelection(manifest, io) {
    const selection = { pid: 0, rate: 0, tv: 0 };
    const group = manifest.group(SYSTEM_CONFIG_PGN);
    if (!group || !io.readRange) {
        return selection;
    }
    const view = await io.readRange(SYSTEM_CONFIG_PGN, 0, group.size);
    for (const [kind, field] of Object.entries(SELECTION_FIELDS)) {
        const at = group.fields?.find((f) => f.name === field)?.off;
        if (at !== undefined) {
            selection[kind] = view.getUint8(at);
        }
    }
    return selection;
}
