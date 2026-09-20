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

/** Sections a `dump`/`diff` groups settings under, in firmware order. */
const SECTION_ORDER = ["master", "profile", "rate_profile", "tv_profile", "hardware"];

const SECTION_HEADING = {
    master: "master",
    profile: "profile",
    rate_profile: "rateprofile",
    tv_profile: "tvprofile",
    hardware: "hardware",
};

export class CliError extends Error {}

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
                const value = await this.io.read(each, 0);
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
            const value = await this.io.read(each, 0);
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
        await this.io.write(name, value, 0);
        return `${name} set to ${formatValue(setting, value)}`;
    }

    /**
     * `dump` and `diff` differ only in whether unchanged settings are included,
     * which is why they share everything but one predicate.
     */
    async #emit({ onlyChanged, sections, profileIndex = 0 }) {
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
                    lines.push("", `# ${SECTION_HEADING[section] ?? section}`);
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

    async dump(argument = "") {
        return this.#wrap(await this.#emit({ onlyChanged: false, sections: this.#sectionsFor(argument) }));
    }

    async diff(argument = "") {
        return this.#wrap(await this.#emit({ onlyChanged: true, sections: this.#sectionsFor(argument) }));
    }

    #sectionsFor(argument) {
        const word = argument.trim().toLowerCase().split(/\s+/)[0];
        if (!word || word === "all") {
            return SECTION_ORDER;
        }
        const named = Object.entries(SECTION_HEADING).find(([, heading]) => heading === word);
        if (!named) {
            throw new CliError(`Invalid dump target: ${word}`);
        }
        return [named[0]];
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
            case "help":
                return [
                    "get      show a setting's value",
                    "set      change a setting: set <name> = <value>",
                    "dump     print the configuration",
                    "diff     print what differs from defaults",
                    "save     write the configuration and reboot",
                ].join("\n");
            default:
                throw new CliError(`Unknown command: ${command}`);
        }
    }
}

export { ManifestError };
