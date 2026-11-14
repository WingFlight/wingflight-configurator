/**
 * Custom defaults, compiled.
 *
 * A board's config text (a wingflight-targets .config, or a `diff hardware`
 * read off a DIY board) used to be inserted into the hex as text and replayed
 * through the on-board CLI on every reset to defaults. The firmware has no CLI
 * any more, so the text is compiled here instead, against the manifest of the
 * hex being flashed, into the field writes it stands for. The firmware applies
 * them after its own reset (src/main/config/custom_defaults.c), with the same
 * bounds check as MSP2_WING_PARAM_WRITE.
 *
 * Compiling runs every line through the client-side CLI twice, against two
 * images of the groups: one where everything the compiler cannot know is
 * 0x00, one where it is 0xFF. A bit the line sets comes out the same in both;
 * a bit it leaves alone (the other features in `feature X`, the rest of a
 * struct `servo` only partly writes) comes out different and keeps the reset
 * value on the board. That is the record's mask. A line whose *writes* differ
 * between the two runs depends on a value only the board knows, and is
 * refused rather than guessed at.
 *
 * Some reset values the compiler does know, and seeds both images with:
 * which serial port sits in which slot (the `serial` command finds its slot by
 * identifier), the empty board information, and profile 0 selected.
 *
 * The byte format is documented in the firmware's config/custom_defaults.h.
 */

import { ParamCli, PROFILE_KINDS } from "./cli.js";
import { readSettingVia, writeSettingVia } from "./setting_io.js";

export const CUSTOM_DEFAULTS_MAGIC = 0x44434657; // "WFCD"
export const CUSTOM_DEFAULTS_FORMAT_VERSION = 1;

const HEADER_SIZE = 20;
const CRC_COVERED_HEADER = 16;
const RECORD_HEADER_SIZE = 6;
const RECORD_MASKED = 1 << 0;
const MAX_RECORD_LENGTH = 0xff;
const MAX_PAYLOAD_LENGTH = 0xffff;
const BUILD_ID_LENGTH = 8;
const FULL_MASK = 0xff;

const BACKGROUNDS = [0x00, 0xff];

const SYSTEM_CONFIG_PGN = 18;

/** Lines that steer a replay but write nothing; a compile has nothing to do for them. */
const PASSIVE_COMMANDS = new Set(["batch", "save"]);

export class CustomDefaultsError extends Error {}

/** CRC16-CCITT, initial value 0, as common/crc.c's crc16_ccitt_update(). */
export function crc16ccitt(crc, bytes) {
    for (const byte of bytes) {
        crc ^= byte << 8;
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc;
}

function buildIdBytes(buildId) {
    if (typeof buildId !== "string" || !/^[0-9a-f]{16}$/i.test(buildId)) {
        throw new CustomDefaultsError(`build ID '${buildId}' is not ${BUILD_ID_LENGTH} hex bytes`);
    }
    return Array.from({ length: BUILD_ID_LENGTH }, (_, i) => parseInt(buildId.slice(2 * i, 2 * i + 2), 16));
}

function u16(value) {
    return [value & 0xff, (value >> 8) & 0xff];
}

/**
 * The area's bytes for a list of records `{ pgn, offset, data, mask? }`.
 * `mask` is left out for a plain record.
 */
export function encodeCustomDefaults(buildId, records) {
    const payload = [];
    for (const { pgn, offset, data, mask } of records) {
        if (!data.length || data.length > MAX_RECORD_LENGTH || (mask && mask.length !== data.length)) {
            throw new CustomDefaultsError(`record for group ${pgn}+${offset} has a bad length`);
        }
        payload.push(...u16(pgn), ...u16(offset), data.length, mask ? RECORD_MASKED : 0, ...data, ...(mask ?? []));
    }
    if (payload.length > MAX_PAYLOAD_LENGTH) {
        throw new CustomDefaultsError(`${payload.length} bytes of records do not fit one area`);
    }
    const header = [
        CUSTOM_DEFAULTS_MAGIC & 0xff,
        (CUSTOM_DEFAULTS_MAGIC >>> 8) & 0xff,
        (CUSTOM_DEFAULTS_MAGIC >>> 16) & 0xff,
        (CUSTOM_DEFAULTS_MAGIC >>> 24) & 0xff,
        CUSTOM_DEFAULTS_FORMAT_VERSION,
        0,
        ...u16(payload.length),
        ...buildIdBytes(buildId),
    ];
    const crc = crc16ccitt(crc16ccitt(0, header.slice(0, CRC_COVERED_HEADER)), payload);
    return Uint8Array.from([...header, ...u16(crc), 0, 0, ...payload]);
}

/** The records in an area, for checking a compile. The inverse of encodeCustomDefaults(). */
export function decodeCustomDefaults(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < HEADER_SIZE || view.getUint32(0, true) !== CUSTOM_DEFAULTS_MAGIC) {
        throw new CustomDefaultsError("not a custom defaults area");
    }
    const length = view.getUint16(6, true);
    const buildId = [...bytes.slice(8, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const records = [];
    let at = HEADER_SIZE;
    while (at < HEADER_SIZE + length) {
        const pgn = view.getUint16(at, true);
        const offset = view.getUint16(at + 2, true);
        const count = bytes[at + 4];
        const masked = bytes[at + 5] & RECORD_MASKED;
        at += RECORD_HEADER_SIZE;
        const data = [...bytes.slice(at, at + count)];
        at += count;
        const mask = masked ? [...bytes.slice(at, at + count)] : undefined;
        if (masked) at += count;
        records.push({ pgn, offset, data, ...(mask ? { mask } : {}) });
    }
    return { buildId, records };
}

/** What the firmware does with the records: for checking a compile against a board. */
export function applyCustomDefaults(records, groups) {
    for (const { pgn, offset, data, mask } of records) {
        const bytes = groups.get(pgn);
        data.forEach((value, i) => {
            const m = mask ? mask[i] : FULL_MASK;
            bytes[offset + i] = (bytes[offset + i] & ~m) | (value & m);
        });
    }
}

// --- what the compiler knows of the reset --------------------------------------

function groupBySymbol(manifest, symbol) {
    return manifest.raw.pgs.find((pg) => pg.symbol === symbol) ?? null;
}

function putInt(bytes, offset, size, value) {
    for (let i = 0; i < size; i++) {
        bytes[offset + i] = (value >> (8 * i)) & 0xff;
    }
}

/**
 * Group bytes whose reset value does not depend on the target: `[pgn, offset,
 * bytes]`. Each one is either something a command reads to decide what to
 * write, or would make an unrelated line look board-dependent.
 */
export function knownResetBytes(manifest) {
    const known = [];

    // pgResetFn_serialConfig(): one port per slot, in serialPortIdentifiers order.
    const serial = groupBySymbol(manifest, "serialConfig_System");
    const ports = serial?.fields.find((f) => f.name === "portConfigs");
    const identifier = ports?.fields?.find((f) => f.name === "identifier");
    (manifest.raw.cli?.serial_ports ?? []).forEach((id, slot) => {
        if (!identifier || slot >= ports.count) return;
        const bytes = new Array(identifier.size).fill(0);
        putInt(bytes, 0, identifier.size, id);
        known.push([serial.pgn, ports.off + slot * ports.stride + identifier.off, bytes]);
    });

    // Groups a unified target resets to all zeros: no board information set
    // (pgResetFn_boardConfig()), and no timer pins assigned
    // (pgResetFn_timerIOConfig()), which is how `timer` and `dma pin` find a
    // free slot.
    for (const symbol of ["boardConfig_System", "timerIOConfig_SystemArray"]) {
        const group = groupBySymbol(manifest, symbol);
        if (group) {
            known.push([group.pgn, 0, new Array(group.size).fill(0)]);
        }
    }

    // Profile 0 of each kind selected.
    const system = manifest.group(SYSTEM_CONFIG_PGN);
    for (const { field } of PROFILE_KINDS) {
        const at = system?.fields?.find((f) => f.name === field);
        if (at) {
            known.push([SYSTEM_CONFIG_PGN, at.off, new Array(at.size ?? 1).fill(0)]);
        }
    }
    return known;
}

// --- the two images -------------------------------------------------------------

/** One pass's view of the board: groups in memory, every write logged. */
export class ImageBoard {
    constructor(manifest, background, known) {
        this.manifest = manifest;
        this.pristine = new Map();
        for (const pg of manifest.raw.pgs) {
            this.pristine.set(pg.pgn, new Uint8Array(pg.size).fill(background));
        }
        for (const [pgn, offset, bytes] of known) {
            this.pristine.get(pgn)?.set(bytes, offset);
        }
        this.groups = new Map([...this.pristine].map(([pgn, bytes]) => [pgn, bytes.slice()]));
        this.log = [];
        this.identity = { target: manifest.target, version: "", revision: "" };
    }

    #group(pgn, offset, length) {
        const bytes = this.groups.get(pgn);
        if (!bytes || offset < 0 || offset + length > bytes.length) {
            throw new CustomDefaultsError(`group ${pgn}+${offset} (${length} bytes) is outside the layout`);
        }
        return bytes;
    }

    async readRange(pgn, offset, length) {
        const bytes = this.#group(pgn, offset, length);
        return new DataView(bytes.slice(offset, offset + length).buffer);
    }

    async readDefaultRange(pgn, offset, length) {
        this.#group(pgn, offset, length);
        return new DataView(this.pristine.get(pgn).slice(offset, offset + length).buffer);
    }

    async writeRange(pgn, offset, bytes) {
        this.#group(pgn, offset, bytes.length).set(bytes, offset);
        this.log.push(`${pgn}+${offset}:${bytes.length}`);
    }

    read(name, profileIndex) {
        return readSettingVia(this, this.manifest, name, profileIndex);
    }

    readDefault(name, profileIndex) {
        return readSettingVia({ readRange: (...a) => this.readDefaultRange(...a) }, this.manifest, name, profileIndex);
    }

    write(name, value, profileIndex) {
        return writeSettingVia(this, this.manifest, name, value, profileIndex);
    }

    // `profile n` switches the board's selection, which is a systemConfig field.
    async selectProfile(section, index) {
        const { field } = PROFILE_KINDS.find((kind) => kind.section === section);
        const at = this.manifest.group(SYSTEM_CONFIG_PGN)?.fields?.find((f) => f.name === field);
        if (at) {
            await this.writeRange(SYSTEM_CONFIG_PGN, at.off, [index]);
        }
    }

    // `defaults`: back to the reset, which is where custom defaults start anyway.
    async resetConfig() {
        for (const [pgn, bytes] of this.pristine) {
            this.groups.get(pgn).set(bytes);
        }
        this.log.push("reset");
    }

    async save() {}

    snapshot() {
        return new Map([...this.groups].map(([pgn, bytes]) => [pgn, bytes.slice()]));
    }

    restore(snapshot) {
        for (const [pgn, bytes] of snapshot) {
            this.groups.get(pgn).set(bytes);
        }
    }
}

/** The bytes that differ from the reset in at least one pass. */
function changedBytes(boards) {
    const changed = new Map();
    for (const [pgn] of boards[0].groups) {
        const flags = new Uint8Array(boards[0].groups.get(pgn).length);
        for (const board of boards) {
            const now = board.groups.get(pgn);
            const before = board.pristine.get(pgn);
            now.forEach((value, i) => {
                if (value !== before[i]) flags[i] = 1;
            });
        }
        changed.set(pgn, flags);
    }
    return changed;
}

/** Records for what the passes agree on, as runs of neighbouring bytes. */
function recordsFrom(boards, changed) {
    const [low, high] = boards;
    const records = [];
    for (const [pgn, flags] of [...changed].sort(([a], [b]) => a - b)) {
        const lo = low.groups.get(pgn);
        const hi = high.groups.get(pgn);
        let run = null;
        const flush = () => {
            if (run) {
                const masked = run.mask.some((m) => m !== FULL_MASK);
                records.push({ pgn, offset: run.offset, data: run.data, ...(masked ? { mask: run.mask } : {}) });
                run = null;
            }
        };
        for (let i = 0; i < flags.length; i++) {
            const mask = ~(lo[i] ^ hi[i]) & FULL_MASK;
            if (!flags[i] || !mask) {
                flush();
                continue;
            }
            if (!run || run.data.length === MAX_RECORD_LENGTH) {
                flush();
                run = { offset: i, data: [], mask: [] };
            }
            run.data.push(lo[i] & mask);
            run.mask.push(mask);
        }
        flush();
    }
    return records;
}

/**
 * Compile config text against a manifest.
 *
 * Returns `{ bytes, records, skipped, errors }`, each of `skipped` and `errors`
 * a list of `{ line, text, message }`.
 *
 * `skipped` are lines the CLI itself refused: a setting, resource or feature
 * this firmware does not have, an index past what it supports. The on-board
 * CLI skipped those silently when it applied custom defaults, and the target
 * configs are full of them (they come from other firmware), so they are left
 * out and reported, as before.
 *
 * `errors` are lines the CLI accepted but that cannot be compiled: what they
 * write depends on a value only the board knows, or they need the board itself
 * (a reboot, a passthrough). A board flashed without them is not the board its
 * config describes, so the flasher refuses.
 */
export async function compileCustomDefaults(manifest, text) {
    if (!manifest.buildId) {
        throw new CustomDefaultsError("the manifest has no build ID to compile against");
    }
    const known = knownResetBytes(manifest);
    const boards = BACKGROUNDS.map((background) => new ImageBoard(manifest, background, known));
    const clis = boards.map((board) => new ParamCli(manifest, board));
    const skipped = [];
    const errors = [];

    const lines = String(text).split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index].replace(/^\uFEFF/, "").trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const command = line.split(/\s+/)[0].toLowerCase();
        if (PASSIVE_COMMANDS.has(command)) {
            continue;
        }

        const snapshots = boards.map((board) => board.snapshot());
        const failures = [];
        for (let pass = 0; pass < boards.length; pass++) {
            boards[pass].log = [];
            try {
                await clis[pass].execute(line);
                failures.push(null);
            } catch (error) {
                failures.push(error);
            }
        }

        const entry = { line: index + 1, text: line };
        const [low, high] = failures;
        if (low instanceof TypeError || high instanceof TypeError) {
            errors.push({ ...entry, message: `needs the board itself (${(low ?? high).message})` });
        } else if (low && high) {
            skipped.push({ ...entry, message: low.message });
        } else if (low || high || boards[0].log.join() !== boards[1].log.join()) {
            errors.push({ ...entry, message: "what this writes depends on values only the board knows" });
        } else {
            continue;
        }
        boards.forEach((board, pass) => board.restore(snapshots[pass]));
    }

    const records = recordsFrom(boards, changedBytes(boards));
    return { bytes: encodeCustomDefaults(manifest.buildId, records), records, skipped, errors };
}
