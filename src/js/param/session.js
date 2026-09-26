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
    writeRange,
    readEmbeddedManifest,
    readTaskInfo,
    readGyroRegisters,
    readSetpointInfo,
} from "./access.js";
import { resolveManifest, explainMissingManifest, ResolveError } from "./resolve.js";
import { ParamCli } from "./cli.js";
import { readTextFile } from "@/js/filesystem.js";
import { reinitialiseConnection } from "@/js/serial_backend.js";
import { FC } from "@/js/fc.svelte.js";
import { decodeStatus, decodeBatteryState } from "./runtime.js";

/** Where a cached manifest lives, keyed by build ID rather than version. */
const CACHE_PREFIX = "wf-manifest-";

/**
 * The sources §6.2 lists, cheapest and most certain first.
 *
 * Each is lazy: nothing is fetched until the previous one has missed, so a
 * cache hit costs no network and no serial traffic.
 */
export function defaultSources(identity, { storage = globalThis.localStorage, fetchRelease, askForFile = true } = {}) {
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

    // Last resort, and the only one that needs the user: pick the file. It is
    // worth having even so -- a locally built board has no published manifest
    // to fetch, and the result is cached by build ID, so this is asked once
    // per firmware rather than once per connection.
    if (askForFile) {
        sources.push({
            name: "a file you choose",
            fetch: async () => {
                const text = await readTextFile({
                    description: "Wingflight parameter manifest",
                    extensions: [".json"],
                });
                return text ? JSON.parse(text) : null;
            },
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
export async function openParamSession({ sources, storage, fetchRelease, askForFile, onProgress } = {}) {
    onProgress?.("identifying firmware");
    const identity = await readBuildId();

    onProgress?.("reading parameter groups");
    const registry = await readRegistry();

    const candidates = sources ?? defaultSources(identity, { storage, fetchRelease, askForFile });
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
        writeRange: (pgn, offset, bytes) => writeRange(pgn, offset, bytes),
        save: () => MSP.promise(MSPCodes.MSP_EEPROM_WRITE),
        resetConfig: () => MSP.promise(MSPCodes.MSP_RESET_CONF),
        readTaskInfo,
        readGyroRegisters,
        readSetpointInfo,
        // `status`: live replies the firmware keeps for telemetry anyway. The
        // MCU type comes from the MSP_BOARD_INFO read at connect.
        readStatus: async () => ({
            status: decodeStatus((await MSP.promise(MSPCodes.MSP_STATUS)).data),
            battery: decodeBatteryState((await MSP.promise(MSPCodes.MSP_BATTERY_STATE)).data),
            setpoint: await readSetpointInfo(),
            mcuTypeId: FC.CONFIG?.mcuTypeId,
        }),
        // Switch the board's live profile, as the on-device `profile` command
        // did. MSP_SELECT_SETTING takes the rate profile with bit 7 set.
        selectProfile: (section, index) => {
            if (section === "tv_profile") {
                return MSP.promise(MSPCodes.MSP2_WING_SELECT_TV_PROFILE, [index]);
            }
            return MSP.promise(MSPCodes.MSP_SELECT_SETTING, [section === "rate_profile" ? index | 0x80 : index]);
        },
        // --- action commands (param/actions.js) -----------------------------
        reboot: async (mode) => {
            const reply = await MSP.promise(MSPCodes.MSP_SET_REBOOT, [mode]);
            if (!reply || reply.unsupported || reply.crcError) {
                return { accepted: false };
            }
            // MSC modes add a byte: 0 means there is no storage, and no reboot.
            const storageReady = reply.data.byteLength < 2 || reply.data.getUint8(1) !== 0;
            if (storageReady) {
                reinitialiseConnection();
            }
            return { accepted: true, storageReady };
        },
        bind: async () => {
            const reply = await MSP.promise(MSPCodes.MSP2_BETAFLIGHT_BIND);
            return Boolean(reply) && !reply.unsupported;
        },
        passthrough: async (mode, argument) => {
            const reply = await MSP.promise(MSPCodes.MSP_SET_PASSTHROUGH, [mode, argument]);
            return reply?.data?.byteLength ? reply.data.getUint8(0) : 0;
        },
        // After passthrough the port carries another device's bytes: give it
        // up the same way the Connect button does, once the output is shown.
        releasePort: () => setTimeout(() => $("div.connect_controls a.connect").trigger("click"), 500),
        dataflashSummary: async () => {
            const reply = await MSP.promise(MSPCodes.MSP_DATAFLASH_SUMMARY);
            const view = reply.data;
            if (view.byteLength < 13) {
                return { flags: 0, sectors: 0, totalSize: 0, usedSize: 0 };
            }
            return {
                flags: view.getUint8(0),
                sectors: view.getUint32(1, true),
                totalSize: view.getUint32(5, true),
                usedSize: view.getUint32(9, true),
            };
        },
        dataflashErase: () => MSP.promise(MSPCodes.MSP_DATAFLASH_ERASE),
        // The firmware's own reply to an opcode, for verify_msp.
        rawRequest: async (code, payload) => {
            const reply = await MSP.promise(code, payload ?? false);
            if (!reply || reply.unsupported || reply.crcError) return null;
            return new Uint8Array(reply.data.buffer, reply.data.byteOffset, reply.data.byteLength).slice();
        },
        dataflashRead: async (address, length) => {
            const payload = [address & 0xff, (address >> 8) & 0xff, (address >> 16) & 0xff, (address >>> 24) & 0xff,
                length & 0xff, (length >> 8) & 0xff, 0 /* no compression */];
            const reply = await MSP.promise(MSPCodes.MSP_DATAFLASH_READ, payload);
            const view = reply.data;
            if (view.byteLength < 7) return new Uint8Array(0);
            const readLength = Math.min(view.getUint16(4, true), view.byteLength - 7);
            return new Uint8Array(view.buffer, view.byteOffset + 7, readLength).slice();
        },
    };

    return { identity, manifest, registry, source, io, cli: new ParamCli(manifest, io) };
}

export { explainMissingManifest, ResolveError };
