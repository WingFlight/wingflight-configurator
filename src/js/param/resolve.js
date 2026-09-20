/**
 * Finding the manifest that describes the board in front of us.
 *
 * The firmware no longer describes itself, so the configurator has to obtain
 * the manifest for the *exact* build it is talking to. Getting this wrong is
 * not a graceful degradation: a manifest from a different build has
 * plausible-looking but wrong offsets, so a write lands in the wrong field and
 * could silently reverse a servo or move a failsafe threshold.
 *
 * So the rule is: verify, or refuse. Never guess.
 *
 * See §6 of the firmware's docs/parameter-addressing-design.md.
 */

import { Manifest, ManifestError } from "./manifest.js";

export class ResolveError extends Error {}

/**
 * Canonical bytes for hashing, matching the generator's
 * json.dumps(sort_keys=True, separators=(',', ':')) byte for byte.
 *
 * Python's json.dumps escapes non-ASCII as \\uXXXX by default and
 * JSON.stringify does not, so that is done explicitly here. A single enum
 * label with an accent in it would otherwise make every manifest fail to
 * verify, for a reason that would be very hard to see.
 */
export function canonicalJson(value) {
    const text = stringify(value);
    return text.replace(/[\u007f-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function stringify(value) {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stringify).join(",")}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stringify(value[k])}`).join(",")}}`;
}

/**
 * The build ID a manifest claims, computed rather than read.
 *
 * The `build` block is excluded, exactly as the generator does: it carries the
 * build date, and hashing it would give every rebuild a different ID even when
 * no struct moved.
 */
export async function computeBuildId(raw) {
    const layout = {};
    for (const key of Object.keys(raw)) {
        if (key !== "build") {
            layout[key] = raw[key];
        }
    }
    const bytes = new TextEncoder().encode(canonicalJson(layout));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
        .slice(0, 8)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Two independent checks, as §6.3 requires.
 *
 * The hash alone is sufficient, but it is only as good as itself; comparing
 * the registry the board reports against the one the manifest describes is
 * independent of it, and says *which* group disagrees rather than just "no".
 */
export async function verifyManifest(raw, { buildId, registry }) {
    const manifest = new Manifest(raw);

    const computed = await computeBuildId(raw);
    if (raw.build?.id && raw.build.id !== computed) {
        throw new ResolveError(
            `manifest is corrupt: it claims build ${raw.build.id} but its contents hash to ${computed}`,
        );
    }
    if (buildId && computed !== buildId) {
        throw new ResolveError(`manifest is for build ${computed}, the board reports ${buildId}`);
    }

    if (registry?.length) {
        const problems = manifest.checkAgainstRegistry(registry);
        if (problems.length) {
            throw new ResolveError(
                `manifest does not match the board: ${problems.slice(0, 3).join("; ")}` +
                    (problems.length > 3 ? ` (and ${problems.length - 3} more)` : ""),
            );
        }
    }

    return manifest;
}

/**
 * Walk the sources in order and return the first that verifies.
 *
 * Order is a performance and offline-friendliness decision, not a trust one --
 * every source ends in the same verification. A source that throws is reported
 * and skipped, because "the network was down" should not stop us trying the
 * board's own copy.
 */
export async function resolveManifest({ buildId, registry, sources, onProgress }) {
    const attempts = [];

    for (const source of sources) {
        if (!source || typeof source.fetch !== "function") {
            continue;
        }
        onProgress?.(source.name);
        let raw;
        try {
            raw = await source.fetch();
        } catch (error) {
            attempts.push(`${source.name}: ${error.message}`);
            continue;
        }
        if (!raw) {
            attempts.push(`${source.name}: nothing found`);
            continue;
        }
        try {
            const manifest = await verifyManifest(raw, { buildId, registry });
            return { manifest, source: source.name, attempts };
        } catch (error) {
            attempts.push(`${source.name}: ${error.message}`);
        }
    }

    throw new ResolveError(
        `no manifest for build ${buildId ?? "(unidentified)"}.\n` + attempts.map((a) => `  - ${a}`).join("\n"),
    );
}

/**
 * Why a board might have no manifest, phrased for a human.
 *
 * A firmware built without `make manifest` reports no build ID at all, which
 * is a different problem from one whose manifest we merely cannot find -- and
 * the fix is different too, so they should not read the same.
 */
export function explainMissingManifest(identity) {
    if (!identity?.buildId) {
        return (
            "This firmware was built without a parameter manifest, so its settings cannot be " +
            "identified. Rebuild it with `make manifest`, or flash a release build."
        );
    }
    return (
        `No manifest could be found for build ${identity.buildId}. Configuration is unavailable ` +
        "until one is loaded, but flashing still works, so the board can be recovered by " +
        "flashing a release build."
    );
}

export { ManifestError };
