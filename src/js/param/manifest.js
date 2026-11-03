/**
 * The parameter manifest: what the firmware's configuration looks like.
 *
 * The firmware addresses configuration by (pgn, offset, length) against its
 * parameter group registry, and carries no setting names or ranges of its own.
 * This module is the other half of that: it turns a manifest -- generated from
 * the firmware ELF at build time, keyed to it by build ID -- into something
 * that can answer "where does gyro_lpf1_dyn_min_hz live, and how do I read the
 * bytes that come back".
 *
 * See the firmware's docs/parameter-addressing-design.md.
 */

/** Schema versions this code understands. */
export const SUPPORTED_SCHEMA = 1;

/**
 * A setting's value is at most 4 bytes, and always little-endian: the wire
 * format is a straight copy of the struct's bytes, and every supported target
 * is little-endian ARM.
 */
const LITTLE_ENDIAN = true;

export class ManifestError extends Error {}

/**
 * Sections whose offsets are relative to one element of a repeated group, so
 * that selecting a profile shifts where the setting lives. Mirrors
 * getValueOffset() in the firmware's cli.c.
 */
const PROFILED_SECTIONS = new Set(["profile", "rate_profile", "tv_profile"]);

export function isProfiled(setting) {
    return PROFILED_SECTIONS.has(setting.section);
}

/**
 * Decode `count` values of `kind`/`size` starting at `offset` in a DataView.
 */
export function decodeValues(view, offset, kind, size, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
        const at = offset + i * size;
        let value;
        if (kind === "int") {
            value =
                size === 1
                    ? view.getInt8(at)
                    : size === 2
                      ? view.getInt16(at, LITTLE_ENDIAN)
                      : view.getInt32(at, LITTLE_ENDIAN);
        } else {
            value =
                size === 1
                    ? view.getUint8(at)
                    : size === 2
                      ? view.getUint16(at, LITTLE_ENDIAN)
                      : view.getUint32(at, LITTLE_ENDIAN);
        }
        out.push(value);
    }
    return out;
}

/**
 * Encode values into a plain byte array, ready to append to an MSP request.
 *
 * Out-of-range values are rejected rather than silently truncated: writing the
 * low half of a field and leaving the rest is exactly the bug class this whole
 * mechanism is meant to remove.
 */
export function encodeValues(values, kind, size) {
    const bytes = [];
    for (const value of values) {
        if (!Number.isInteger(value)) {
            throw new ManifestError(`${value} is not an integer`);
        }
        const bits = size * 8;
        const min = kind === "int" ? -(2 ** (bits - 1)) : 0;
        const max = kind === "int" ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
        if (value < min || value > max) {
            throw new ManifestError(`${value} does not fit in ${kind}${bits}`);
        }
        let remaining = value < 0 ? value + 2 ** bits : value;
        for (let i = 0; i < size; i++) {
            bytes.push(remaining & 0xff);
            remaining >>>= 8;
        }
    }
    return bytes;
}

/**
 * How many values a setting holds, and how many bytes they occupy.
 *
 * `array` settings name several elements at once (acc_calibration is four
 * int16s); `string` settings are a char array addressed as a whole. Everything
 * else is a single value, including `bitset`, which addresses one bit inside a
 * value of the declared width.
 */
export function settingSpan(setting) {
    if (setting.mode === "array") {
        return { count: setting.count ?? 1, bytes: (setting.count ?? 1) * setting.size };
    }
    if (setting.mode === "string") {
        const length = setting.max_length ?? 0;
        return { count: length, bytes: length };
    }
    return { count: 1, bytes: setting.size };
}

export class Manifest {
    constructor(json) {
        if (json?.schema !== SUPPORTED_SCHEMA) {
            throw new ManifestError(
                `manifest schema ${json?.schema} is not supported (expected ${SUPPORTED_SCHEMA})`,
            );
        }

        this.raw = json;
        this.build = json.build ?? {};
        this.buildId = this.build.id ?? null;

        /** @type {Map<number, object>} parameter groups by pgn */
        this.groups = new Map(json.pgs.map((pg) => [pg.pgn, pg]));

        /** @type {Map<string, object>} settings by the name people type */
        this.settings = new Map((json.settings ?? []).map((s) => [s.name, s]));
    }

    get target() {
        return this.build.target ?? null;
    }

    /** Setting names, sorted, for completion and `dump`. */
    names() {
        return [...this.settings.keys()].sort();
    }

    setting(name) {
        return this.settings.get(name) ?? null;
    }

    group(pgn) {
        return this.groups.get(pgn) ?? null;
    }

    /**
     * Where a setting lives, as the firmware addresses it.
     *
     * This mirrors getValueOffset() in the firmware's cli.c, and the
     * distinction it makes is easy to get wrong. Both kinds of setting can sit
     * in a parameter group that holds several elements, but they reach them
     * differently:
     *
     *   - A `profile` / `rate_profile` / `tv_profile` setting has an offset
     *     relative to one element, and the firmware adds the *currently
     *     selected* profile's stride at runtime. Those are the ones where
     *     `profileIndex` means anything.
     *
     *   - A `master` or `hardware` setting has the element baked into its
     *     offset already, by PG_ARRAY_ELEMENT_OFFSET() at compile time --
     *     vbec_scale and vbus_scale are different elements of the same voltage
     *     sensor group, and are simply different settings with different
     *     offsets. Adding a stride to those addresses past the end of the
     *     group.
     */
    address(name, profileIndex = 0) {
        const setting = this.setting(name);
        if (!setting) {
            throw new ManifestError(`unknown setting '${name}'`);
        }
        const group = this.group(setting.pgn);
        if (!group) {
            throw new ManifestError(`setting '${name}' names pgn ${setting.pgn}, which this firmware does not have`);
        }

        const { bytes } = settingSpan(setting);
        let offset = setting.off;

        if (isProfiled(setting)) {
            if (profileIndex < 0 || profileIndex >= group.length) {
                throw new ManifestError(
                    `profile ${profileIndex} is out of range for '${name}' (0..${group.length - 1})`,
                );
            }
            offset += profileIndex * group.elem_size;
        }

        if (offset + bytes > group.size) {
            // The firmware would refuse this too. Failing here gives a better
            // message than an opaque MSP error, and means a corrupt manifest
            // cannot get as far as the wire.
            throw new ManifestError(
                `'${name}' at offset ${offset} + ${bytes} bytes runs past the ${group.size}-byte group ${setting.pgn}`,
            );
        }

        return { pgn: setting.pgn, offset, length: bytes, setting };
    }

    /**
     * Cross-check against what the board actually reports.
     *
     * The build ID already proves the manifest belongs to this firmware, but
     * that check is only as good as the hash. This one is independent: it
     * compares the registry the board reports against the one the manifest
     * describes, and says which group disagrees rather than just "no".
     */
    checkAgainstRegistry(groups) {
        const problems = [];
        const reported = new Map(groups.map((g) => [g.pgn, g]));

        for (const [pgn, pg] of this.groups) {
            const there = reported.get(pgn);
            if (!there) {
                problems.push(`group ${pgn} (${pg.symbol}) is in the manifest but not on the board`);
                continue;
            }
            for (const field of ["version", "size", "length"]) {
                if (pg[field] !== there[field]) {
                    problems.push(
                        `group ${pgn} (${pg.symbol}): manifest ${field}=${pg[field]}, board ${field}=${there[field]}`,
                    );
                }
            }
        }
        for (const pgn of reported.keys()) {
            if (!this.groups.has(pgn)) {
                problems.push(`group ${pgn} is on the board but not in the manifest`);
            }
        }
        return problems;
    }
}
