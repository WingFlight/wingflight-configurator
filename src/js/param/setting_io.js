/**
 * Reading and writing one setting by name over any byte-range access.
 *
 * `range` is `{ readRange(pgn, offset, length), writeRange(pgn, offset, bytes) }`:
 * addressed MSP access on a connected board (access.js), or an image of the
 * groups in memory (custom_defaults.js). What the bytes mean comes from the
 * manifest either way.
 */

import { decodeValues, encodeValues, settingSpan, ManifestError } from "./manifest.js";

/** Read a zero-terminated string starting at `offset`; returns [text, next]. */
export function readString(view, offset) {
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
 * Read one setting by name.
 *
 * Returns an array for `array` settings and a single value otherwise, matching
 * how the CLI presents them.
 */
export async function readSettingVia(range, manifest, name, profileIndex = 0) {
    const { pgn, offset, length, setting } = manifest.address(name, profileIndex);
    const view = await range.readRange(pgn, offset, length);
    return decodeSetting(setting, view, 0);
}

/**
 * Write one setting by name.
 *
 * A bitset is read-modify-write: it names one bit of a shared value, so
 * writing it blind would clear whichever neighbours happen to share the byte.
 */
export async function writeSettingVia(range, manifest, name, value, profileIndex = 0) {
    const { pgn, offset, setting } = manifest.address(name, profileIndex);

    if (setting.mode === "string") {
        const { bytes } = settingSpan(setting);
        const out = new Array(bytes).fill(0);
        for (let i = 0; i < Math.min(value.length, bytes - 1); i++) {
            out[i] = value.charCodeAt(i) & 0xff;
        }
        await range.writeRange(pgn, offset, out);
        return;
    }

    if (setting.mode === "bitset") {
        const current = await range.readRange(pgn, offset, setting.size);
        const [word] = decodeValues(current, 0, "uint", setting.size, 1);
        const mask = 1 << (setting.bit ?? 0);
        const updated = value ? word | mask : word & ~mask;
        await range.writeRange(pgn, offset, encodeValues([updated >>> 0], "uint", setting.size));
        return;
    }

    const values = Array.isArray(value) ? value : [value];
    const { count } = settingSpan(setting);
    if (values.length !== count) {
        throw new ManifestError(`'${name}' takes ${count} value(s), got ${values.length}`);
    }
    await range.writeRange(pgn, offset, encodeValues(values, setting.kind, setting.size));
}
