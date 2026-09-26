/**
 * The CLI, executed client-side.
 *
 * The firmware no longer has a CLI: it exposes addressed configuration access
 * and nothing else. These commands are the replacement, and they are
 * deliberately bug-for-bug compatible in their *output* format, because that
 * output is a file format -- cli_backup.js writes `diff all` to disk and
 * replays it, and the presets repo ships snippets written against it.
 *
 * Everything here goes through an injected `io`, so the command layer can be
 * exercised against a stand-in board without hardware.
 */

import { ManifestError, settingSpan } from "./manifest.js";
import { formatTasks, formatGyroRegisters, formatSetpointInfo, formatStatus } from "./runtime.js";
import { CliError } from "./cli_error.js";
import {
    CONFIG_BLOCKS,
    blockSupported,
    nameLines,
    featureCommand,
    serialCommand,
    mapCommand,
    auxCommand,
    mixerCommand,
    servoCommand,
    rxfailCommand,
    adjfuncCommand,
    beeperCommand,
    ledCommand,
    colorCommand,
    modeColorCommand,
} from "./config_lines.js";
import * as actions from "./actions.js";
import { VirtualMsp } from "./virtual_msp.js";
import { verifyReplies, verifySetters, symmetricPairs } from "./verify_msp.js";
import { MSPCodes } from "../msp/MSPCodes.js";

const SECTION_HEADING = {
    master: "master",
    profile: "profile",
    rate_profile: "rateprofile",
    tv_profile: "tvprofile",
    hardware: "hardware",
};

/**
 * The three kinds of profile, keyed by manifest section.
 *
 * `command` is both the CLI command that selects one and the word a dump
 * prints before each block (`profile 1`, `rateprofile 1`, `tv_profile 1`), so
 * a replayed backup selects the right element before its `set` lines. `field`
 * is where systemConfig keeps the board's current selection.
 */
const PROFILE_KINDS = [
    { section: "profile", command: "profile", field: "pidProfileIndex" },
    { section: "rate_profile", command: "rateprofile", field: "activeRateProfile" },
    { section: "tv_profile", command: "tv_profile", field: "tvProfileIndex" },
];

const SYSTEM_CONFIG_PGN = 18;

/** `dump <word>` targets, with the on-device CLI's keywords first. */
const DUMP_TARGETS = {
    master: ["master"],
    hardware: ["hardware"],
    profile: ["profile"],
    rates: ["rate_profile"],
    rateprofile: ["rate_profile"],
    tv_profile: ["tv_profile"],
    tvprofile: ["tv_profile"],
};

export { CliError };

/**
 * Decode an ioTag into the pin name the CLI printed, e.g. 0x19 -> "A09".
 *
 * DEFIO_TAG_MAKE packs the port index (1-based, so that 0 can mean "none")
 * into the high nibble and the pin into the low one.
 */
export function formatPin(tag) {
    if (!tag) {
        return "NONE";
    }
    const port = (tag >> 4) - 1;
    const pin = tag & 0x0f;
    return `${String.fromCharCode("A".charCodeAt(0) + port)}${String(pin).padStart(2, "0")}`;
}

/** The inverse of formatPin: "A09" -> 0x19, "NONE" -> 0. */
export function parsePin(text) {
    const raw = text.trim().toUpperCase();
    if (raw === "NONE" || raw === "") {
        return 0;
    }
    const match = /^([A-H])(\d{1,2})$/.exec(raw);
    if (!match) {
        throw new CliError(`'${text}' is not a pin name such as A09`);
    }
    const port = match[1].charCodeAt(0) - "A".charCodeAt(0);
    const pin = Number(match[2]);
    if (pin > 15) {
        throw new CliError(`'${text}' has no pin ${pin}`);
    }
    return ((port + 1) << 4) | pin;
}

/**
 * The `resource` block of a dump.
 *
 * These are not runtime state, which is what makes them reproducible here: the
 * manifest carries the table saying which parameter group holds which owner's
 * pins, and the pins themselves are ordinary group bytes. `io.readRange` is
 * the same addressed read everything else uses.
 */
export async function resourceLines(manifest, io) {
    const entries = manifest.raw.resources ?? [];
    const lines = [];

    for (const entry of entries) {
        const group = manifest.group(entry.pgn);
        if (!group || !entry.name) {
            continue;
        }
        for (let index = 0; index < entry.count; index++) {
            const offset = entry.off + entry.stride * index;
            if (offset + 1 > group.size) {
                continue;
            }
            let tag;
            try {
                const view = await io.readRange(entry.pgn, offset, 1);
                tag = view.getUint8(0);
            } catch {
                continue;
            }

            // An unassigned pin is usually just noise, but one that the
            // defaults *did* assign has been deliberately cleared, and saying
            // so is the whole point of the line: a restore that omits
            // `resource ADC_EXT 1 NONE` leaves the pin assigned. The firmware
            // printed these for the same reason.
            if (!tag) {
                let defaultTag = 0;
                if (io.readDefaultRange) {
                    try {
                        const view = await io.readDefaultRange(entry.pgn, offset, 1);
                        defaultTag = view.getUint8(0);
                    } catch {
                        defaultTag = 0;
                    }
                }
                if (!defaultTag) {
                    continue;
                }
            }

            lines.push(`resource ${entry.name} ${index + 1} ${formatPin(tag)}`);
        }
    }
    return lines;
}

/**
 * The `timer` block of a dump.
 *
 * timerIOConfig is an ordinary parameter group of {ioTag, index, dmaopt}, so
 * the assignments themselves are just bytes. The alternate function is not:
 * that comes from the target's timer hardware table, which the manifest
 * carries because it is a const table in the image. `index` selects among the
 * entries sharing a pin, exactly as timerGetByTagAndIndex() did.
 */
export async function timerLines(manifest, io) {
    const timers = manifest.raw.timers ?? [];
    const group = [...manifest.groups.values()].find((pg) => pg.symbol === "timerIOConfig_SystemArray");
    if (!timers.length || !group) {
        return [];
    }

    const stride = group.elem_size;
    const lines = [];

    for (let slot = 0; slot < group.length; slot++) {
        let view;
        try {
            view = await io.readRange(group.pgn, slot * stride, Math.min(stride, 2));
        } catch {
            continue;
        }
        const tag = view.getUint8(0);
        if (!tag) {
            continue;
        }
        const index = view.getUint8(1);

        if (index === 0) {
            lines.push(`timer ${formatPin(tag)} NONE`);
            continue;
        }
        // The Nth entry for this pin, 1-based, as the firmware counted them.
        const matches = timers.filter((entry) => entry.tag === tag);
        const chosen = matches[index - 1];
        lines.push(chosen ? `timer ${formatPin(tag)} AF${chosen.af}` : `timer ${formatPin(tag)} NONE`);
    }
    return lines;
}

/**
 * The `dma` block of a dump.
 *
 * Two kinds of line, from two places. Peripheral options (`dma ADC 1 0`) come
 * from the table the manifest carries; per-pin options (`dma pin A02 0`) are
 * the third byte of each timerIOConfig entry. Both are parameter group bytes
 * underneath.
 *
 * A dmaopt is signed: -1 means "unset" and is left out, as the firmware did.
 */
export async function dmaLines(manifest, io) {
    const lines = [];

    for (const entry of manifest.raw.dmaopts ?? []) {
        const group = manifest.group(entry.pgn);
        if (!group) {
            continue;
        }
        for (let index = 0; index < entry.count; index++) {
            const offset = entry.off + entry.stride * index;
            if (offset + 1 > group.size) {
                continue;
            }
            try {
                const view = await io.readRange(entry.pgn, offset, 1);
                const opt = view.getInt8(0);
                if (opt >= 0) {
                    lines.push(`dma ${entry.device} ${index + 1} ${opt}`);
                }
            } catch {
                continue;
            }
        }
    }

    // Per-pin options live alongside the timer assignment they belong to.
    const timerGroup = [...manifest.groups.values()].find((pg) => pg.symbol === "timerIOConfig_SystemArray");
    if (timerGroup && timerGroup.elem_size >= 3) {
        for (let slot = 0; slot < timerGroup.length; slot++) {
            try {
                const view = await io.readRange(timerGroup.pgn, slot * timerGroup.elem_size, 3);
                const tag = view.getUint8(0);
                const opt = view.getInt8(2);
                if (tag && opt >= 0) {
                    lines.push(`dma pin ${formatPin(tag)} ${opt}`);
                }
            } catch {
                continue;
            }
        }
    }

    return lines;
}

/**
 * Render a value the way the firmware's CLI printed it.
 *
 * Lookup settings show their label rather than the number, arrays are
 * comma-separated, and a bitset is ON/OFF -- all as printValuePointer() did.
 */
export function formatValue(setting, value) {
    if (setting.mode === "lookup" && Array.isArray(setting.values)) {
        return setting.values[value] ?? String(value);
    }
    if (setting.mode === "bitset") {
        return value ? "ON" : "OFF";
    }
    if (setting.mode === "array") {
        return value.join(",");
    }
    return String(value);
}

/**
 * Parse what the user typed into the value the wire wants.
 *
 * Range checking happens here rather than on the board: the firmware only
 * bounds-checks the byte range, not the declared min/max, so refusing an
 * out-of-range value is the client's job now. That is a gain, not a
 * compromise -- it can say what the range is.
 */
export function parseValue(setting, text) {
    const raw = text.trim();

    if (setting.mode === "lookup" && Array.isArray(setting.values)) {
        const index = setting.values.findIndex((label) => label?.toLowerCase() === raw.toLowerCase());
        if (index >= 0) {
            return index;
        }
        const numeric = Number(raw);
        if (Number.isInteger(numeric) && numeric >= 0 && numeric < setting.values.length) {
            return numeric;
        }
        throw new CliError(`${setting.name}: expected one of ${setting.values.filter(Boolean).join(", ")}`);
    }

    if (setting.mode === "bitset") {
        if (/^(on|1|true)$/i.test(raw)) {
            return true;
        }
        if (/^(off|0|false)$/i.test(raw)) {
            return false;
        }
        throw new CliError(`${setting.name}: expected ON or OFF`);
    }

    if (setting.mode === "string") {
        return raw;
    }

    const { count } = settingSpan(setting);
    const parts = setting.mode === "array" ? raw.split(",") : [raw];
    if (parts.length !== count) {
        throw new CliError(`${setting.name}: expected ${count} value(s), got ${parts.length}`);
    }

    const values = parts.map((part) => {
        const value = Number(part.trim());
        if (!Number.isInteger(value)) {
            throw new CliError(`${setting.name}: '${part.trim()}' is not a whole number`);
        }
        if (setting.min !== undefined && value < setting.min) {
            throw new CliError(`${setting.name}: ${value} is below the minimum of ${setting.min}`);
        }
        if (setting.max !== undefined && value > setting.max) {
            throw new CliError(`${setting.name}: ${value} is above the maximum of ${setting.max}`);
        }
        return value;
    });

    return setting.mode === "array" ? values : values[0];
}

/** `Allowed range: a - b`, or the label list, as `get <name>` printed it. */
export function describeRange(setting) {
    if (setting.mode === "lookup" && Array.isArray(setting.values)) {
        return `Allowed values: ${setting.values.filter(Boolean).join(", ")}`;
    }
    if (setting.mode === "bitset") {
        return "Allowed values: OFF, ON";
    }
    if (setting.mode === "string") {
        return `Allowed characters: ${setting.max_length ?? 0} max`;
    }
    if (setting.min !== undefined && setting.max !== undefined) {
        return `Allowed range: ${setting.min} - ${setting.max}`;
    }
    return null;
}

export class ParamCli {
    /**
     * @param manifest a Manifest
     * @param io       { read, write, readDefault, save, reboot, identity }
     */
    constructor(manifest, io) {
        this.manifest = manifest;
        this.io = io;
        // Which element of each profiled group get/set address, keyed by
        // section. Read from the board on first use, then tracked locally.
        this.selection = null;
    }

    /** How many profiles of a kind this build has, from the manifest. */
    #profileCount(section) {
        const setting = this.#sectionSettings(section)[0];
        return setting ? (this.manifest.group(setting.pgn)?.length ?? 1) : 0;
    }

    /**
     * The board's current profile selection.
     *
     * Read once from systemConfig rather than assumed to be 0: a `set` after
     * connecting has to land in the profile the pilot is flying, as it did on
     * the on-device CLI.
     */
    async #currentSelection() {
        if (this.selection) {
            return this.selection;
        }
        const selection = Object.fromEntries(PROFILE_KINDS.map(({ section }) => [section, 0]));
        const group = this.manifest.group(SYSTEM_CONFIG_PGN);
        if (group && this.io.readRange) {
            const view = await this.io.readRange(SYSTEM_CONFIG_PGN, 0, group.size);
            for (const { section, field } of PROFILE_KINDS) {
                const at = group.fields?.find((f) => f.name === field)?.off;
                const index = at === undefined ? 0 : view.getUint8(at);
                selection[section] = index < this.#profileCount(section) ? index : 0;
            }
        }
        this.selection = selection;
        return selection;
    }

    /** The element index a setting is addressed at: its profile, or 0. */
    async #indexFor(setting) {
        const kind = PROFILE_KINDS.find(({ section }) => section === setting.section);
        return kind ? (await this.#currentSelection())[kind.section] : 0;
    }

    /**
     * `profile [n]`, `rateprofile [n]`, `tv_profile [n]`.
     *
     * With no argument, prints the selection. With one, switches the board
     * live -- as changePidProfile() did -- and moves where get/set land.
     */
    async selectProfile(kind, argument) {
        const selection = await this.#currentSelection();
        if (!argument) {
            return `${kind.command} ${selection[kind.section]}`;
        }
        const count = this.#profileCount(kind.section);
        const index = Number(argument);
        if (!/^\d+$/.test(argument) || index >= count) {
            throw new CliError(`${kind.command.toUpperCase()} OUTSIDE OF [0..${count - 1}]`);
        }
        await this.io.selectProfile?.(kind.section, index);
        selection[kind.section] = index;
        return `${kind.command} ${index}`;
    }

    /** Settings belonging to a section, in manifest order. */
    #sectionSettings(section) {
        return [...this.manifest.settings.values()].filter((s) => s.section === section);
    }

    async #readAll(section, profileIndex) {
        const out = [];
        for (const setting of this.#sectionSettings(section)) {
            try {
                const value = await this.io.read(setting.name, profileIndex);
                out.push({ setting, value });
            } catch (error) {
                // A setting the board refuses is worth showing rather than
                // silently dropping from a backup.
                out.push({ setting, error });
            }
        }
        return out;
    }

    async get(name) {
        if (!name) {
            const names = this.manifest.names();
            const lines = [];
            for (const each of names) {
                const setting = this.manifest.setting(each);
                const value = await this.io.read(each, await this.#indexFor(setting));
                lines.push(`${each} = ${formatValue(setting, value)}`);
            }
            return lines.join("\n");
        }

        // The firmware matched on substring, listing everything that contained
        // the text, so `get gyro` worked. Keep that.
        const matches = this.manifest.names().filter((n) => n.includes(name));
        if (matches.length === 0) {
            throw new CliError(`Invalid name: ${name}`);
        }

        const lines = [];
        for (const each of matches) {
            const setting = this.manifest.setting(each);
            const value = await this.io.read(each, await this.#indexFor(setting));
            lines.push(`${each} = ${formatValue(setting, value)}`);
            const range = describeRange(setting);
            if (range) {
                lines.push(range);
            }
        }
        return lines.join("\n");
    }

    async set(assignment) {
        const match = /^([a-zA-Z0-9_]+)\s*=\s*(.*)$/.exec(assignment.trim());
        if (!match) {
            throw new CliError("Invalid assignment, expected `set <name> = <value>`");
        }
        const [, name, text] = match;

        const setting = this.manifest.setting(name);
        if (!setting) {
            throw new CliError(`Invalid name: ${name}`);
        }

        const value = parseValue(setting, text);
        await this.io.write(name, value, await this.#indexFor(setting));
        return `${name} set to ${formatValue(setting, value)}`;
    }

    /**
     * `dump` and `diff` differ only in whether unchanged settings are included,
     * which is why they share everything but one predicate.
     */
    async #emit({ onlyChanged, sections, profileIndex = 0, heading: headingText }) {
        const lines = [];
        for (const section of sections) {
            const entries = await this.#readAll(section, profileIndex);
            let heading = false;

            for (const { setting, value, error } of entries) {
                if (error) {
                    lines.push(`# ${setting.name}: ${error.message}`);
                    continue;
                }
                let changed = true;
                if (onlyChanged) {
                    const fallback = await this.io.readDefault(setting.name, profileIndex);
                    changed = JSON.stringify(fallback) !== JSON.stringify(value);
                }
                if (!changed) {
                    continue;
                }
                if (!heading) {
                    lines.push("", `# ${headingText ?? SECTION_HEADING[section] ?? section}`);
                    heading = true;
                }
                lines.push(`set ${setting.name} = ${formatValue(setting, value)}`);
            }
        }
        return lines;
    }

    /**
     * The banner cli_backup.js looks for. Its regex requires `# Wingflight /`
     * at the start of a line, and the flasher refuses to auto-restore a backup
     * that does not match -- so this is not cosmetic.
     */
    #banner() {
        const { target, version, revision } = this.io.identity ?? {};
        return [
            "# version",
            `# Wingflight / ${target ?? "UNKNOWN"} ${version ?? ""} ${revision ?? ""}`.trimEnd(),
        ];
    }

    /**
     * The `feature` / `serial` / `map` / `aux` blocks, in printConfig() order,
     * each only where the manifest can describe it. A backup without them
     * loses mode switches, serial ports and the channel map.
     */
    async #configBlocks(onlyChanged) {
        if (!this.io.readRange) {
            return [];
        }
        const lines = [];
        for (const block of CONFIG_BLOCKS) {
            if (!blockSupported(this.manifest, block)) {
                continue;
            }
            const body = await block.lines(this.manifest, this.io, onlyChanged);
            if (body.length) {
                lines.push("", `# ${block.heading}`, ...body);
            }
        }
        return lines;
    }

    /** The resource block, when the board and manifest can supply it. */
    async #resources() {
        if (!this.io.readRange || !(this.manifest.raw.resources ?? []).length) {
            return [];
        }
        const lines = await resourceLines(this.manifest, this.io);
        const timers = await timerLines(this.manifest, this.io);
        const dma = await dmaLines(this.manifest, this.io);
        return [
            ...(lines.length ? ["", "# resources", ...lines] : []),
            ...(timers.length ? ["", "# timer", ...timers] : []),
            ...(dma.length ? ["", "# dma", ...dma] : []),
        ];
    }

    /**
     * One profile's block, as cli.c's cliDump*Profile() printed it: the
     * selecting command always, then the heading and values. The command line
     * is what makes a replay write the values into the right element.
     */
    async #profileBlock(kind, index, onlyChanged) {
        const body = await this.#emit({
            onlyChanged,
            sections: [kind.section],
            profileIndex: index,
            heading: `${kind.command} ${index}`,
        });
        return ["", `${kind.command} ${index}`, ...body];
    }

    /**
     * Every profile of a kind, then a line restoring the board's selection --
     * without it, replaying a backup would leave the last profile selected.
     */
    async #allProfiles(kind, onlyChanged) {
        const lines = [];
        for (let index = 0; index < this.#profileCount(kind.section); index++) {
            lines.push(...(await this.#profileBlock(kind, index, onlyChanged)));
        }
        const selected = (await this.#currentSelection())[kind.section];
        lines.push("", `# restore original ${kind.command} selection`, `${kind.command} ${selected}`);
        return lines;
    }

    /**
     * `dump` / `diff` [all | master | hardware | profile | rates | tv_profile].
     *
     * Without `all`, profiles are the currently selected ones, as on the
     * on-device CLI. With it, every profile of every kind.
     */
    async #config(argument, onlyChanged) {
        const word = argument.trim().toLowerCase().split(/\s+/)[0];

        if (word && word !== "all") {
            const sections = DUMP_TARGETS[word];
            if (!sections) {
                throw new CliError(`Invalid dump target: ${word}`);
            }
            const kind = PROFILE_KINDS.find(({ section }) => section === sections[0]);
            const body = kind
                ? await this.#profileBlock(kind, (await this.#currentSelection())[kind.section], onlyChanged)
                : await this.#emit({ onlyChanged, sections });
            const before =
                sections[0] === "hardware"
                    ? await this.#resources()
                    : sections[0] === "master"
                      ? [...(await this.#nameLines(onlyChanged)), ...(await this.#configBlocks(onlyChanged))]
                      : [];
            return this.#wrap([...before, ...body]);
        }

        const body = [
            ...(await this.#nameLines(onlyChanged)),
            ...(await this.#resources()),
            ...(await this.#configBlocks(onlyChanged)),
        ];
        body.push(...(await this.#emit({ onlyChanged, sections: ["master", "hardware"] })));
        for (const kind of PROFILE_KINDS) {
            if (this.#profileCount(kind.section) === 0) {
                continue;
            }
            if (word === "all") {
                body.push(...(await this.#allProfiles(kind, onlyChanged)));
            } else {
                const selected = (await this.#currentSelection())[kind.section];
                body.push(...(await this.#profileBlock(kind, selected, onlyChanged)));
            }
        }
        return this.#wrap(body);
    }

    async #nameLines(onlyChanged) {
        return this.io.readRange ? nameLines(this.manifest, this.io, onlyChanged) : [];
    }

    async dump(argument = "") {
        return this.#config(argument, false);
    }

    async diff(argument = "") {
        return this.#config(argument, true);
    }

    #wrap(body) {
        return [
            ...this.#banner(),
            "",
            "# start the command batch",
            "batch start",
            "",
            "# reset configuration to default settings",
            "defaults nosave",
            ...body,
            "",
            "# end the command batch",
            "batch end",
            "",
            "# save configuration",
            "save",
        ].join("\n");
    }

    async save() {
        await this.io.save();
        return "Saving";
    }

    /**
     * `resource <OWNER> <index> <pin|NONE>`.
     *
     * The write side of the resource block. Without this a backup is
     * write-only: the dump lists the pins and nothing can put them back.
     */
    async resource(argument) {
        const [owner, indexText, pinText] = argument.trim().split(/\s+/);
        if (!owner || !indexText || pinText === undefined) {
            throw new CliError("Expected `resource <OWNER> <index> <pin|NONE>`");
        }

        const entry = (this.manifest.raw.resources ?? []).find(
            (r) => r.name?.toUpperCase() === owner.toUpperCase(),
        );
        if (!entry) {
            throw new CliError(`Unknown resource: ${owner}`);
        }

        const index = Number(indexText);
        if (!Number.isInteger(index) || index < 1 || index > entry.count) {
            throw new CliError(`${owner} has indices 1..${entry.count}`);
        }

        const tag = parsePin(pinText);
        await this.io.writeRange(entry.pgn, entry.off + entry.stride * (index - 1), [tag]);
        return `resource ${entry.name} ${index} ${formatPin(tag)}`;
    }

    /** `timer <pin> AF<n>|NONE` -- assigns a pin to one of its timers. */
    async timer(argument) {
        const [pinText, functionText] = argument.trim().split(/\s+/);
        if (!pinText || functionText === undefined) {
            throw new CliError("Expected `timer <pin> AF<n>|NONE`");
        }

        const tag = parsePin(pinText);
        const group = [...this.manifest.groups.values()].find(
            (pg) => pg.symbol === "timerIOConfig_SystemArray",
        );
        if (!group) {
            throw new CliError("This firmware has no timer configuration");
        }

        let index = 0;
        if (!/^NONE$/i.test(functionText)) {
            const wanted = /^AF(\d+)$/i.exec(functionText);
            if (!wanted) {
                throw new CliError(`Expected AF<n> or NONE, got '${functionText}'`);
            }
            // Which of this pin's timer entries carries that alternate
            // function -- the inverse of how the line was produced.
            const matches = (this.manifest.raw.timers ?? []).filter((t) => t.tag === tag);
            const found = matches.findIndex((t) => t.af === Number(wanted[1]));
            if (found < 0) {
                throw new CliError(`${pinText} has no timer with AF${wanted[1]}`);
            }
            index = found + 1;
        }

        const slot = await this.#timerSlotFor(tag, group);
        await this.io.writeRange(group.pgn, slot * group.elem_size, [tag, index]);
        return `timer ${formatPin(tag)} ${index ? functionText.toUpperCase() : "NONE"}`;
    }

    /** The slot already holding this pin, or the first free one. */
    async #timerSlotFor(tag, group) {
        let free = -1;
        for (let slot = 0; slot < group.length; slot++) {
            const view = await this.io.readRange(group.pgn, slot * group.elem_size, 1);
            const existing = view.getUint8(0);
            if (existing === tag) {
                return slot;
            }
            if (!existing && free < 0) {
                free = slot;
            }
        }
        if (free < 0) {
            throw new CliError("No free timer slots");
        }
        return free;
    }

    /** `dma <device> <index> <opt>` or `dma pin <pin> <opt>`. */
    async dma(argument) {
        const parts = argument.trim().split(/\s+/);
        if (parts.length < 3) {
            throw new CliError("Expected `dma <device> <index> <opt>` or `dma pin <pin> <opt>`");
        }
        const option = Number(parts[2]);
        if (!Number.isInteger(option)) {
            throw new CliError(`'${parts[2]}' is not a DMA option`);
        }
        const asByte = option < 0 ? option + 256 : option;

        if (parts[0].toLowerCase() === "pin") {
            const tag = parsePin(parts[1]);
            const group = [...this.manifest.groups.values()].find(
                (pg) => pg.symbol === "timerIOConfig_SystemArray",
            );
            if (!group) {
                throw new CliError("This firmware has no timer configuration");
            }
            const slot = await this.#timerSlotFor(tag, group);
            await this.io.writeRange(group.pgn, slot * group.elem_size + 2, [asByte]);
            return `dma pin ${formatPin(tag)} ${option}`;
        }

        const entry = (this.manifest.raw.dmaopts ?? []).find(
            (d) => d.device.toUpperCase() === parts[0].toUpperCase(),
        );
        if (!entry) {
            throw new CliError(`Unknown DMA device: ${parts[0]}`);
        }
        const index = Number(parts[1]);
        if (!Number.isInteger(index) || index < 1 || index > entry.count) {
            throw new CliError(`${entry.device} has indices 1..${entry.count}`);
        }
        await this.io.writeRange(entry.pgn, entry.off + entry.stride * (index - 1), [asByte]);
        return `dma ${entry.device} ${index} ${option}`;
    }

    /**
     * `defaults [nosave|nosave bare]`.
     *
     * A dump opens with this, so replaying one starts from a known state
     * rather than merging onto whatever was there.
     */
    async defaults(argument) {
        const save = !/\bnosave\b/i.test(argument);
        await this.io.resetConfig();
        // Defaults reset the board's profile selection too.
        this.selection = null;
        return save ? "Resetting to defaults and saving" : "Resetting to defaults";
    }

    /** Run one of the runtime diagnostics, or explain why it cannot be. */
    async #diagnostic(command, read, format) {
        if (!read) {
            throw new CliError(`${command} is not available on this connection`);
        }
        return format(await read());
    }

    async tasks() {
        return this.#diagnostic("tasks", this.io.readTaskInfo, formatTasks);
    }

    async gyroregisters() {
        return this.#diagnostic("gyroregisters", this.io.readGyroRegisters, formatGyroRegisters);
    }

    /**
     * `verify_msp [setters]`: compare the virtual MSP layer with the
     * firmware's real config opcodes. See verify_msp.js.
     */
    async verifyMsp(argument) {
        if (!this.io.rawRequest) {
            throw new CliError("verify_msp is not available on this connection");
        }
        const virtual = new VirtualMsp(this.manifest, this.io);
        if (!Object.keys(virtual.codecs).length) {
            throw new CliError("this firmware's manifest carries no MSP codecs");
        }
        const names = Object.fromEntries(Object.entries(MSPCodes).map(([name, code]) => [code, name]));
        const replies = await verifyReplies(virtual, this.io.rawRequest, names);
        const lines = [...replies.lines];
        if (/^setters$/i.test(argument)) {
            lines.push("# writing current values back through each virtual setter (RAM only, nothing is saved)");
            const setters = await verifySetters(virtual, this.io.rawRequest, names, symmetricPairs(virtual.codecs, MSPCodes));
            lines.push(...setters.lines);
        }
        return lines.join("\n");
    }

    async status() {
        return this.#diagnostic("status", this.io.readStatus, (s) => formatStatus(s, this.manifest.raw.cli));
    }

    async setpointInfo() {
        return this.#diagnostic("setpoint_info", this.io.readSetpointInfo, formatSetpointInfo);
    }

    async execute(line) {
        const text = line.trim();
        if (!text || text.startsWith("#")) {
            return "";
        }

        const [command, ...rest] = text.split(/\s+/);
        const argument = text.slice(command.length).trim();

        switch (command.toLowerCase()) {
            case "get":
                return this.get(rest.join(" "));
            case "set":
                return this.set(argument);
            case "dump":
                return this.dump(argument);
            case "diff":
                return this.diff(argument);
            case "save":
                return this.save();
            case "resource":
                return this.resource(argument);
            case "timer":
                return this.timer(argument);
            case "dma":
                return this.dma(argument);
            case "defaults":
                return this.defaults(argument);
            case "profile":
            case "rateprofile":
            case "tv_profile":
                return this.selectProfile(
                    PROFILE_KINDS.find((kind) => kind.command === command.toLowerCase()),
                    argument,
                );
            case "feature":
                return featureCommand(this.manifest, this.io, argument);
            case "serial":
                return serialCommand(this.manifest, this.io, argument);
            case "map":
                return mapCommand(this.manifest, this.io, argument);
            case "aux":
                return auxCommand(this.manifest, this.io, argument);
            case "mixer":
                return mixerCommand(this.manifest, this.io, argument);
            case "servo":
                return servoCommand(this.manifest, this.io, argument);
            case "rxfail":
                return rxfailCommand(this.manifest, this.io, argument);
            case "adjfunc":
                return adjfuncCommand(this.manifest, this.io, argument);
            case "beeper":
            case "beacon":
                return beeperCommand(this.manifest, this.io, command.toLowerCase(), argument);
            case "led":
                return ledCommand(this.manifest, this.io, argument);
            case "color":
                return colorCommand(this.manifest, this.io, argument);
            case "mode_color":
                return modeColorCommand(this.manifest, this.io, argument);
            case "version":
                return this.#banner()[1];
            case "exit":
                return actions.exitCommand(this.io);
            case "dfu":
                return actions.dfuCommand(this.io);
            case "bl":
                return actions.blCommand(this.manifest, this.io, argument);
            case "msc":
                return actions.mscCommand(this.io, argument);
            case "bind_rx":
                return actions.bindRxCommand(this.io);
            case "serialpassthrough":
                return actions.serialPassthroughCommand(this.manifest, this.io, argument);
            case "gpspassthrough":
                return actions.gpsPassthroughCommand(this.manifest, this.io);
            case "escprog":
                return actions.escprogCommand(this.manifest, this.io, argument);
            case "flash_info":
                return actions.flashInfoCommand(this.io);
            case "flash_erase":
                return actions.flashEraseCommand(this.io);
            case "flash_read":
                return actions.flashReadCommand(this.io, argument);
            case "status":
                return this.status();
            case "verify_msp":
                return this.verifyMsp(argument);
            case "tasks":
                return this.tasks();
            case "gyroregisters":
                return this.gyroregisters();
            case "setpoint_info":
                return this.setpointInfo();
            case "batch":
                // The firmware used a batch to defer errors across a replay.
                // Nothing here needs deferring, but a dump emits these lines,
                // so they must be accepted rather than rejected.
                return "";
            case "help":
                return [
                    "get      show a setting's value",
                    "set      change a setting: set <name> = <value>",
                    "dump     print the configuration",
                    "diff     print what differs from defaults",
                    "save     write the configuration and reboot",
                    "feature  [list] | [-]<name>  enable or disable a feature",
                    "serial   <id> <functions> <msp> <gps> <telemetry> <blackbox>  configure a port",
                    "map      <AETR1234>  channel map",
                    "aux      <index> <mode> <channel> <start> <end> <logic> <linked>  mode switch",
                    "mixer    [reset] | input <in> <min> <max> <rate> | rule <n> <op> <in> <out> <weight> <offset> ... | rule <n> del",
                    "servo    [flags <n> +REV|-REV +GEO|-GEO] | <n> <mid> <min> <max> <rneg> <rpos> <rate> <speed> <flags>",
                    "rxfail   <channel> [a|h|s [<value>]]  RX failsafe per channel",
                    "beeper / beacon  [list] | [-]<condition>  enable or disable a beeper condition",
                    "led      <index> <x>,<y>:<dirs>:<functions>:<color>:<pattern>:<pause>:<alt>",
                    "color    <index> <h>,<s>,<v>",
                    "mode_color <mode> <function> <color>",
                    "status   show system status",
                    "verify_msp [setters]  compare the virtual MSP layer with the firmware's config opcodes",
                    "version  show the firmware version",
                    "exit     reboot without saving",
                    "dfu / bl [rom|flash] / msc [<tz minutes>]  reboot into DFU, a bootloader or mass storage",
                    "bind_rx  start receiver binding",
                    "serialpassthrough <port|esc_sensor> / gpspassthrough / escprog <sk|bl|ki|cc> <output>  pass this port through",
                    "flash_info / flash_erase / flash_read <address> <length>  dataflash",
                    "adjfunc  <index> <function> <ena ch> <ena start> <ena end> <adj ch> <r1 start> <r1 end> <r2 start> <r2 end> <step> <min> <max>",
                    "profile / rateprofile / tv_profile [<index>]  show or change the selected profile",
                    "tasks    show task stats",
                    "gyroregisters  dump gyro config registers contents",
                    "setpoint_info  show the detected RX frame rate",
                ].join("\n");
            default:
                if (Object.hasOwn(actions.NOT_AVAILABLE, command.toLowerCase())) {
                    throw new CliError(
                        `${command} is not available in the configurator CLI (${actions.NOT_AVAILABLE[command.toLowerCase()]})`,
                    );
                }
                throw new CliError(`Unknown command: ${command}`);
        }
    }
}

export { ManifestError };
