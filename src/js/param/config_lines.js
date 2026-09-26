/**
 * The CLI's non-`set` configuration lines: `feature`, `serial`, `map`, `aux`.
 *
 * A firmware `dump`/`diff` printed these alongside the `set` lines, so every
 * backup carries them, and a backup that cannot replay them silently loses
 * mode switches, serial ports and the channel map. Each one is a parameter
 * group rendered through a table; the group bytes come over PARAM_READ, the
 * tables from the manifest's `cli` section (see the firmware's
 * wf_manifest.py read_cli_tables()). Printing and parsing follow the deleted
 * cli.c function by function, including its quirks, because the text is a
 * file format.
 */

import { CliError } from "./cli_error.js";

// --- plumbing --------------------------------------------------------------

function groupBySymbol(manifest, symbol) {
    return manifest.raw.pgs.find((pg) => pg.symbol === symbol) ?? null;
}

function fieldNamed(fields, name) {
    return fields.find((f) => f.name === name) ?? null;
}

function tables(manifest) {
    return manifest.raw.cli ?? {};
}

/** A group and the tables a command needs, or a refusal naming what is missing. */
function require(manifest, command, symbol, ...tableNames) {
    const group = groupBySymbol(manifest, symbol);
    const cli = tables(manifest);
    const missing = tableNames.filter((t) => cli[t] === undefined);
    if (!group || missing.length) {
        throw new CliError(`${command} is not supported by this firmware's manifest`);
    }
    return { group, cli };
}

/**
 * Largest range moved per request. The smallest MSP buffers are 320 bytes out
 * and 192 in (msp_serial.h), and mixerRules alone is 512 bytes, so a whole
 * group cannot be assumed to fit either way.
 */
const CHUNK = 128;

async function readChunked(read, group) {
    const out = new Uint8Array(group.size);
    for (let off = 0; off < group.size; off += CHUNK) {
        const view = await read(group.pgn, off, Math.min(CHUNK, group.size - off));
        out.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), off);
    }
    return out;
}

async function readGroup(io, group) {
    return readChunked((pgn, off, len) => io.readRange(pgn, off, len), group);
}

async function readDefaultGroup(io, group) {
    return io.readDefaultRange ? readChunked((pgn, off, len) => io.readDefaultRange(pgn, off, len), group) : null;
}

async function writeChunked(io, pgn, offset, bytes) {
    for (let at = 0; at < bytes.length; at += CHUNK) {
        await io.writeRange(pgn, offset + at, [...bytes.slice(at, at + CHUNK)]);
    }
}

/** Put a whole group back to its defaults, as PG_RESET() did. */
async function resetGroup(io, group) {
    const defaults = await readDefaultGroup(io, group);
    if (!defaults) {
        throw new CliError("resetting needs the board's defaults, which this connection cannot read");
    }
    await writeChunked(io, group.pgn, 0, defaults);
}

function getInt(bytes, off, size, signed) {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    if (size === 1) return signed ? view.getInt8(off) : view.getUint8(off);
    if (size === 2) return signed ? view.getInt16(off, true) : view.getUint16(off, true);
    return signed ? view.getInt32(off, true) : view.getUint32(off, true);
}

function setInt(bytes, off, size, value) {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    if (size === 1) view.setUint8(off, value & 0xff);
    else if (size === 2) view.setUint16(off, value & 0xffff, true);
    else view.setUint32(off, value >>> 0, true);
}

function sameBytes(a, b, off, length) {
    for (let i = off; i < off + length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/** C's atoi: a leading integer, 0 if there is none. */
function atoi(text) {
    const n = parseInt(text ?? "", 10);
    return Number.isNaN(n) ? 0 : n;
}

// --- feature ---------------------------------------------------------------

async function featureMasks(manifest, io) {
    const { group, cli } = require(manifest, "feature", "featureConfig_System", "features");
    const f = fieldNamed(group.fields, "enabledFeatures");
    const live = await readGroup(io, group);
    const defaults = await readDefaultGroup(io, group);
    return {
        group,
        field: f,
        features: cli.features,
        mask: getInt(live, f.off, f.size, false),
        defaultMask: defaults ? getInt(defaults, f.off, f.size, false) : null,
    };
}

/**
 * printFeature(): every feature disabled first, then the enabled ones, so a
 * replay starts from nothing. A diff keeps only lines that differ from the
 * default in that direction.
 */
export async function featureLines(manifest, io, onlyChanged) {
    const { features, mask, defaultMask } = await featureMasks(manifest, io);
    const lines = [];
    for (const { bit, name } of features) {
        const b = 1 << bit;
        const equalsDefault = defaultMask !== null && Boolean((~defaultMask | mask) & b);
        if (!onlyChanged || !equalsDefault) lines.push(`feature -${name}`);
    }
    for (const { bit, name } of features) {
        const b = 1 << bit;
        if (!(mask & b)) continue;
        const equalsDefault = defaultMask !== null && Boolean((defaultMask | ~mask) & b);
        if (!onlyChanged || !equalsDefault) lines.push(`feature ${name}`);
    }
    return lines;
}

/** `feature`, `feature list`, `feature [-]<name>` (prefix match, as cliFeature). */
export async function featureCommand(manifest, io, argument) {
    const { group, field, features, mask } = await featureMasks(manifest, io);

    if (!argument) {
        return `Enabled: ${features.filter(({ bit }) => mask & (1 << bit)).map(({ name }) => `${name} `).join("")}`;
    }
    if ("list".startsWith(argument.toLowerCase())) {
        return `Available:${features.map(({ name }) => ` ${name}`).join("")}`;
    }

    const remove = argument.startsWith("-");
    const wanted = (remove ? argument.slice(1) : argument).toLowerCase();
    const match = features.find(({ name }) => wanted && name.toLowerCase().startsWith(wanted));
    if (!match) {
        throw new CliError("INVALID NAME");
    }

    const updated = remove ? mask & ~(1 << match.bit) : mask | (1 << match.bit);
    const bytes = new Uint8Array(field.size);
    setInt(bytes, 0, field.size, updated);
    await io.writeRange(group.pgn, field.off, [...bytes]);
    return `${remove ? "Disabled" : "Enabled"} ${match.name}`;
}

// --- serial ----------------------------------------------------------------

// baudRate_e indices bounding what each column accepted in cliSerial().
const BAUD_RANGES = [
    { field: "msp_baudrateIndex", min: 1, max: 12 }, //        9600 .. 1000000
    { field: "gps_baudrateIndex", min: 1, max: 5 }, //         9600 .. 115200
    { field: "telemetry_baudrateIndex", min: 0, max: 5 }, //   AUTO .. 115200
    { field: "blackbox_baudrateIndex", min: 2, max: 15 }, //  19200 .. 2470000
];

function serialLayout(manifest) {
    const { group, cli } = require(manifest, "serial", "serialConfig_System", "baud_rates", "serial_ports");
    const ports = fieldNamed(group.fields, "portConfigs");
    const sub = Object.fromEntries(ports.fields.map((f) => [f.name, f]));
    return { group, cli, ports, sub };
}

function serialPortAt(bytes, layout, index) {
    const base = layout.ports.off + index * layout.ports.stride;
    const get = (name) => getInt(bytes, base + layout.sub[name].off, layout.sub[name].size, layout.sub[name].kind === "int");
    return {
        base,
        identifier: get("identifier"),
        functionMask: get("functionMask"),
        bauds: BAUD_RANGES.map(({ field }) => get(field)),
    };
}

function serialLine(cli, port) {
    const rate = (index) => cli.baud_rates[index] ?? 0;
    return `serial ${port.identifier} ${port.functionMask} ${port.bauds.map(rate).join(" ")}`;
}

/** printSerial(): one line per port this target has, in portConfigs order. */
export async function serialLines(manifest, io, onlyChanged) {
    const layout = serialLayout(manifest);
    const live = await readGroup(io, layout.group);
    const defaults = onlyChanged ? await readDefaultGroup(io, layout.group) : null;
    const lines = [];
    for (let i = 0; i < layout.ports.count; i++) {
        const port = serialPortAt(live, layout, i);
        if (!layout.cli.serial_ports.includes(port.identifier)) continue;
        if (onlyChanged && defaults && sameBytes(live, defaults, port.base, layout.ports.stride)) continue;
        lines.push(serialLine(layout.cli, port));
    }
    return lines;
}

/** `serial <id> <functionMask> <msp> <gps> <telemetry> <blackbox>`, as cliSerial. */
export async function serialCommand(manifest, io, argument) {
    if (!argument) {
        return (await serialLines(manifest, io, false)).join("\n");
    }
    const layout = serialLayout(manifest);
    const live = await readGroup(io, layout.group);
    const args = argument.split(/\s+/);

    let valid = 0;
    const identifier = atoi(args[0]);
    let slot = -1;
    for (let i = 0; i < layout.ports.count; i++) {
        if (serialPortAt(live, layout, i).identifier === identifier) {
            slot = i;
            break;
        }
    }
    if (slot >= 0) valid++;

    let functionMask = 0;
    if (args.length > 1) {
        functionMask = atoi(args[1]) >>> 0;
        valid++;
    }

    const bauds = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
        const text = args[2 + i];
        if (text === undefined) break;
        const value = atoi(text);
        const index = layout.cli.baud_rates.indexOf(value);
        if (index < 0) break;
        const { min, max } = BAUD_RANGES[i];
        if (index < min || index > max) continue;
        bauds[i] = index;
        valid++;
    }

    if (valid < 6) {
        throw new CliError("INVALID ARGUMENT COUNT");
    }

    // cliSerial() memcpy'd a zeroed struct over the slot: every field is
    // replaced, padding included.
    const element = new Uint8Array(layout.ports.stride);
    const put = (name, value) => setInt(element, layout.sub[name].off, layout.sub[name].size, value);
    put("identifier", identifier);
    put("functionMask", functionMask);
    BAUD_RANGES.forEach(({ field }, i) => put(field, bauds[i]));
    await io.writeRange(layout.group.pgn, layout.ports.off + slot * layout.ports.stride, [...element]);

    return serialLine(layout.cli, { identifier, functionMask, bauds });
}

// --- map -------------------------------------------------------------------

function mapLayout(manifest) {
    const { group, cli } = require(manifest, "map", "rxConfig_System", "rc_letters");
    return { group, letters: cli.rc_letters, rcmap: fieldNamed(group.fields, "rcmap") };
}

function mapText(letters, rcmap) {
    const buf = new Array(rcmap.length).fill("?");
    rcmap.forEach((target, i) => {
        if (target < buf.length) buf[target] = letters[i];
    });
    return buf.join("");
}

/** printMap(). */
export async function mapLines(manifest, io, onlyChanged) {
    const { group, letters, rcmap } = mapLayout(manifest);
    const live = await readGroup(io, group);
    const current = [...live.slice(rcmap.off, rcmap.off + rcmap.count)];
    if (onlyChanged) {
        const defaults = await readDefaultGroup(io, group);
        if (defaults && sameBytes(live, defaults, rcmap.off, rcmap.count)) return [];
    }
    return [`map ${mapText(letters, current)}`];
}

/** `map [AETR1234]`, as cliMap and parseRcChannels(). */
export async function mapCommand(manifest, io, argument) {
    const { group, letters, rcmap } = mapLayout(manifest);
    const count = rcmap.count;

    if (argument) {
        if (argument.length !== count) {
            throw new CliError("INVALID ARGUMENT COUNT");
        }
        const input = argument.toUpperCase();
        for (let i = 0; i < count; i++) {
            if (!letters.includes(input[i]) || input.indexOf(input[i], i + 1) >= 0) {
                throw new CliError("PARSING FAILED");
            }
        }
        const mapped = [];
        for (let i = 0; i < count; i++) {
            const j = input.indexOf(letters[i]);
            mapped.push(j >= 0 ? j : i);
        }
        await io.writeRange(group.pgn, rcmap.off, mapped);
        return `map ${mapText(letters, mapped)}`;
    }

    return (await mapLines(manifest, io, false))[0];
}

// --- aux -------------------------------------------------------------------

const MIN_MODE_RANGE_STEP = -125;
const MAX_MODE_RANGE_STEP = 125;
const MODELOGIC_OR = 0;
const MODELOGIC_AND = 1;

// Wingflight centres its mode ranges on 1500, unlike Betaflight's 900 + 25n.
const stepToChannel = (step) => 1500 + 5 * step;
const channelToStep = (value) => Math.trunc((value - 1500) / 5);

function auxLayout(manifest) {
    const { group, cli } = require(manifest, "aux", "modeActivationConditions_SystemArray", "boxes", "aux_channel_count");
    const repeat = group.fields[0];
    const sub = Object.fromEntries(repeat.fields.map((f) => [f.name, f]));
    return { group, cli, repeat, sub };
}

function auxAt(bytes, layout, index) {
    const base = layout.repeat.off + index * layout.repeat.stride;
    const get = (name) => getInt(bytes, base + layout.sub[name].off, layout.sub[name].size, layout.sub[name].kind === "int");
    return {
        base,
        modeId: get("modeId"),
        linkedTo: get("linkedTo"),
        modeLogic: get("modeLogic"),
        auxChannelIndex: get("auxChannelIndex"),
        startStep: get("range.startStep"),
        endStep: get("range.endStep"),
    };
}

const boxById = (cli, id) => cli.boxes.find((b) => b.id === id) ?? null;
const boxByPerm = (cli, perm) => cli.boxes.find((b) => b.perm === perm) ?? null;

function auxLine(cli, index, mac) {
    const box = boxById(cli, mac.modeId);
    const linked = boxById(cli, mac.linkedTo);
    return `aux ${index} ${box ? box.perm : 0} ${mac.auxChannelIndex} ${stepToChannel(mac.startStep)} ${stepToChannel(mac.endStep)} ${mac.modeLogic} ${linked ? linked.perm : 0}`;
}

/** printAux(): every slot whose mode resolves, or in a diff every slot changed. */
export async function auxLines(manifest, io, onlyChanged) {
    const layout = auxLayout(manifest);
    const live = await readGroup(io, layout.group);
    const defaults = onlyChanged ? await readDefaultGroup(io, layout.group) : null;
    const lines = [];
    for (let i = 0; i < layout.repeat.count; i++) {
        const mac = auxAt(live, layout, i);
        if (!boxById(layout.cli, mac.modeId)) continue;
        if (onlyChanged && defaults && sameBytes(live, defaults, mac.base, layout.repeat.stride)) continue;
        lines.push(auxLine(layout.cli, i, mac));
    }
    return lines;
}

/**
 * `aux <index> <permanentId> <channel> <start> <end> [<logic> [<linkedTo>]]`.
 *
 * cliAux() updated the slot field by field, keeping the old value for any
 * argument it rejected, then patched short forms for backwards compatibility
 * and cleared the slot if too few arguments were valid. All of that is kept.
 */
export async function auxCommand(manifest, io, argument) {
    if (!argument) {
        return (await auxLines(manifest, io, false)).join("\n");
    }
    const layout = auxLayout(manifest);
    const args = argument.split(/\s+/);
    const index = atoi(args[0]);
    if (index < 0 || index >= layout.repeat.count) {
        throw new CliError(`INDEX NOT BETWEEN 0 AND ${layout.repeat.count - 1}`);
    }

    const live = await readGroup(io, layout.group);
    const mac = auxAt(live, layout, index);
    let valid = 0;
    let at = 1;
    const next = () => args[at++];

    let text = next();
    if (text !== undefined) {
        const box = boxByPerm(layout.cli, atoi(text));
        if (box) {
            mac.modeId = box.id;
            valid++;
        }
    }
    text = next();
    if (text !== undefined) {
        const channel = atoi(text);
        if (channel >= 0 && channel < layout.cli.aux_channel_count) {
            mac.auxChannelIndex = channel;
            valid++;
        }
    }
    for (const key of ["startStep", "endStep"]) {
        text = next();
        if (text !== undefined) {
            const step = channelToStep(atoi(text));
            if (step >= MIN_MODE_RANGE_STEP && step <= MAX_MODE_RANGE_STEP) {
                mac[key] = step;
                valid++;
            }
        }
    }
    text = next();
    if (text !== undefined) {
        const logic = atoi(text);
        if (logic === MODELOGIC_OR || logic === MODELOGIC_AND) {
            mac.modeLogic = logic;
            valid++;
        }
    }
    text = next();
    if (text !== undefined) {
        const box = boxByPerm(layout.cli, atoi(text));
        if (box) {
            mac.linkedTo = box.id;
            valid++;
        }
    }

    if (valid === 4) {
        mac.modeLogic = MODELOGIC_OR;
        mac.linkedTo = 0;
    } else if (valid === 5) {
        mac.linkedTo = 0;
    } else if (valid !== 6) {
        Object.assign(mac, { modeId: 0, linkedTo: 0, modeLogic: 0, auxChannelIndex: 0, startStep: 0, endStep: 0 });
    }

    const element = new Uint8Array(layout.repeat.stride);
    const put = (name, value) => setInt(element, layout.sub[name].off, layout.sub[name].size, value);
    put("modeId", mac.modeId);
    put("linkedTo", mac.linkedTo);
    put("modeLogic", mac.modeLogic);
    put("auxChannelIndex", mac.auxChannelIndex);
    put("range.startStep", mac.startStep);
    put("range.endStep", mac.endStep);
    await io.writeRange(layout.group.pgn, mac.base, [...element]);

    return auxLine(layout.cli, index, mac);
}

// --- mixer -----------------------------------------------------------------

function repeatLayout(group) {
    const repeat = group.fields[0];
    return { repeat, sub: Object.fromEntries(repeat.fields.map((f) => [f.name, f])) };
}

function readElement(bytes, group, index) {
    const { repeat, sub } = repeatLayout(group);
    const base = repeat.off + index * repeat.stride;
    const out = { base };
    for (const [name, f] of Object.entries(sub)) {
        out[name] = getInt(bytes, base + f.off, f.size, f.kind === "int");
    }
    return out;
}

function encodeElement(group, values) {
    const { repeat, sub } = repeatLayout(group);
    const bytes = new Uint8Array(repeat.stride);
    for (const [name, f] of Object.entries(sub)) {
        setInt(bytes, f.off, f.size, values[name] ?? 0);
    }
    return bytes;
}

function mixerTables(manifest) {
    const cli = tables(manifest);
    if (!cli.mixer_inputs || !cli.mixer_outputs || !cli.mixer_ops || !cli.limits) {
        throw new CliError("mixer is not supported by this firmware's manifest");
    }
    const inputs = groupBySymbol(manifest, "mixerInputs_SystemArray");
    const rules = groupBySymbol(manifest, "mixerRules_SystemArray");
    if (!inputs || !rules) {
        throw new CliError("mixer is not supported by this firmware's manifest");
    }
    return { cli, inputs, rules, curves: groupBySymbol(manifest, "mixerCurves_SystemArray") };
}

const nameOr = (names, index) => names[index] ?? String(index);

/** strcasecmp against a name table, after atoi(): a number works as well as a name. */
function lookupName(names, text) {
    let value = atoi(text);
    names.forEach((name, i) => {
        if (name && name.toLowerCase() === text.toLowerCase()) value = i;
    });
    return value;
}

/**
 * printMixerInputs() / printMixerRates() / printMixerLimits(): inputs with a
 * non-zero rate. One addition: an input whose rate was zeroed from a non-zero
 * default is printed too. The firmware skipped it, so replaying its own backup
 * brought the default rate back.
 */
async function mixerInputEntries(manifest, io, onlyChanged) {
    const { cli, inputs } = mixerTables(manifest);
    const live = await readGroup(io, inputs);
    const defaults = await readDefaultGroup(io, inputs);
    if (onlyChanged && defaults && sameBytes(live, defaults, 0, inputs.size)) {
        return [];
    }
    const { repeat } = repeatLayout(inputs);
    const out = [];
    for (let i = 1; i < repeat.count; i++) {
        const input = readElement(live, inputs, i);
        const equalsDefault = defaults ? sameBytes(live, defaults, input.base, repeat.stride) : false;
        const zeroedFromDefault = defaults && input.rate === 0 && readElement(defaults, inputs, i).rate !== 0;
        if ((input.rate || zeroedFromDefault) && !(onlyChanged && equalsDefault)) {
            out.push({ name: nameOr(cli.mixer_inputs, i), ...input });
        }
    }
    return out;
}

export async function mixerInputLines(manifest, io, onlyChanged) {
    return (await mixerInputEntries(manifest, io, onlyChanged)).map(
        (e) => `mixer input ${e.name} ${e.min} ${e.max} ${e.rate}`,
    );
}

function ruleLine(cli, index, rule) {
    return (
        `mixer rule ${index} ${nameOr(cli.mixer_ops, rule.oper)} ${nameOr(cli.mixer_inputs, rule.input)} ` +
        `${nameOr(cli.mixer_outputs, rule.output)} ${rule.weight} ${rule.offset} ${rule.weightNeg} ` +
        `${rule.speed} ${rule.curve} ${rule.condition} ${rule.role}`
    );
}

/**
 * printMixerRules(): every rule with an operation. One addition: a rule
 * deleted from a non-empty default is printed as `mixer rule N del`, which the
 * firmware accepted but never emitted -- so a deleted default rule came back
 * on replay.
 */
export async function mixerRuleLines(manifest, io, onlyChanged) {
    const { cli, rules } = mixerTables(manifest);
    const live = await readGroup(io, rules);
    const defaults = await readDefaultGroup(io, rules);
    if (onlyChanged && defaults && sameBytes(live, defaults, 0, rules.size)) {
        return [];
    }
    const { repeat } = repeatLayout(rules);
    const lines = [];
    for (let i = 0; i < repeat.count; i++) {
        const rule = readElement(live, rules, i);
        const equalsDefault = defaults ? sameBytes(live, defaults, rule.base, repeat.stride) : false;
        if (rule.oper) {
            if (!(onlyChanged && equalsDefault)) lines.push(ruleLine(cli, i, rule));
        } else if (defaults && readElement(defaults, rules, i).oper) {
            lines.push(`mixer rule ${i} del`);
        }
    }
    return lines;
}

/**
 * `mixer` [reset | input ... | rule ... | rate ... | limit ...], as cliMixer.
 * `curve`, `status` and `override` are not carried over: curves were never
 * part of a dump, and the other two act on live outputs, not configuration.
 */
export async function mixerCommand(manifest, io, argument) {
    const { cli, inputs, rules, curves } = mixerTables(manifest);
    const L = cli.limits;
    const args = argument ? argument.split(/\s+/).slice(0, 22) : [];
    const count = args.length;
    const sub = (args[0] ?? "").toLowerCase();
    const inputCount = repeatLayout(inputs).repeat.count;
    const ruleCount = repeatLayout(rules).repeat.count;
    const outOfRange = () => new CliError("ARGUMENT OUT OF RANGE");
    const badCount = () => new CliError("INVALID ARGUMENT COUNT");
    const inRange = (v, lo, hi) => v >= lo && v <= hi;

    async function writeInput(index, change) {
        const live = await readGroup(io, inputs);
        const element = { ...readElement(live, inputs, index), ...change };
        await io.writeRange(inputs.pgn, element.base, [...encodeElement(inputs, element)]);
    }

    if (count === 0) {
        const inputLines = await mixerInputLines(manifest, io, false);
        const ruleLines = (await mixerRuleLines(manifest, io, false)).filter((l) => !l.endsWith(" del"));
        return ["", "# mixer input", ...inputLines, "", "# mixer rule", ...ruleLines].join("\n");
    }

    switch (sub) {
        case "reset":
            await resetGroup(io, inputs);
            await resetGroup(io, rules);
            if (curves) await resetGroup(io, curves);
            return "";

        case "input":
            if (count === 1) return (await mixerInputLines(manifest, io, false)).join("\n");
            if (count === 2) {
                if (args[1].toLowerCase() === "reset") await resetGroup(io, inputs);
                return "";
            }
            if (count === 5) {
                const index = lookupName(cli.mixer_inputs, args[1]);
                const [min, max, rate] = args.slice(2).map(atoi);
                if (index > 0 && index < inputCount && inRange(rate, L.mixerRateMin, L.mixerRateMax) &&
                    inRange(min, L.mixerInputMin, L.mixerInputMax) && inRange(max, L.mixerInputMin, L.mixerInputMax) && min <= max) {
                    await writeInput(index, { min, max, rate });
                    return "";
                }
                throw outOfRange();
            }
            throw badCount();

        case "rate":
            if (count === 1) {
                return (await mixerInputEntries(manifest, io, false))
                    .filter((e) => e.rate)
                    .map((e) => `mixer rate ${e.name} ${e.rate}`)
                    .join("\n");
            }
            if (count === 3) {
                const index = lookupName(cli.mixer_inputs, args[1]);
                const rate = atoi(args[2]);
                if (index > 0 && index < inputCount && inRange(rate, L.mixerRateMin, L.mixerRateMax)) {
                    await writeInput(index, { rate });
                    return "";
                }
                throw outOfRange();
            }
            throw badCount();

        case "limit":
            if (count === 1) {
                return (await mixerInputEntries(manifest, io, false))
                    .filter((e) => e.rate)
                    .map((e) => `mixer limit ${e.name} ${e.min} ${e.max}`)
                    .join("\n");
            }
            if (count === 4) {
                const index = lookupName(cli.mixer_inputs, args[1]);
                const [min, max] = args.slice(2).map(atoi);
                if (index > 0 && index < inputCount && inRange(min, L.mixerInputMin, L.mixerInputMax) &&
                    inRange(max, L.mixerInputMin, L.mixerInputMax) && min <= max) {
                    await writeInput(index, { min, max });
                    return "";
                }
                throw outOfRange();
            }
            throw badCount();

        case "rule": {
            if (count === 1) {
                return (await mixerRuleLines(manifest, io, false)).filter((l) => !l.endsWith(" del")).join("\n");
            }
            if (count === 2) {
                if (args[1].toLowerCase() === "reset") await resetGroup(io, rules);
                return "";
            }
            if (count === 3) {
                if (args[2].toLowerCase() === "del") {
                    const index = atoi(args[1]);
                    if (index < 0 || index >= ruleCount) throw outOfRange();
                    const { repeat } = repeatLayout(rules);
                    await io.writeRange(rules.pgn, repeat.off + index * repeat.stride, new Array(repeat.stride).fill(0));
                }
                return "";
            }
            if (count >= 7 && count <= 12) {
                const index = atoi(args[1]);
                const oper = lookupName(cli.mixer_ops, args[2]);
                const input = lookupName(cli.mixer_inputs, args[3]);
                const output = lookupName(cli.mixer_outputs, args[4]);
                const weight = atoi(args[5]);
                const offset = atoi(args[6]);
                const weightNeg = count >= 8 ? atoi(args[7]) : weight;
                const speed = count >= 9 ? atoi(args[8]) : 0;
                const curve = count >= 10 ? atoi(args[9]) : 0;
                const condition = count >= 11 ? atoi(args[10]) : 0;
                const role = count >= 12 ? atoi(args[11]) : 0;
                if (index >= 0 && index < ruleCount &&
                    oper >= 0 && oper < cli.mixer_ops.length &&
                    input >= 0 && input < inputCount &&
                    output >= 0 && output < cli.mixer_outputs.length &&
                    inRange(offset, L.mixerInputMin, L.mixerInputMax) &&
                    inRange(weight, L.mixerWeightMin, L.mixerWeightMax) &&
                    inRange(weightNeg, L.mixerWeightMin, L.mixerWeightMax) &&
                    inRange(speed, L.servoSpeedMin, L.servoSpeedMax) &&
                    inRange(curve, 0, L.mixerCurveCount) &&
                    inRange(condition, 0, L.logicConditionCount) &&
                    role >= 0 && role < L.mixerRuleRoleCount) {
                    const { repeat } = repeatLayout(rules);
                    const bytes = encodeElement(rules, { oper, input, output, weight, offset, weightNeg, speed, curve, condition, role });
                    await io.writeRange(rules.pgn, repeat.off + index * repeat.stride, [...bytes]);
                    return "";
                }
                throw outOfRange();
            }
            throw badCount();
        }

        case "curve":
        case "status":
        case "override":
            throw new CliError(`mixer ${sub} is not available in the configurator CLI yet`);

        default:
            throw new CliError("INVALID ARGUMENT");
    }
}

// --- servo -----------------------------------------------------------------

const SERVO_FLAG_REVERSED = 1 << 0;
const SERVO_FLAG_GEO_CORR = 1 << 1;

function servoTables(manifest) {
    const cli = tables(manifest);
    const params = groupBySymbol(manifest, "servoParams_SystemArray");
    const config = groupBySymbol(manifest, "servoConfig_System");
    const serial = groupBySymbol(manifest, "serialConfig_System");
    if (!params || !config || !serial || !cli.limits?.servoRateMax) {
        throw new CliError("servo is not supported by this firmware's manifest");
    }
    return { L: cli.limits, params, config, serial, count: repeatLayout(params).repeat.count };
}

/**
 * getServoCount(): servoInit() counts the leading pins that are assigned. It
 * also stops at a pin it cannot get a timer for, which only a board with a
 * broken resource map would hit -- and then this prints one servo more than
 * the firmware did, which replays harmlessly.
 */
async function pwmServoCount(io, t) {
    const bytes = await readGroup(io, t.config);
    const tags = fieldNamed(t.config.fields, "ioTags");
    let n = 0;
    while (n < tags.count && n < t.count && bytes[tags.off + n]) n++;
    return n;
}

/** serialConfigHasBusServos(): any port running SBUS out or FBUS master. */
function hasBusServos(bytes, serial, mask) {
    if (!bytes) return false;
    const ports = fieldNamed(serial.fields, "portConfigs");
    const fm = ports.fields.find((f) => f.name === "functionMask");
    for (let i = 0; i < ports.count; i++) {
        if (getInt(bytes, ports.off + i * ports.stride + fm.off, fm.size, false) & mask) return true;
    }
    return false;
}

function servoLine(index, s) {
    return `servo ${index + 1} ${s.mid} ${s.min} ${s.max} ${s.rneg} ${s.rpos} ${s.rate} ${s.speed} ${s.flags}`;
}

/** printServo(): the PWM servos in use, then S9.. when bus servos are in play. */
async function servoBlock(manifest, io, onlyChanged, withDefaults) {
    const t = servoTables(manifest);
    const live = await readGroup(io, t.params);
    const defaults = withDefaults ? await readDefaultGroup(io, t.params) : null;
    const serialLive = await readGroup(io, t.serial);
    const serialDefault = withDefaults ? await readDefaultGroup(io, t.serial) : null;
    const mask = t.L.busServoFunctionMask;
    const stride = repeatLayout(t.params).repeat.stride;
    const changed = (i) => !defaults || !sameBytes(live, defaults, readElement(live, t.params, i).base, stride);

    let printBus = hasBusServos(serialLive, t.serial, mask) || hasBusServos(serialDefault, t.serial, mask);
    if (!printBus && defaults) {
        for (let i = t.L.busServoOffset; i < t.count; i++) printBus ||= changed(i);
    }

    const pwm = await pwmServoCount(io, t);
    const pwmLines = [];
    for (let i = 0; i < pwm; i++) {
        if (!onlyChanged || changed(i)) pwmLines.push(servoLine(i, readElement(live, t.params, i)));
    }
    const lines = pwmLines.length ? ["# PWM Servos", ...pwmLines] : [];
    if (printBus) {
        for (let i = t.L.busServoOffset; i < t.count; i++) {
            if (!onlyChanged || changed(i)) lines.push(servoLine(i, readElement(live, t.params, i)));
        }
    }
    return lines;
}

export function servoLines(manifest, io, onlyChanged) {
    return servoBlock(manifest, io, onlyChanged, true);
}

function flagsText(index, flags) {
    return `servo flags ${index} ${flags & SERVO_FLAG_REVERSED ? "+" : "-"}REV ${flags & SERVO_FLAG_GEO_CORR ? "+" : "-"}GEO`;
}

/** `servo`, `servo flags ...`, `servo <n> <mid> <min> <max> <rneg> <rpos> <rate> <speed> <flags>`. */
export async function servoCommand(manifest, io, argument) {
    const t = servoTables(manifest);
    const L = t.L;
    const args = argument ? argument.split(/\s+/).slice(0, 9) : [];
    const count = args.length;
    const outOfRange = () => new CliError("ARGUMENT OUT OF RANGE");

    if (count === 0) {
        return (await servoBlock(manifest, io, false, false)).join("\n");
    }

    const sub = args[0].toLowerCase();
    if (sub === "status" || sub === "override") {
        throw new CliError(`servo ${sub} acts on live outputs and is not available in the configurator CLI`);
    }

    if (sub === "flags") {
        const live = await readGroup(io, t.params);
        if (count === 1) {
            const serial = await readGroup(io, t.serial);
            const n = hasBusServos(serial, t.serial, L.busServoFunctionMask) ? t.count : await pwmServoCount(io, t);
            const lines = [];
            for (let i = 0; i < n; i++) lines.push(flagsText(i + 1, readElement(live, t.params, i).flags));
            return lines.join("\n");
        }
        if (count >= 3) {
            const index = atoi(args[1]);
            if (index < 1 || index > t.count) throw outOfRange();
            const servo = readElement(live, t.params, index - 1);
            let flags = servo.flags;
            for (const arg of args.slice(2)) {
                const sign = arg[0];
                const name = arg.slice(1);
                if ((sign !== "+" && sign !== "-") || (name !== "REV" && name !== "GEO")) throw outOfRange();
                const bit = name === "REV" ? SERVO_FLAG_REVERSED : SERVO_FLAG_GEO_CORR;
                flags = sign === "+" ? flags | bit : flags & ~bit;
            }
            const f = repeatLayout(t.params).sub.flags;
            const bytes = new Uint8Array(f.size);
            setInt(bytes, 0, f.size, flags);
            await io.writeRange(t.params.pgn, servo.base + f.off, [...bytes]);
            return flagsText(index, flags);
        }
        throw new CliError("INVALID ARGUMENT COUNT");
    }

    if (count === 9) {
        const [index, mid, min, max, rneg, rpos, rate, speed, flags] = args.map(atoi);
        const inRange = (v, lo, hi) => v >= lo && v <= hi;
        if (!inRange(index, 1, t.count) || !inRange(mid, L.servoPulseMin, L.servoPulseMax) ||
            !inRange(min, L.servoLimitMin, L.servoLimitMax) || !inRange(max, L.servoLimitMin, L.servoLimitMax) || min > max ||
            !inRange(rneg, L.servoScaleMin, L.servoScaleMax) || !inRange(rpos, L.servoScaleMin, L.servoScaleMax) ||
            !inRange(rate, L.servoRateMin, L.servoRateMax) || !inRange(speed, L.servoSpeedMin, L.servoSpeedMax) ||
            flags > L.servoFlagsAll) {
            throw outOfRange();
        }
        const values = { mid, min, max, rneg, rpos, rate, speed, flags: flags & 0xffff };
        const { repeat } = repeatLayout(t.params);
        await io.writeRange(t.params.pgn, repeat.off + (index - 1) * repeat.stride, [...encodeElement(t.params, values)]);
        return servoLine(index - 1, values);
    }

    throw new CliError("PARSING FAILED");
}

// --- rxfail ----------------------------------------------------------------

const RXFAIL_MODE_CHARS = "ahs"; // indexed by rxFailsafeChannelMode_e
const RX_FAILSAFE_MODE_SET = 2;
const RX_FAILSAFE_MODE_INVALID = 3;
// rxFailsafeModesTable: aux channels cannot be `a`uto.
const RXFAIL_MODES = [
    [0, 1, 2], // flight channels
    [RX_FAILSAFE_MODE_INVALID, 1, 2], // aux channels
];

function rxfailTables(manifest) {
    const cli = tables(manifest);
    const group = groupBySymbol(manifest, "rxFailsafeChannelConfigs_SystemArray");
    if (!group || cli.limits?.rxfailPulseMin === undefined) {
        throw new CliError("rxfail is not supported by this firmware's manifest");
    }
    return { L: cli.limits, group, count: repeatLayout(group).repeat.count };
}

function rxfailLine(L, channel, entry) {
    const mode = RXFAIL_MODE_CHARS[entry.mode] ?? "?";
    return entry.mode === RX_FAILSAFE_MODE_SET
        ? `rxfail ${channel} ${mode} ${L.rxfailPulseMin + 5 * entry.step}`
        : `rxfail ${channel} ${mode}`;
}

/** printRxFailsafe(): every channel, or in a diff every channel changed. */
export async function rxfailLines(manifest, io, onlyChanged) {
    const { L, group, count } = rxfailTables(manifest);
    const live = await readGroup(io, group);
    const defaults = onlyChanged ? await readDefaultGroup(io, group) : null;
    const stride = repeatLayout(group).repeat.stride;
    const lines = [];
    for (let ch = 0; ch < count; ch++) {
        const entry = readElement(live, group, ch);
        if (defaults && sameBytes(live, defaults, entry.base, stride)) continue;
        lines.push(rxfailLine(L, ch, entry));
    }
    return lines;
}

/** `rxfail [<channel> [a|h|s [<value>]]]`, as cliRxFailsafe. */
export async function rxfailCommand(manifest, io, argument) {
    const { L, group, count } = rxfailTables(manifest);
    if (!argument) {
        return (await rxfailLines(manifest, io, false)).join("\n");
    }
    const args = argument.split(/\s+/);
    const channel = atoi(args[0]) & 0xff;
    if (channel >= count) {
        throw new CliError(`CHANNEL NOT BETWEEN 0 AND ${count - 1}`);
    }

    const live = await readGroup(io, group);
    const entry = readElement(live, group, channel);
    if (args.length > 1) {
        const requested = RXFAIL_MODE_CHARS.indexOf(args[1][0]);
        const type = channel < L.controlChannelCount ? 0 : 1;
        const mode = requested < 0 ? RX_FAILSAFE_MODE_INVALID : RXFAIL_MODES[type][requested];
        if (mode === RX_FAILSAFE_MODE_INVALID) {
            throw new CliError("PARSING FAILED");
        }
        const requireValue = mode === RX_FAILSAFE_MODE_SET;
        if (args.length > 2) {
            if (!requireValue) {
                throw new CliError("PARSING FAILED");
            }
            const value = atoi(args[2]) & 0xffff;
            if (value < L.rxfailPulseMin || value > L.rxfailPulseMax) {
                throw new CliError(`value out of range: ${value}`);
            }
            entry.step = Math.min(Math.max(Math.trunc((value - L.rxfailPulseMin) / 5), 0), L.rxfailRangeMax);
        } else if (requireValue) {
            throw new CliError("INVALID ARGUMENT COUNT");
        }
        entry.mode = mode;
        await io.writeRange(group.pgn, entry.base, [...encodeElement(group, entry)]);
    }
    return rxfailLine(L, channel, entry);
}

// --- adjfunc ---------------------------------------------------------------

function adjfuncTables(manifest) {
    const cli = tables(manifest);
    const group = groupBySymbol(manifest, "adjustmentRanges_SystemArray");
    if (!group || cli.limits?.adjustmentFunctionCount === undefined || cli.aux_channel_count === undefined) {
        throw new CliError("adjfunc is not supported by this firmware's manifest");
    }
    return { L: cli.limits, auxCount: cli.aux_channel_count, group, count: repeatLayout(group).repeat.count };
}

function adjfuncLine(index, a) {
    const ch = stepToChannel;
    return (
        `adjfunc ${index} ${a.function} ${a.enaChannel} ${ch(a["enaRange.startStep"])} ${ch(a["enaRange.endStep"])} ` +
        `${a.adjChannel} ${ch(a["adjRange1.startStep"])} ${ch(a["adjRange1.endStep"])} ` +
        `${ch(a["adjRange2.startStep"])} ${ch(a["adjRange2.endStep"])} ${a.adjStep} ${a.adjMin} ${a.adjMax}`
    );
}

/** printAdjustmentRange(): every slot, or in a diff every slot changed. */
export async function adjfuncLines(manifest, io, onlyChanged) {
    const { group, count } = adjfuncTables(manifest);
    const live = await readGroup(io, group);
    const defaults = onlyChanged ? await readDefaultGroup(io, group) : null;
    const stride = repeatLayout(group).repeat.stride;
    const lines = [];
    for (let i = 0; i < count; i++) {
        const a = readElement(live, group, i);
        if (defaults && sameBytes(live, defaults, a.base, stride)) continue;
        lines.push(adjfuncLine(i, a));
    }
    return lines;
}

/**
 * `adjfunc <index> <function> <enaChannel> <enaStart> <enaEnd> <adjChannel>
 * <adj1Start> <adj1End> <adj2Start> <adj2End> <step> <min> <max>`.
 *
 * As cliAdjustmentRange: all twelve values must be valid, and if any is not
 * the slot is cleared -- not left alone -- before the error is reported.
 */
export async function adjfuncCommand(manifest, io, argument) {
    const { L, auxCount, group, count } = adjfuncTables(manifest);
    if (!argument) {
        return (await adjfuncLines(manifest, io, false)).join("\n");
    }
    const args = argument.split(/\s+/);
    const index = atoi(args[0]);
    if (index < 0 || index >= count) {
        throw new CliError(`INDEX NOT BETWEEN 0 AND ${count - 1}`);
    }

    const live = await readGroup(io, group);
    const a = readElement(live, group, index);
    let valid = 0;
    let at = 1;
    const next = () => args[at++];
    const range = (startKey, endKey) => {
        for (const key of [startKey, endKey]) {
            const text = next();
            if (text === undefined) continue;
            const step = channelToStep(atoi(text));
            if (step >= MIN_MODE_RANGE_STEP && step <= MAX_MODE_RANGE_STEP) {
                a[key] = step;
                valid++;
            }
        }
    };

    let text = next();
    if (text !== undefined) {
        const v = atoi(text);
        if (v >= 0 && v < L.adjustmentFunctionCount) {
            a.function = v;
            valid++;
        }
    }
    text = next();
    if (text !== undefined) {
        const v = atoi(text);
        if ((v >= 0 && v < auxCount) || v === 0xff) {
            a.enaChannel = v;
            valid++;
        }
    }
    range("enaRange.startStep", "enaRange.endStep");
    text = next();
    if (text !== undefined) {
        const v = atoi(text);
        if (v >= 0 && v < auxCount) {
            a.adjChannel = v;
            valid++;
        }
    }
    range("adjRange1.startStep", "adjRange1.endStep");
    range("adjRange2.startStep", "adjRange2.endStep");
    for (const key of ["adjStep", "adjMin", "adjMax"]) {
        text = next();
        if (text !== undefined) {
            a[key] = atoi(text);
            valid++;
        }
    }

    const { repeat } = repeatLayout(group);
    const base = repeat.off + index * repeat.stride;
    if (valid !== 12) {
        await io.writeRange(group.pgn, base, new Array(repeat.stride).fill(0));
        throw new CliError("INVALID ARGUMENT COUNT");
    }
    await io.writeRange(group.pgn, base, [...encodeElement(group, a)]);
    // Read back, so the echo shows the stored (truncated) step, min and max.
    return adjfuncLine(index, readElement(encodeElement(group, a), { ...group, fields: [{ ...repeat, off: 0 }] }, 0));
}

// --- beeper / beacon ---------------------------------------------------------

const BEEPERS = {
    beeper: { field: "beeper_off_flags", allowed: "beeperAllowedModes" },
    beacon: { field: "dshotBeaconOffFlags", allowed: "dshotBeaconAllowedModes" },
};

async function beeperState(manifest, io, command) {
    const cli = tables(manifest);
    const group = groupBySymbol(manifest, "beeperConfig_System");
    const L = cli.limits;
    if (!group || !cli.beepers || L?.beeperAll === undefined || (command === "beacon" && !L.dshotBeacon)) {
        throw new CliError(`${command} is not supported by this firmware's manifest`);
    }
    const spec = BEEPERS[command];
    const field = fieldNamed(group.fields, spec.field);
    const live = await readGroup(io, group);
    const defaults = await readDefaultGroup(io, group);
    return {
        group,
        field,
        L,
        allowed: L[spec.allowed],
        // beeperModeMaskForTableIndex(): 1 << (mode - 1), 0 for silence.
        entries: cli.beepers.map((b) => ({ name: b.name, mask: b.mode ? 2 ** (b.mode - 1) : 0 })),
        off: getInt(live, field.off, field.size, false),
        offDefault: defaults ? getInt(defaults, field.off, field.size, false) : null,
    };
}

/** printBeeper(): every allowed condition but ALL, as `-NAME` (off) or `NAME`. */
async function beeperBlock(manifest, io, command, onlyChanged) {
    const s = await beeperState(manifest, io, command);
    const lines = [];
    for (const { name, mask } of s.entries.slice(0, -1)) {
        if (!(mask & s.allowed)) continue;
        const equalsDefault = s.offDefault !== null && !((s.off ^ s.offDefault) & mask);
        if (onlyChanged && equalsDefault) continue;
        lines.push(`${command} ${s.off & mask ? "-" : ""}${name}`);
    }
    return lines;
}

export const beeperLines = (manifest, io, onlyChanged) => beeperBlock(manifest, io, "beeper", onlyChanged);
export const beaconLines = (manifest, io, onlyChanged) => beeperBlock(manifest, io, "beacon", onlyChanged);

/** processBeeperCommand(): list, `list`, or `[-]<name>` by prefix; ALL sets or clears every allowed bit. */
export async function beeperCommand(manifest, io, command, argument) {
    const s = await beeperState(manifest, io, command);
    const last = s.entries.length - 1;

    if (!argument) {
        const off = s.entries.slice(0, last).filter((e) => e.mask & s.off).map((e) => `  ${e.name}`);
        return `Disabled:${off.join("")}${s.off === 0 ? "  none" : ""}`;
    }
    if ("list".startsWith(argument.toLowerCase())) {
        return `Available:${s.entries.filter((e) => e.mask & s.allowed).map((e) => ` ${e.name}`).join("")}`;
    }

    const remove = argument.startsWith("-");
    const wanted = (remove ? argument.slice(1) : argument).toLowerCase();
    const allMask = 2 ** (s.L.beeperAll - 1);
    const index = s.entries.findIndex(
        (e) => e.name.toLowerCase().startsWith(wanted) && e.mask & (s.allowed | allMask),
    );
    if (index < 0) {
        throw new CliError("INVALID NAME");
    }
    const isAll = index === s.L.beeperAll - 1;
    const { mask, name } = s.entries[index];
    let off = s.off;
    if (remove) {
        off = isAll ? s.allowed : off | mask;
    } else {
        off = isAll ? 0 : off & ~mask;
    }
    const bytes = new Uint8Array(s.field.size);
    setInt(bytes, 0, s.field.size, off);
    await io.writeRange(s.group.pgn, s.field.off, [...bytes]);
    return `${remove ? "Disabled" : "Enabled"} ${name}`;
}

// --- led / color / mode_color --------------------------------------------------
//
// ledConfig_t is a uint64 bitfield (io/ledstrip.h); the text form is
// parseLedStripConfig() / generateLedConfig() in io/ledstrip.c. The code
// letters are the text format itself, so they are kept here verbatim.

const LED_DIRECTION_CODES = "NESWUD";
const LED_FUNCTION_CODES = "CFALSGR";
const LED_OVERLAY_CODES = "TOBVIWKD";
const LED = {
    pos: [0n, 8n], func: [8n, 4n], overlay: [12n, 8n], color: [20n, 4n], direction: [24n, 6n],
    pattern: [33n, 16n], pause: [49n, 4n], alt: [53n, 4n],
};
const u64 = (x) => BigInt.asUintN(64, x);
const ledGet = (cfg, [off, bits]) => Number((cfg >> off) & ((1n << bits) - 1n));
// An int shifted as C does it: 32-bit, then sign-extended into the uint64.
const movInt = (value, shift) => u64(BigInt((value << Number(shift)) | 0));
const movU64 = (value, shift) => u64(BigInt(value) << shift);

function ledTables(manifest) {
    const cli = tables(manifest);
    const group = groupBySymbol(manifest, "ledStripStatusModeConfig_System");
    if (!group || cli.limits?.hsvHueMax === undefined) {
        throw new CliError("led is not supported by this firmware's manifest");
    }
    const f = (name) => fieldNamed(group.fields, name);
    return {
        L: cli.limits,
        group,
        leds: f("ledConfigs"),
        colors: f("colors"),
        modeColors: f("modeColors"),
        special: f("specialColors.color"),
        aux: f("ledstrip_aux_channel"),
    };
}

function readLed(bytes, t, index) {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    return view.getBigUint64(t.leds.off + index * t.leds.elem_size, true);
}

/** generateLedConfig(). */
export function formatLed(cfg) {
    const pos = ledGet(cfg, LED.pos);
    let dirs = "";
    for (let d = 0; d < LED_DIRECTION_CODES.length; d++) {
        if ((ledGet(cfg, LED.direction) >> d) & 1) dirs += LED_DIRECTION_CODES[d];
    }
    let fn = LED_FUNCTION_CODES[ledGet(cfg, LED.func)] ?? "?";
    for (let o = 0; o < LED_OVERLAY_CODES.length; o++) {
        if ((ledGet(cfg, LED.overlay) >> o) & 1) fn += LED_OVERLAY_CODES[o];
    }
    return `${(pos >> 4) & 0xf},${pos & 0xf}:${dirs}:${fn}:${ledGet(cfg, LED.color)}:` +
        `${ledGet(cfg, LED.pattern)}:${ledGet(cfg, LED.pause)}:${ledGet(cfg, LED.alt)}`;
}

/**
 * parseLedStripConfig(), quirks included: a chunk that is not followed by its
 * separator reads as 0 -- so only the full eight-field form keeps the ring
 * colour and blink fields -- and nothing is masked before it is shifted in.
 * Returns null where the firmware returned false.
 */
export function parseLed(text) {
    const separators = [",", ":", ":", ":", ":", ":", ":", "\0"];
    const RING_COLORS = 4;
    const BLINK_PATTERN = 5;
    const input = `${text ?? ""}\0`;
    let at = 0;
    const chunks = [];
    for (let state = 0; state < separators.length; state++) {
        let chunk = "";
        while (input[at] !== "\0" && input[at] !== separators[state] && chunk.length < 10) {
            chunk += input[at++];
        }
        if (input[at] === separators[state]) {
            at++;
        } else {
            if (state < BLINK_PATTERN && state !== RING_COLORS && input[at] === "\0") return null;
            chunk = "0";
        }
        chunks.push(chunk);
    }

    const [xs, ys, dirs, fns, colorText, patternText, pauseText, altText] = chunks;
    let direction = 0;
    for (const ch of dirs) {
        const d = LED_DIRECTION_CODES.indexOf(ch);
        if (d >= 0) direction |= 1 << d;
    }
    let func = 0;
    let overlay = 0;
    for (const ch of fns) {
        const f = LED_FUNCTION_CODES.indexOf(ch);
        if (f >= 0) func = f;
        const o = LED_OVERLAY_CODES.indexOf(ch);
        if (o >= 0) overlay |= 1 << o;
    }
    let color = atoi(colorText);
    if (color >= 16) color = 0;
    const atoui = (t) => atoi(t) >>> 0;
    let alt = atoui(altText);
    if (alt >= 16) alt = 0;
    const xy = ((atoi(xs) & 0xf) << 4) | (atoi(ys) & 0xf);

    return u64(
        movInt(xy, LED.pos[0]) | movInt(color, LED.color[0]) | movInt(direction, LED.direction[0]) |
        movInt(func, LED.func[0]) | movInt(overlay, LED.overlay[0]) |
        movU64(atoui(patternText), LED.pattern[0]) | movU64(atoui(pauseText), LED.pause[0]) | movU64(alt, LED.alt[0]),
    );
}

async function ledBlocks(manifest, io, onlyChanged) {
    const t = ledTables(manifest);
    const live = await readGroup(io, t.group);
    const defaults = onlyChanged ? await readDefaultGroup(io, t.group) : null;
    const keep = (off, len) => !defaults || !sameBytes(live, defaults, off, len);

    const led = [];
    for (let i = 0; i < t.leds.count; i++) {
        if (keep(t.leds.off + i * t.leds.elem_size, t.leds.elem_size)) led.push(`led ${i} ${formatLed(readLed(live, t, i))}`);
    }
    const color = [];
    for (let i = 0; i < t.colors.count; i++) {
        const base = t.colors.off + i * t.colors.stride;
        if (!keep(base, t.colors.stride)) continue;
        color.push(`color ${i} ${getInt(live, base, 2, false)},${live[base + 2]},${live[base + 3]}`);
    }
    const mode = [];
    const perMode = t.modeColors.fields[0].count;
    for (let m = 0; m < t.modeColors.count; m++) {
        for (let d = 0; d < perMode; d++) {
            const at = t.modeColors.off + m * t.modeColors.stride + d;
            if (keep(at, 1)) mode.push(`mode_color ${m} ${d} ${live[at]}`);
        }
    }
    for (let j = 0; j < t.special.count; j++) {
        if (keep(t.special.off + j, 1)) mode.push(`mode_color ${t.L.ledSpecial} ${j} ${live[t.special.off + j]}`);
    }
    if (keep(t.aux.off, 1)) mode.push(`mode_color ${t.L.ledAuxChannel} 0 ${live[t.aux.off]}`);
    return { led, color, mode };
}

export const ledLines = async (manifest, io, onlyChanged) => (await ledBlocks(manifest, io, onlyChanged)).led;
export const colorLines = async (manifest, io, onlyChanged) => (await ledBlocks(manifest, io, onlyChanged)).color;
export const modeColorLines = async (manifest, io, onlyChanged) => (await ledBlocks(manifest, io, onlyChanged)).mode;

/** `led <index> <x>,<y>:<dirs>:<functions>:<color>:<pattern>:<pause>:<alt>`, as cliLed. */
export async function ledCommand(manifest, io, argument) {
    const t = ledTables(manifest);
    if (!argument) return (await ledLines(manifest, io, false)).join("\n");
    const index = atoi(argument);
    if (index < 0 || index >= t.leds.count) {
        throw new CliError(`INDEX NOT BETWEEN 0 AND ${t.leds.count - 1}`);
    }
    const space = argument.indexOf(" ");
    const cfg = parseLed(space < 0 ? "" : argument.slice(space).replace(/^ +/, ""));
    // parseLedStripConfig() cleared the LED before parsing, so a bad line leaves it empty.
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, cfg ?? 0n, true);
    await io.writeRange(t.group.pgn, t.leds.off + index * t.leds.elem_size, [...bytes]);
    if (cfg === null) throw new CliError("PARSING FAILED");
    return `led ${index} ${formatLed(cfg)}`;
}

/** `color <index> <h>,<s>,<v>`, as cliColor / parseColor(). */
export async function colorCommand(manifest, io, argument) {
    const t = ledTables(manifest);
    if (!argument) return (await colorLines(manifest, io, false)).join("\n");
    const index = atoi(argument);
    if (index < 0 || index >= t.colors.count) {
        throw new CliError(`INDEX NOT BETWEEN 0 AND ${t.colors.count - 1}`);
    }
    const space = argument.indexOf(" ");
    let rest = space < 0 ? "" : argument.slice(space).replace(/^ +/, "");
    const limits = [t.L.hsvHueMax, t.L.hsvSaturationMax, t.L.hsvValueMax];
    const hsv = [0, 0, 0];
    let ok = true;
    for (let c = 0; ok && c < 3; c++) {
        const val = atoi(rest);
        if (val > limits[c]) {
            ok = false;
            break;
        }
        hsv[c] = val;
        const comma = rest === null ? -1 : rest.indexOf(",");
        if (comma >= 0) {
            rest = rest.slice(comma + 1);
        } else {
            rest = null;
            if (c < 2) ok = false;
        }
    }
    const values = ok ? hsv : [0, 0, 0];
    const bytes = new Uint8Array(t.colors.stride);
    setInt(bytes, 0, 2, values[0]);
    bytes[2] = values[1] & 0xff;
    bytes[3] = values[2] & 0xff;
    await io.writeRange(t.group.pgn, t.colors.off + index * t.colors.stride, [...bytes]);
    if (!ok) throw new CliError("PARSING FAILED");
    return `color ${index} ${values[0] & 0xffff},${bytes[2]},${bytes[3]}`;
}

/** `mode_color <mode> <function> <color>`, as cliModeColor / setModeColor(). */
export async function modeColorCommand(manifest, io, argument) {
    const t = ledTables(manifest);
    if (!argument) return (await modeColorLines(manifest, io, false)).join("\n");
    const args = argument.split(/\s+/);
    if (args.length !== 3) throw new CliError("INVALID ARGUMENT COUNT");
    const [mode, fn, color] = args.map(atoi);
    const perMode = t.modeColors.fields[0].count;
    let at = -1;
    if (color >= 0 && color < t.colors.count) {
        const m = mode >>> 0; // ledModeIndex_e is unsigned
        if (m < t.modeColors.count) {
            if (fn >= 0 && fn < perMode) at = t.modeColors.off + m * t.modeColors.stride + fn;
        } else if (m === t.L.ledSpecial) {
            if (fn >= 0 && fn < t.special.count) at = t.special.off + fn;
        } else if (m === t.L.ledAuxChannel) {
            if (fn === 0) at = t.aux.off;
        }
    }
    if (at < 0) throw new CliError("PARSING FAILED");
    await io.writeRange(t.group.pgn, at, [color]);
    return `mode_color ${mode} ${fn} ${color}`;
}

// --- name ------------------------------------------------------------------

/** printName(): informational only -- the value itself is `set name`. */
export async function nameLines(manifest, io, onlyChanged) {
    const group = groupBySymbol(manifest, "pilotConfig_System");
    const field = group && fieldNamed(group.fields, "name");
    if (!field) return [];
    const bytes = await readGroup(io, group);
    let name = "";
    for (let i = field.off; i < field.off + field.count && bytes[i]; i++) {
        name += String.fromCharCode(bytes[i]);
    }
    if (onlyChanged && !name) return [];
    return ["", `# name: ${name || "-"}`];
}

/**
 * The blocks in the order printConfig() emitted them, each only if the
 * manifest can describe it.
 */
export const CONFIG_BLOCKS = [
    { heading: "feature", lines: featureLines, needs: ["featureConfig_System", "features"] },
    { heading: "serial", lines: serialLines, needs: ["serialConfig_System", "baud_rates", "serial_ports"] },
    { heading: "servo", lines: servoLines, needs: ["servoParams_SystemArray", "limits"] },
    { heading: "mixer input", lines: mixerInputLines, needs: ["mixerInputs_SystemArray", "mixer_inputs", "limits"] },
    { heading: "mixer rule", lines: mixerRuleLines, needs: ["mixerRules_SystemArray", "mixer_ops", "mixer_inputs", "mixer_outputs", "limits"] },
    { heading: "beeper", lines: beeperLines, needs: ["beeperConfig_System", "beepers", "limits"] },
    {
        heading: "beacon",
        lines: beaconLines,
        needs: ["beeperConfig_System", "beepers", "limits"],
        when: (cli) => Boolean(cli.limits?.dshotBeacon),
    },
    { heading: "map", lines: mapLines, needs: ["rxConfig_System", "rc_letters"] },
    { heading: "led", lines: ledLines, needs: ["ledStripStatusModeConfig_System", "limits"] },
    { heading: "color", lines: colorLines, needs: ["ledStripStatusModeConfig_System", "limits"] },
    { heading: "mode_color", lines: modeColorLines, needs: ["ledStripStatusModeConfig_System", "limits"] },
    { heading: "aux", lines: auxLines, needs: ["modeActivationConditions_SystemArray", "boxes", "aux_channel_count"] },
    { heading: "adjfunc", lines: adjfuncLines, needs: ["adjustmentRanges_SystemArray", "limits", "aux_channel_count"] },
    { heading: "rxfail", lines: rxfailLines, needs: ["rxFailsafeChannelConfigs_SystemArray", "limits"] },
];

export function blockSupported(manifest, block) {
    const [symbol, ...tableNames] = block.needs;
    return (
        Boolean(groupBySymbol(manifest, symbol)) &&
        tableNames.every((t) => tables(manifest)[t] !== undefined) &&
        (block.when?.(tables(manifest)) ?? true)
    );
}
