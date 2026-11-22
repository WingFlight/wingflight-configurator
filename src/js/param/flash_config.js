/**
 * A board's config into the hex being flashed, as custom defaults.
 *
 * A firmware that still has the on-board CLI takes the config as text, as it
 * always has. One without it takes compiled field writes, and says so in the
 * hex itself, along with the build ID they must be compiled against
 * (ConfigInserter.customDefaults()). Those need the manifest of exactly that
 * build, which `sources` provide (param/session.js defaultSources(): the local
 * cache, the release assets next to the hex, a file the user picks).
 *
 * Lines the CLI refuses are left out, as the on-board CLI left them out when
 * it applied custom defaults; lines that cannot be compiled stop the flash.
 */

import { ConfigInserter } from "../ConfigInserter.js";
import { resolveManifest } from "./resolve.js";
import { compileCustomDefaults, CUSTOM_DEFAULTS_FORMAT_VERSION } from "./custom_defaults.js";

export class FlashConfigError extends Error {}

const LISTED_LINES = 5;

function listLines(entries) {
    const shown = entries.slice(0, LISTED_LINES).map((e) => `line ${e.line}: ${e.text} (${e.message})`);
    if (entries.length > LISTED_LINES) {
        shown.push(`and ${entries.length - LISTED_LINES} more`);
    }
    return shown.join("; ");
}

/**
 * Insert `configText` into `parsedHex`.
 *
 * `sources(buildId)` lists where the manifest may be found; `onManifest(raw)`
 * is told the one that was, so it can be cached for the board's first
 * connection after the flash.
 *
 * Resolves to `{ inserted, kind, skipped }`: `kind` is "text", "records" or
 * "none" (the firmware takes no custom defaults, and the board is flashed
 * without them, as before). Rejects with a FlashConfigError when the config
 * cannot be carried: no manifest for the build, or lines that cannot be
 * compiled.
 */
export async function insertBoardConfig(parsedHex, configText, { sources, onManifest, onProgress } = {}) {
    const inserter = new ConfigInserter();
    const area = inserter.customDefaults(parsedHex);

    if (!area) {
        return { inserted: false, kind: "none", skipped: [] };
    }
    if (!area.records) {
        return { inserted: inserter.insertConfig(parsedHex, configText), kind: "text", skipped: [] };
    }
    if (area.records.version !== CUSTOM_DEFAULTS_FORMAT_VERSION) {
        throw new FlashConfigError(
            `this firmware takes custom defaults format ${area.records.version}; this configurator writes ${CUSTOM_DEFAULTS_FORMAT_VERSION}`,
        );
    }

    let manifest;
    try {
        const { buildId } = area.records;
        ({ manifest } = await resolveManifest({ buildId, sources: sources?.(buildId) ?? [], onProgress }));
    } catch (error) {
        throw new FlashConfigError(`the board config cannot be compiled without this firmware's manifest: ${error.message}`);
    }

    onManifest?.(manifest.raw);

    const { bytes, skipped, errors } = await compileCustomDefaults(manifest, configText);
    if (errors.length) {
        throw new FlashConfigError(`the board config cannot be compiled: ${listLines(errors)}`);
    }
    if (skipped.length) {
        console.log(`Custom defaults: ${skipped.length} line(s) left out, as the on-board CLI did: ${listLines(skipped)}`);
    }

    return { inserted: inserter.insertConfig(parsedHex, bytes), kind: "records", skipped };
}
