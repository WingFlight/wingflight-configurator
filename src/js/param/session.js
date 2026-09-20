/**
 * A working connection to a board's configuration.
 *
 * Pulls the three pieces together: identify the firmware, get the manifest
 * that describes it, and expose the settings behind an interface the CLI (and
 * later the tabs) can use without knowing about opcodes or offsets.
 */

import { MSP } from "@/js/msp.svelte.js";
import { MSPCodes } from "@/js/msp/MSPCodes.js";
import {
    readBuildId,
    readRegistry,
    readRange,
    readDefaultRange,
    readSetting,
    readSettingDefault,
    writeSetting,
    readEmbeddedManifest,
} from "./access.js";
import { resolveManifest, explainMissingManifest, ResolveError } from "./resolve.js";
import { ParamCli } from "./cli.js";

/** Where a cached manifest lives, keyed by build ID rather than version. */
const CACHE_PREFIX = "wf-manifest-";

/**
 * The sources §6.2 lists, cheapest and most certain first.
 *
 * Each is lazy: nothing is fetched until the previous one has missed, so a
 * cache hit costs no network and no serial traffic.
 */
export function defaultSources(identity, { storage = globalThis.localStorage, fetchRelease } = {}) {
    const sources = [];

    if (identity.buildId && storage) {
        sources.push({
            name: "local cache",
            fetch: async () => {
                const text = storage.getItem(CACHE_PREFIX + identity.buildId);
                return text ? JSON.parse(text) : null;
            },
        });
    }

    if (identity.hasEmbeddedManifest && identity.manifestSize) {
        sources.push({
            name: "the board",
            // A locally built board carries its own copy precisely because no
            // release exists to fetch one from.
            fetch: () => readEmbeddedManifest(identity.manifestSize),
        });
    }

    if (fetchRelease && identity.buildId) {
        sources.push({
            name: "release assets",
            fetch: () => fetchRelease(identity),
        });
    }

    return sources;
}

function cacheManifest(raw, storage = globalThis.localStorage) {
    try {
        if (raw?.build?.id && storage) {
            storage.setItem(CACHE_PREFIX + raw.build.id, JSON.stringify(raw));
        }
    } catch {
        // A full or unavailable store is not worth failing a connection over.
    }
}

/**
 * Everything the configuration side of the app needs, or a clear reason why
 * it cannot be had.
 */
export async function openParamSession({ sources, storage, fetchRelease, onProgress } = {}) {
    onProgress?.("identifying firmware");
    const identity = await readBuildId();

    onProgress?.("reading parameter groups");
    const registry = await readRegistry();

    const candidates = sources ?? defaultSources(identity, { storage, fetchRelease });
    if (!candidates.length) {
        throw new ResolveError(explainMissingManifest(identity));
    }

    const { manifest, source } = await resolveManifest({
        buildId: identity.buildId,
        registry,
        sources: candidates,
        onProgress: (name) => onProgress?.(`looking for the manifest in ${name}`),
    });

    cacheManifest(manifest.raw, storage);

    const io = {
        identity: {
            target: identity.target,
            version: identity.version,
            revision: identity.revision,
            buildId: identity.buildId,
        },
        read: (name, profileIndex) => readSetting(manifest, name, profileIndex),
        readDefault: (name, profileIndex) => readSettingDefault(manifest, name, profileIndex),
        write: (name, value, profileIndex) => writeSetting(manifest, name, value, profileIndex),
        readRange: (pgn, offset, length) => readRange(pgn, offset, length),
        readDefaultRange: (pgn, offset, length) => readDefaultRange(pgn, offset, length),
        save: () => MSP.promise(MSPCodes.MSP_EEPROM_WRITE),
    };

    return { identity, manifest, registry, source, io, cli: new ParamCli(manifest, io) };
}

export { explainMissingManifest, ResolveError };
