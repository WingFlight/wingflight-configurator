/**
 * Addressed configuration access over MSP.
 *
 * Six opcodes replace the per-field MSP catalogue: the firmware exposes its
 * parameter group registry and lets the client read and write byte ranges in
 * it, bounds-checked. What the bytes mean comes from the manifest, not from
 * the firmware. See the firmware's docs/parameter-addressing-design.md.
 */

import { MSP } from "@/js/msp.svelte.js";
import MSPCodes from "@/js/msp/MSPCodes.js";
import { decodeValues, encodeValues, settingSpan, ManifestError } from "./manifest.js";

/** Matches MSP_PARAM_PROTOCOL_VERSION in the firmware's msp_param.h. */
export const SUPPORTED_PARAM_PROTOCOL = 1;

export const CAP_EMBEDDED_MANIFEST = 1 << 0;
export const CAP_BUILD_ID_VALID = 1 << 1;

export class ParamError extends Error {}

/**
 * Send one request and insist on a usable reply.
 *
 * The firmware answers a refused request with MSP_RESULT_ERROR, which arrives
 * as a response with no payload. Every caller here knows how many bytes it
 * expects, so checking the length turns a silent empty reply -- which would
 * otherwise decode as zeroes -- into an error.
 */
async function request(code, payload, minimumBytes, what) {
    const reply = await MSP.promise(code, payload ?? false);
    if (!reply || reply.crcError) {
        throw new ParamError(`${what}: no usable reply from the flight controller`);
    }
    const view = reply.data;
    if (view.byteLength < minimumBytes) {
        throw new ParamError(
            `${what}: the flight controller returned ${view.byteLength} bytes, expected at least ${minimumBytes}`,
        );
    }
    return view;
}

function u16(value) {
    return [value & 0xff, (value >> 8) & 0xff];
}

/** Read a zero-terminated string starting at `offset`; returns [text, next]. */
function readString(view, offset) {
    let end = offset;
    while (end < view.byteLength && view.getUint8(end) !== 0) {
        end++;
    }
    let text = "";
    for (let i = offset; i < end; i++) {
        text += String.fromCharCode(view.getUint8(i));
    }
    return [text, end + 1];
}

/**
 * Identify the firmware well enough to find its manifest.
 *
 * This is the one call that has to work before a manifest exists, so its reply
 * is a fixed shape the firmware hand-writes rather than anything manifest
 * derived.
 */
export async function readBuildId() {
    const view = await request(MSPCodes.MSP2_WING_BUILD_ID, false, 15, "build id");

    const protocol = view.getUint8(0);
    if (protocol !== SUPPORTED_PARAM_PROTOCOL) {
        throw new ParamError(
            `this firmware speaks parameter protocol ${protocol}, this configurator speaks ${SUPPORTED_PARAM_PROTOCOL}`,
        );
    }

    let id = "";
    for (let i = 1; i <= 8; i++) {
        id += view.getUint8(i).toString(16).padStart(2, "0");
    }
    const capabilities = view.getUint16(9, true);
    const manifestSize = view.getUint32(11, true);

    const [target, afterTarget] = readString(view, 15);
    const [version, afterVersion] = readString(view, afterTarget);
    const [revision] = readString(view, afterVersion);

    return {
        protocol,
        // A firmware built without `make manifest` reports all zeroes and
        // clears the valid bit. That is "not bound to a manifest", which is a
        // different problem from "bound to one I cannot find", and the caller
        // should say so rather than hunting for a manifest of eight zero bytes.
        buildId: capabilities & CAP_BUILD_ID_VALID ? id : null,
        hasEmbeddedManifest: Boolean(capabilities & CAP_EMBEDDED_MANIFEST),
        manifestSize,
        target,
        version,
        revision,
    };
}

/**
 * The parameter group registry, as the board reports it.
 *
 * Paged: ~110 groups at 6 bytes each does not fit one MSP reply, so the board
 * is asked for a starting index and reports the total.
 */
export async function readRegistry() {
    const groups = [];
    let first = 0;
    let total;

    for (;;) {
        const view = await request(MSPCodes.MSP2_WING_PG_LIST, u16(first), 5, "registry");
        total = view.getUint16(0, true);
        const reportedFirst = view.getUint16(2, true);
        const count = view.getUint8(4);

        if (reportedFirst !== first) {
            throw new ParamError(`registry paging went wrong: asked for ${first}, got ${reportedFirst}`);
        }
        if (count === 0) {
            break;
        }

        let offset = 5;
        for (let i = 0; i < count; i++) {
            groups.push({
                pgn: view.getUint16(offset, true),
                version: view.getUint8(offset + 2),
                size: view.getUint16(offset + 3, true),
                length: view.getUint8(offset + 5),
            });
            offset += 6;
        }

        first += count;
        if (first >= total) {
            break;
        }
    }

    if (groups.length !== total) {
        throw new ParamError(`the board reports ${total} parameter groups but sent ${groups.length}`);
    }
    return groups;
}

/** Raw byte read of a parameter group range. */
export async function readRange(pgn, offset, length) {
    const view = await request(
        MSPCodes.MSP2_WING_PARAM_READ,
        [...u16(pgn), ...u16(offset), ...u16(length)],
        length,
        `read of group ${pgn}+${offset}`,
    );
    return view;
}

/** Raw byte read of a parameter group's *defaults*. */
export async function readDefaultRange(pgn, offset, length) {
    const view = await request(
        MSPCodes.MSP2_WING_PG_DEFAULT,
        [...u16(pgn), ...u16(offset), ...u16(length)],
        length,
        `defaults of group ${pgn}+${offset}`,
    );
    return view;
}

/** Raw byte write into a parameter group. */
export async function writeRange(pgn, offset, bytes) {
    await request(MSPCodes.MSP2_WING_PARAM_WRITE, [...u16(pgn), ...u16(offset), ...bytes], 0, `write to group ${pgn}+${offset}`);
}

/**
 * Read one setting by name.
 *
 * Returns an array for `array` settings and a single value otherwise, matching
 * how the CLI presents them.
 */
export async function readSetting(manifest, name, profileIndex = 0) {
    const { pgn, offset, length, setting } = manifest.address(name, profileIndex);
    const view = await readRange(pgn, offset, length);
    return decodeSetting(setting, view, 0);
}

/** As readSetting(), but the firmware's defaults rather than the live value. */
export async function readSettingDefault(manifest, name, profileIndex = 0) {
    const { pgn, offset, length, setting } = manifest.address(name, profileIndex);
    const view = await readDefaultRange(pgn, offset, length);
    return decodeSetting(setting, view, 0);
}

export function decodeSetting(setting, view, at) {
    if (setting.mode === "string") {
        const [text] = readString(view, at);
        return text;
    }
    const { count } = settingSpan(setting);
    const values = decodeValues(view, at, setting.kind, setting.size, count);
    if (setting.mode === "bitset") {
        return Boolean(values[0] & (1 << (setting.bit ?? 0)));
    }
    return setting.mode === "array" ? values : values[0];
}

/**
 * Write one setting by name.
 *
 * A bitset is read-modify-write: it names one bit of a shared value, so
 * writing it blind would clear whichever neighbours happen to share the byte.
 */
export async function writeSetting(manifest, name, value, profileIndex = 0) {
    const { pgn, offset, setting } = manifest.address(name, profileIndex);

    if (setting.mode === "string") {
        const { bytes } = settingSpan(setting);
        const out = new Array(bytes).fill(0);
        for (let i = 0; i < Math.min(value.length, bytes - 1); i++) {
            out[i] = value.charCodeAt(i) & 0xff;
        }
        await writeRange(pgn, offset, out);
        return;
    }

    if (setting.mode === "bitset") {
        const current = await readRange(pgn, offset, setting.size);
        const [word] = decodeValues(current, 0, "uint", setting.size, 1);
        const mask = 1 << (setting.bit ?? 0);
        const updated = value ? word | mask : word & ~mask;
        await writeRange(pgn, offset, encodeValues([updated >>> 0], "uint", setting.size));
        return;
    }

    const values = Array.isArray(value) ? value : [value];
    const { count } = settingSpan(setting);
    if (values.length !== count) {
        throw new ManifestError(`'${name}' takes ${count} value(s), got ${values.length}`);
    }
    await writeRange(pgn, offset, encodeValues(values, setting.kind, setting.size));
}

/**
 * Fetch the manifest the firmware carries, when it was built with one.
 *
 * Release builds leave it out -- the manifest comes from the release instead --
 * but a locally built board has no published manifest, so it carries its own.
 * The blob is gzipped; the firmware never looks inside it.
 */
export async function readEmbeddedManifest(size, onProgress) {
    const CHUNK = 128;
    const out = new Uint8Array(size);
    let offset = 0;

    while (offset < size) {
        const length = Math.min(CHUNK, size - offset);
        const payload = [
            offset & 0xff,
            (offset >> 8) & 0xff,
            (offset >> 16) & 0xff,
            (offset >>> 24) & 0xff,
            ...u16(length),
        ];
        const view = await request(MSPCodes.MSP2_WING_MANIFEST_READ, payload, length, "embedded manifest");
        for (let i = 0; i < length; i++) {
            out[offset + i] = view.getUint8(i);
        }
        offset += length;
        onProgress?.(offset, size);
    }

    const stream = new Blob([out]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
}
