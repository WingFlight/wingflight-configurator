/**
 * Offline checks for the client-side CLI.
 *
 * The output of `dump` and `diff` is a file format: cli_backup.js writes it to
 * disk and replays it, and the presets repo ships snippets written against it.
 * So these checks are mostly about text, not just values -- a change that
 * silently reformats a line would invalidate everyone's backups.
 *
 * The board is a stand-in backed by the real manifest, so no hardware is
 * needed and every setting in the build is exercised.
 *
 *   node src/js/param/cli.selftest.mjs <manifest.json>
 */

import { readFileSync } from "node:fs";
import { Manifest, settingSpan } from "./manifest.js";
import { ParamCli, CliError, formatValue, parseValue, formatPin, resourceLines, timerLines, dmaLines } from "./cli.js";
import { parseLed, formatLed } from "./config_lines.js";

let checks = 0;
let failures = 0;

function check(what, condition, detail = "") {
    checks++;
    if (!condition) {
        failures++;
        console.error(`FAIL  ${what}${detail ? ` -- ${detail}` : ""}`);
    }
}

async function throwsAsync(what, fn) {
    checks++;
    try {
        await fn();
        failures++;
        console.error(`FAIL  ${what} -- expected rejection, got none`);
    } catch (error) {
        if (!(error instanceof CliError)) {
            failures++;
            console.error(`FAIL  ${what} -- threw ${error.constructor.name}, wanted CliError`);
        }
    }
}

const path = process.argv[2];
if (!path) {
    console.error("usage: node cli.selftest.mjs <manifest.json>");
    process.exit(2);
}

const manifest = new Manifest(JSON.parse(readFileSync(path, "utf8")));

const PROFILED = new Set(["profile", "rate_profile", "tv_profile"]);

/** Profiled settings are stored per profile, as the board's arrays are. */
function key(manifest, name, profileIndex = 0) {
    return PROFILED.has(manifest.setting(name)?.section) ? `${name}#${profileIndex}` : name;
}

/** How many profiles a section has on this build. */
function profileCount(section) {
    const setting = [...manifest.settings.values()].find((s) => s.section === section);
    return setting ? manifest.group(setting.pgn).length : 0;
}

function groupBySymbol(symbol) {
    return manifest.raw.pgs.find((pg) => pg.symbol === symbol);
}

/**
 * Give the table-shaped groups the defaults a real board resets them to, not
 * zeroes: an all-zero serial port has an MSP baud index the firmware's own
 * `serial` command rejected, so it would not be a fair test of replay.
 */
function seedDefaults(manifest, groups) {
    const serial = groupBySymbol("serialConfig_System");
    const ports = serial?.fields.find((f) => f.name === "portConfigs");
    if (ports && manifest.raw.cli?.serial_ports) {
        const bytes = groups.get(serial.pgn);
        const sub = Object.fromEntries(ports.fields.map((f) => [f.name, f.off]));
        manifest.raw.cli.serial_ports.forEach((identifier, i) => {
            const base = ports.off + i * ports.stride;
            bytes[base + sub.identifier] = identifier & 0xff;
            bytes[base + sub.msp_baudrateIndex] = 5; //        115200
            bytes[base + sub.gps_baudrateIndex] = 4; //         57600
            bytes[base + sub.telemetry_baudrateIndex] = 0; //   auto
            bytes[base + sub.blackbox_baudrateIndex] = 5; //   115200
        });
        // USB VCP carries MSP by default.
        bytes[ports.off + sub.functionMask] = 1;
    }
    const rx = groupBySymbol("rxConfig_System");
    const rcmap = rx?.fields.find((f) => f.name === "rcmap");
    if (rcmap) {
        groups.get(rx.pgn).set([0, 1, 3, 2, 4, 5, 6, 7], rcmap.off); // AETR1234
    }
    // One default mixer input and one default rule, so that deleting or
    // zeroing a default -- which the firmware's own dump lost -- is exercised.
    const inputs = groupBySymbol("mixerInputs_SystemArray");
    if (inputs) {
        const view = new DataView(groups.get(inputs.pgn).buffer);
        const at = inputs.fields[0].stride; // element 1, SR
        view.setInt16(at + 0, 500, true); //   rate
        view.setInt16(at + 2, -1000, true); // min
        view.setInt16(at + 4, 1000, true); //  max
    }
    const rules = groupBySymbol("mixerRules_SystemArray");
    if (rules) {
        const bytes = groups.get(rules.pgn);
        const view = new DataView(bytes.buffer);
        bytes.set([1, 1, 1], 0); //            set SR S1
        view.setInt16(6, 1000, true); //       weight
        view.setInt16(8, 1000, true); //       weightNeg
    }
}

/** pgResetFn_rxFailsafeChannelConfigs() and pgResetFn_servoParams(), for replay. */
function seedServoAndRxfailDefaults(groups) {
    const rxfail = groupBySymbol("rxFailsafeChannelConfigs_SystemArray");
    if (rxfail) {
        const bytes = groups.get(rxfail.pgn);
        const { stride, count } = rxfail.fields[0];
        for (let i = 0; i < count; i++) {
            bytes[i * stride] = i < 4 ? 0 : 1; //                auto / hold
            bytes[i * stride + 1] = i === 3 ? 2 : 125; //        885us / 1500us
        }
    }
    const servos = groupBySymbol("servoParams_SystemArray");
    if (servos) {
        const view = new DataView(groups.get(servos.pgn).buffer);
        const { stride, count } = servos.fields[0];
        for (let i = 0; i < count; i++) {
            const bus = i > 7;
            const at = i * stride;
            view.setUint16(at, 1500, true); //                   mid
            view.setInt16(at + 2, bus ? -500 : -700, true); //    min
            view.setInt16(at + 4, bus ? 500 : 700, true); //      max
            view.setUint16(at + 6, bus ? 1000 : 500, true); //    rneg
            view.setUint16(at + 8, bus ? 1000 : 500, true); //    rpos
            view.setUint16(at + 10, 50, true); //                 rate
        }
    }
}

/** No MSP reply or request carries more than this; big groups must be chunked. */
const MAX_TRANSFER = 160;

/** A board that stores whatever it is told, starting from its defaults. */
function fakeBoard(manifest) {
    const defaults = new Map();
    const live = new Map();

    for (const [name, setting] of manifest.settings) {
        const { count } = settingSpan(setting);
        let value;
        if (setting.mode === "string") {
            value = "";
        } else if (setting.mode === "bitset") {
            value = false;
        } else if (setting.mode === "array") {
            value = new Array(count).fill(0);
        } else {
            value = setting.min !== undefined && setting.min > 0 ? setting.min : 0;
        }
        defaults.set(name, value);
        const copies = PROFILED.has(setting.section) ? profileCount(setting.section) : 1;
        for (let i = 0; i < copies; i++) {
            live.set(key(manifest, name, i), JSON.parse(JSON.stringify(value)));
        }
    }

    // Raw group bytes, so resource pins can be served the way a board would.
    const groups = new Map();
    for (const pg of manifest.raw.pgs) {
        groups.set(pg.pgn, new Uint8Array(pg.size));
    }
    seedDefaults(manifest, groups);
    seedServoAndRxfailDefaults(groups);
    // What PG_DEFAULT would answer: the groups as they start out.
    const defaultGroups = new Map([...groups].map(([pgn, bytes]) => [pgn, bytes.slice()]));

    return {
        identity: { target: "STM32F7X2", version: "4.6.0", revision: "abc1234" },
        saved: 0,
        groups,
        async readRange(pgn, offset, length) {
            if (length > MAX_TRANSFER) {
                throw new Error(`read of ${length} bytes would not fit one MSP reply`);
            }
            const bytes = groups.get(pgn);
            if (!bytes || offset + length > bytes.length) {
                throw new Error(`out of range: pgn ${pgn} +${offset}`);
            }
            return new DataView(bytes.buffer, offset, length);
        },
        async readDefaultRange(pgn, offset, length) {
            if (length > MAX_TRANSFER) {
                throw new Error(`default read of ${length} bytes would not fit one MSP reply`);
            }
            return new DataView(defaultGroups.get(pgn).buffer, offset, length);
        },
        async read(name, profileIndex = 0) {
            const k = key(manifest, name, profileIndex);
            if (!live.has(k)) {
                throw new Error(`unknown ${k}`);
            }
            return live.get(k);
        },
        async readDefault(name) {
            return defaults.get(name);
        },
        async write(name, value, profileIndex = 0) {
            const k = key(manifest, name, profileIndex);
            if (!live.has(k)) {
                throw new Error(`unknown ${k}`);
            }
            live.set(k, value);
        },
        selected: [],
        async selectProfile(section, index) {
            this.selected.push(`${section} ${index}`);
        },
        async writeRange(pgn, offset, bytes) {
            if (bytes.length > MAX_TRANSFER) {
                throw new Error(`write of ${bytes.length} bytes would not fit one MSP request`);
            }
            const target = groups.get(pgn);
            if (!target || offset + bytes.length > target.length) {
                throw new Error(`out of range: pgn ${pgn}+${offset}`);
            }
            target.set(bytes, offset);
        },
        async save() {
            this.saved++;
        },
        async resetConfig() {
            this.reset = (this.reset ?? 0) + 1;
        },
        _live: live,
        _defaults: defaults,
    };
}

const board = fakeBoard(manifest);
const cli = new ParamCli(manifest, board);

console.log(`manifest: ${manifest.target}  settings=${manifest.settings.size}`);

// --- value formatting round trips ------------------------------------------

let roundTripped = 0;
let skippedStrings = 0;
for (const [name, setting] of manifest.settings) {
    if (setting.mode === "string") {
        // A string's text is its own representation; there is nothing to parse
        // back differently, so it is reported rather than silently skipped.
        skippedStrings++;
        continue;
    }
    const value = await board.read(name);
    const text = formatValue(setting, value);
    let back;
    try {
        back = parseValue(setting, text);
    } catch (error) {
        check(`${name}: formatted value re-parses`, false, `${text} -- ${error.message}`);
        continue;
    }
    if (JSON.stringify(back) !== JSON.stringify(value)) {
        check(`${name}: round trips`, false, `${JSON.stringify(value)} -> '${text}' -> ${JSON.stringify(back)}`);
    } else {
        roundTripped++;
    }
}
console.log(`round-tripped ${roundTripped} settings through format/parse (${skippedStrings} strings are self-representing)`);
check("every non-string setting round trips", roundTripped + skippedStrings === manifest.settings.size,
    `${roundTripped}+${skippedStrings} vs ${manifest.settings.size}`);

// --- get -------------------------------------------------------------------

const gyroGet = await cli.get("gyro_hardware_lpf");
check("get prints `name = value`", /^gyro_hardware_lpf = \w+/m.test(gyroGet), gyroGet.split("\n")[0]);
check("get prints the allowed values for a lookup", /Allowed values:/.test(gyroGet));

const substring = await cli.get("gyro_lpf1");
check("get matches on substring like the firmware did", substring.split("\n").filter((l) => l.includes("=")).length > 1);

await throwsAsync("get rejects an unknown name", () => cli.get("no_such_setting_here"));

// --- set -------------------------------------------------------------------

const numeric = [...manifest.settings.values()].find(
    (s) => s.mode === "direct" && s.kind === "uint" && s.size === 2 && s.max >= 50 && s.section === "master",
);
// The probe has to be inside the declared range *and* different from the
// default, or the diff check below would pass vacuously.
const numericDefault = await board.readDefault(numeric.name);
const low = numeric.min ?? 0;
const probe = numericDefault === low ? Math.min(numeric.max, low + 1) : low;
check(`probe for ${numeric.name} differs from its default`, probe !== numericDefault,
    `probe=${probe} default=${numericDefault}`);

await cli.set(`${numeric.name} = ${probe}`);
check(`set writes ${numeric.name}`, (await board.read(numeric.name)) === probe);

await throwsAsync("set refuses a value above the maximum", () =>
    cli.set(`${numeric.name} = ${numeric.max + 1}`),
);
await throwsAsync("set refuses a non-numeric value", () => cli.set(`${numeric.name} = banana`));
await throwsAsync("set refuses an unknown setting", () => cli.set("not_a_setting = 1"));
await throwsAsync("set refuses a malformed assignment", () => cli.set("just_a_name"));

const lookup = [...manifest.settings.values()].find((s) => s.mode === "lookup" && (s.values?.filter(Boolean).length ?? 0) > 1);
const label = lookup.values.filter(Boolean)[1];
await cli.set(`${lookup.name} = ${label}`);
check(`set accepts an enum label for ${lookup.name}`, formatValue(lookup, await board.read(lookup.name)) === label);
await throwsAsync("set refuses an invalid enum label", () => cli.set(`${lookup.name} = not_a_label`));

// --- dump / diff -----------------------------------------------------------

const dump = await cli.dump("all");
const diff = await cli.diff("all");

// This regex is the one cli_backup.js uses to decide a backup is trustworthy.
const BACKUP_BANNER = /^#\s*Wingflight\s*\//m;
check("dump carries the banner cli_backup.js requires", BACKUP_BANNER.test(dump));
check("diff carries the banner cli_backup.js requires", BACKUP_BANNER.test(diff));

for (const marker of ["batch start", "batch end", "defaults nosave", "save"]) {
    check(`dump contains '${marker}'`, dump.includes(marker));
    check(`diff contains '${marker}'`, diff.includes(marker));
}

const dumpSets = dump.split("\n").filter((l) => l.startsWith("set "));
const diffSets = diff.split("\n").filter((l) => l.startsWith("set "));
// `dump all` covers every profile, so a profiled setting appears once per
// profile -- the on-device CLI's cliDump*Profile() loops.
const expectedSets = [...manifest.settings.values()].reduce(
    (n, s) => n + (PROFILED.has(s.section) ? profileCount(s.section) : 1), 0);
check("dump all emits a set line per setting per profile", dumpSets.length === expectedSets,
    `${dumpSets.length} vs ${expectedSets}`);
check("diff emits only what changed", diffSets.length < dumpSets.length,
    `diff=${diffSets.length} dump=${dumpSets.length}`);
check("diff includes the settings just changed", diffSets.some((l) => l.includes(numeric.name)));

// Every emitted line must be re-executable, not just the `set` ones. An
// earlier version of this check only replayed lines starting with "set ",
// which is why it passed while `resource`, `timer`, `dma`, `batch` and
// `defaults` were all being rejected -- a backup that cannot be restored.
const replayable = diff
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

const rejected = [];
for (const line of replayable) {
    try {
        await cli.execute(line);
    } catch (error) {
        rejected.push(`${line} -> ${error.message}`);
    }
}
check("every line of a diff replays through execute()", rejected.length === 0,
    `${rejected.length} rejected: ${rejected.slice(0, 4).join(" | ")}`);
console.log(`replayed ${replayable.length} lines of a diff (${rejected.length} rejected)`);

// And replaying a dump must reproduce the same dump. The whole dump, not just
// its set lines: those alone would pour every profile into the selected one.
const before = await cli.dump("all");
for (const line of before.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))) {
    await cli.execute(line);
}
check("dump is idempotent when replayed", (await cli.dump("all")) === before);

// --- profiles --------------------------------------------------------------

const pidSetting = [...manifest.settings.values()].find(
    (s) => s.section === "profile" && s.mode === "direct" && s.kind === "uint" && (s.max ?? 0) > 10);
const rateSetting = [...manifest.settings.values()].find(
    (s) => s.section === "rate_profile" && s.mode === "direct" && s.kind === "uint" && (s.max ?? 0) > 10);
const pidCount = profileCount("profile");
check("this build has several pid profiles", pidCount > 2, `${pidCount}`);

{
    const b = fakeBoard(manifest);
    const c = new ParamCli(manifest, b);

    check("profile with no argument prints the selection", (await c.execute("profile")) === "profile 0");
    check("profile 2 selects profile 2", (await c.execute("profile 2")) === "profile 2");
    check("profile 2 switches the board live", b.selected.includes("profile 2"), b.selected.join(","));

    const pidValue = Math.min(pidSetting.max, (pidSetting.min ?? 0) + 7);
    await c.execute(`set ${pidSetting.name} = ${pidValue}`);
    check("set after profile 2 writes profile 2", (await b.read(pidSetting.name, 2)) === pidValue);
    check("set after profile 2 leaves profile 0 alone", (await b.read(pidSetting.name, 0)) !== pidValue);
    check("get after profile 2 reads profile 2", (await c.get(pidSetting.name)).includes(`= ${pidValue}`));

    await c.execute("rateprofile 1");
    const rateValue = Math.min(rateSetting.max, (rateSetting.min ?? 0) + 5);
    await c.execute(`set ${rateSetting.name} = ${rateValue}`);
    check("set after rateprofile 1 writes rate profile 1", (await b.read(rateSetting.name, 1)) === rateValue);

    await throwsAsync("profile refuses an index past the last profile", () => c.execute(`profile ${pidCount}`));
    await throwsAsync("profile refuses a non-number", () => c.execute("profile x"));

    await c.execute("profile 1");
    const allDiff = await c.diff("all");
    const lines = allDiff.split("\n");
    const block = lines.indexOf("profile 2");
    check("diff all opens a block for profile 2", block >= 0);
    check("diff all puts profile 2's change inside its block",
        lines.slice(block).find((l) => l.startsWith(`set ${pidSetting.name} `)) === `set ${pidSetting.name} = ${pidValue}`);
    check("diff all restores the selected pid profile",
        lines[lines.indexOf("# restore original profile selection") + 1] === "profile 1");
    check("diff all restores the selected rate profile",
        lines[lines.indexOf("# restore original rateprofile selection") + 1] === "rateprofile 1");

    // The regression that mattered: restore a backup onto a fresh board.
    const fresh = fakeBoard(manifest);
    const restore = new ParamCli(manifest, fresh);
    const refused = [];
    for (const line of lines.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))) {
        try {
            await restore.execute(line);
        } catch (error) {
            refused.push(`${line} -> ${error.message}`);
        }
    }
    check("a diff all restores without a rejected line", refused.length === 0, refused.slice(0, 3).join(" | "));
    check("restoring puts profile 2's value back in profile 2", (await fresh.read(pidSetting.name, 2)) === pidValue);
    check("restoring leaves profile 0 at its default", (await fresh.read(pidSetting.name, 0)) !== pidValue);
    check("restoring puts rate profile 1's value back", (await fresh.read(rateSetting.name, 1)) === rateValue);
    check("restoring ends on the original pid profile",
        fresh.selected.filter((x) => x.startsWith("profile ")).at(-1) === "profile 1", fresh.selected.join(","));

    // Without `all`, only the selected profile -- as on the on-device CLI.
    const plain = (await c.diff()).split("\n");
    check("plain diff covers only the selected pid profile",
        plain.includes("profile 1") && !plain.includes("profile 2"));
    check("dump profile emits the selected profile's block",
        (await c.dump("profile")).split("\n").includes("profile 1"));
    check("dump rates is accepted, as on the on-device CLI", (await c.dump("rates")).includes("rateprofile 1"));
}

{
    // The selection is read from the board, not assumed to be 0.
    const b = fakeBoard(manifest);
    const sys = manifest.group(18);
    const pidAt = sys.fields.find((f) => f.name === "pidProfileIndex").off;
    b.groups.get(18)[pidAt] = 3;
    const c = new ParamCli(manifest, b);
    check("profile reports the board's selection", (await c.execute("profile")) === "profile 3");
    const probeValue = Math.min(pidSetting.max, (pidSetting.min ?? 0) + 9);
    await c.execute(`set ${pidSetting.name} = ${probeValue}`);
    check("set lands in the board's selected profile", (await b.read(pidSetting.name, 3)) === probeValue);
}

// --- sections --------------------------------------------------------------

const masterOnly = await cli.dump("master");
check("dump master omits profile settings",
    !masterOnly.split("\n").some((l) => l.startsWith("set ") &&
        manifest.setting(l.slice(4).split(" ")[0])?.section !== "master"));
await throwsAsync("dump rejects an unknown section", () => cli.dump("nonsense"));

// --- execute ---------------------------------------------------------------

check("execute ignores comments", (await cli.execute("# a comment")) === "");
check("execute ignores blank lines", (await cli.execute("   ")) === "");
await throwsAsync("execute rejects an unknown command", () => cli.execute("frobnicate"));

const savesBefore = board.saved;
await cli.execute("save");
check("save reaches the board", board.saved === savesBefore + 1,
    `${savesBefore} -> ${board.saved}`);
check("replaying a diff reset to defaults first", (board.reset ?? 0) > 0);


// --- resources -------------------------------------------------------------

// ioTag packing: (portIdx + 1) << 4 | pin. A09 is port A, pin 9.
check("formatPin decodes A09", formatPin((0 + 1) << 4 | 9) === "A09", formatPin(0x19));
check("formatPin decodes B04", formatPin((1 + 1) << 4 | 4) === "B04", formatPin(0x24));
check("formatPin reports an unassigned pin", formatPin(0) === "NONE");

const resources = manifest.raw.resources ?? [];
check("manifest carries the resource table", resources.length > 0, `${resources.length} entries`);

// Plant the pins the real Vantac config assigns, then read them back the way
// a dump would: MOTOR 1 on A09, SERVO 1 on B04.
const motor = resources.find((r) => r.name === "MOTOR");
const servo = resources.find((r) => r.name === "SERVO");
if (motor && servo) {
    board.groups.get(motor.pgn)[motor.off] = 0x19; // A09
    board.groups.get(servo.pgn)[servo.off] = 0x24; // B04

    const lines = await resourceLines(manifest, board);
    check("resource line for MOTOR 1 matches the board config",
        lines.includes("resource MOTOR 1 A09"), lines.filter((l) => l.includes("MOTOR")).join(" | "));
    check("resource line for SERVO 1 matches the board config",
        lines.includes("resource SERVO 1 B04"), lines.filter((l) => l.includes("SERVO")).join(" | "));
    check("unassigned pins are omitted", !lines.some((l) => l.endsWith("NONE")));

    const withResources = await cli.dump("all");
    check("dump includes the resource block", withResources.includes("# resources"));
    check("dump includes the MOTOR resource line", withResources.includes("resource MOTOR 1 A09"));
} else {
    console.warn("WARN  no MOTOR/SERVO resource entries; resource formatting not exercised");
}

// --- timers ----------------------------------------------------------------

const timers = manifest.raw.timers ?? [];
check("manifest carries the timer hardware table", timers.length > 0, `${timers.length} entries`);

const timerGroup = [...manifest.groups.values()].find((pg) => pg.symbol === "timerIOConfig_SystemArray");
check("timerIOConfig group is present", Boolean(timerGroup));

if (timerGroup && timers.length) {
    // The real config has `timer A09 AF1`. A09 is tag 0x19; pick whichever
    // hardware index actually carries AF1 for that pin, as the firmware would.
    const tagA09 = ((0 + 1) << 4) | 9;
    const forA09 = timers.filter((t) => t.tag === tagA09);
    check("the timer table has entries for A09", forA09.length > 0, `${forA09.length}`);

    const wanted = forA09.findIndex((t) => t.af === 1);
    if (wanted >= 0) {
        const bytes = board.groups.get(timerGroup.pgn);
        bytes[0] = tagA09; // ioTag
        bytes[1] = wanted + 1; // index is 1-based

        const lines = await timerLines(manifest, board);
        check("timer line matches the board config", lines.includes("timer A09 AF1"), lines.slice(0, 3).join(" | "));

        // An unmapped index must read as NONE rather than inventing a function.
        bytes[1] = 0;
        const none = await timerLines(manifest, board);
        check("an unassigned timer reads as NONE", none.includes("timer A09 NONE"));

        bytes[1] = wanted + 1;
        const dumped = await cli.dump("all");
        check("dump includes the timer block", dumped.includes("# timer"));
        check("dump includes the timer line", dumped.includes("timer A09 AF1"));
    } else {
        console.warn("WARN  no AF1 entry for A09 in this build; timer formatting not fully exercised");
    }
}

// --- dma -------------------------------------------------------------------

const dmaopts = manifest.raw.dmaopts ?? [];
check("manifest carries the dmaopt table", dmaopts.length > 0, `${dmaopts.length} entries`);

const adc = dmaopts.find((d) => d.device === "ADC");
if (adc && timerGroup) {
    // The real config has `dma ADC 1 0` and `dma pin A02 0`.
    const adcBytes = board.groups.get(adc.pgn);
    adcBytes[adc.off] = 0; // option 0 on the first ADC

    const timerBytes = board.groups.get(timerGroup.pgn);
    const tagA02 = ((0 + 1) << 4) | 2;
    timerBytes[timerGroup.elem_size] = tagA02; // second slot's ioTag
    timerBytes[timerGroup.elem_size + 2] = 0; // its dmaopt

    const lines = await dmaLines(manifest, board);
    check("dma line for a peripheral matches the board config", lines.includes("dma ADC 1 0"),
        lines.filter((l) => l.includes("ADC")).join(" | "));
    check("dma line for a pin matches the board config", lines.includes("dma pin A02 0"),
        lines.filter((l) => l.includes("pin")).join(" | "));

    // -1 means unset and must be omitted, not printed.
    adcBytes[adc.off] = 0xff; // -1 as int8
    const without = await dmaLines(manifest, board);
    check("an unset dmaopt is omitted", !without.some((l) => l.startsWith("dma ADC 1")),
        without.filter((l) => l.includes("ADC")).join(" | "));

    adcBytes[adc.off] = 0;
    const dumped = await cli.dump("all");
    check("dump includes the dma block", dumped.includes("# dma"));
    check("dump includes the dma lines", dumped.includes("dma ADC 1 0") && dumped.includes("dma pin A02 0"));
} else {
    console.warn("WARN  no ADC dmaopt entry; dma formatting not exercised");
}

// --- feature / serial / map / aux ---------------------------------------------
//
// Expected lines follow the deleted cli.c: printFeature(), cliSerial(),
// parseRcChannels(), cliAux() and Wingflight's STEP_TO_CHANNEL_VALUE
// (1500 + 5 * step, not Betaflight's 900 + 25 * step).

{
    const b = fakeBoard(manifest);
    const c = new ParamCli(manifest, b);
    const cliTables = manifest.raw.cli;
    const bytesOf = (symbol) => b.groups.get(groupBySymbol(symbol).pgn);

    // feature
    check("feature enables by name", (await c.execute("feature GPS")) === "Enabled GPS");
    check("feature sets the GPS bit", (bytesOf("featureConfig_System")[0] & (1 << 7)) !== 0);
    check("feature matches a prefix, case-insensitively", (await c.execute("feature -gp")) === "Disabled GPS");
    check("feature -x clears the bit", (bytesOf("featureConfig_System")[0] & (1 << 7)) === 0);
    await throwsAsync("feature refuses an unknown name", () => c.execute("feature NOPE"));
    check("feature list names every feature",
        (await c.execute("feature list")) === `Available:${cliTables.features.map((f) => ` ${f.name}`).join("")}`);
    await c.execute("feature TELEMETRY");
    check("feature with no argument lists what is enabled", (await c.execute("feature")) === "Enabled: TELEMETRY ");

    // serial
    check("serial echoes the new port setup",
        (await c.execute("serial 1 64 115200 57600 0 230400")) === "serial 1 64 115200 57600 0 230400");
    const serialGroup = groupBySymbol("serialConfig_System");
    const ports = serialGroup.fields.find((f) => f.name === "portConfigs");
    const slot = cliTables.serial_ports.indexOf(1);
    const base = ports.off + slot * ports.stride;
    const sub = Object.fromEntries(ports.fields.map((f) => [f.name, f.off]));
    const serialBytes = bytesOf("serialConfig_System");
    check("serial stores the function mask", serialBytes[base + sub.functionMask] === 64);
    check("serial stores baud indices, not rates",
        serialBytes[base + sub.msp_baudrateIndex] === 5 && serialBytes[base + sub.blackbox_baudrateIndex] === 6);
    await throwsAsync("serial refuses a rate that is not in the table", () => c.execute("serial 1 64 115201 57600 0 115200"));
    await throwsAsync("serial refuses an MSP rate outside its range", () => c.execute("serial 1 64 2000000 57600 0 115200"));
    await throwsAsync("serial refuses a port the board does not have", () => c.execute("serial 99 64 115200 57600 0 115200"));
    await throwsAsync("serial refuses too few arguments", () => c.execute("serial 1 64"));

    // map
    check("map echoes the new order", (await c.execute("map TAER1234")) === "map TAER1234");
    check("map stores rcmap as parseRcChannels() did",
        JSON.stringify([...bytesOf("rxConfig_System").slice(0, 8)]) === JSON.stringify([1, 2, 3, 0, 4, 5, 6, 7]));
    check("map with no argument prints it", (await c.execute("map")) === "map TAER1234");
    await throwsAsync("map refuses a repeated letter", () => c.execute("map AAER1234"));
    await throwsAsync("map refuses the wrong length", () => c.execute("map AETR"));

    // aux
    check("aux with all six arguments",
        (await c.execute("aux 0 0 0 1700 2100 1 0")) === "aux 0 0 0 1700 2100 1 0");
    const auxGroup = groupBySymbol("modeActivationConditions_SystemArray");
    const auxBytes = bytesOf("modeActivationConditions_SystemArray");
    check("aux stores steps centred on 1500", auxBytes[4] === 40 && auxBytes[5] === 120);
    check("aux with four arguments defaults logic and link (backwards compatibility)",
        (await c.execute("aux 1 13 2 900 1300")) === "aux 1 13 2 900 1300 0 0");
    const perm3 = cliTables.boxes.find((x) => x.perm === 3);
    await c.execute("aux 3 3 1 1500 2000 0 0");
    check("aux stores the box id for a permanent id",
        auxBytes[3 * auxGroup.elem_size] === perm3.id, `${auxBytes[3 * auxGroup.elem_size]} vs ${perm3.id}`);
    check("aux clears a slot when too few arguments are valid",
        (await c.execute("aux 2 0 0 2200 2300")) === "aux 2 0 0 1500 1500 0 0");
    await throwsAsync("aux refuses an index past the last slot", () => c.execute("aux 20 0 0 1500 2000 0 0"));

    // dump and diff
    const dumped = (await c.dump()).split("\n");
    check("dump disables every feature before enabling some",
        cliTables.features.every((f) => dumped.includes(`feature -${f.name}`)) &&
            dumped.indexOf("feature TELEMETRY") > dumped.indexOf(`feature -${cliTables.features.at(-1).name}`));
    check("dump lists every serial port", dumped.filter((l) => l.startsWith("serial ")).length === cliTables.serial_ports.length);
    check("dump lists every aux slot", dumped.filter((l) => l.startsWith("aux ")).length === auxGroup.length);

    const diffed = (await c.diff("all")).split("\n");
    check("diff keeps only the enabled feature", diffed.filter((l) => l.startsWith("feature ")).join("|") === "feature TELEMETRY");
    check("diff keeps only the changed port", diffed.filter((l) => l.startsWith("serial ")).join("|") === "serial 1 64 115200 57600 0 230400");
    check("diff keeps the changed map", diffed.includes("map TAER1234"));
    check("diff keeps only changed aux slots",
        diffed.filter((l) => l.startsWith("aux ")).join("|") === "aux 0 0 0 1700 2100 1 0|aux 1 13 2 900 1300 0 0|aux 3 3 1 1500 2000 0 0",
        diffed.filter((l) => l.startsWith("aux ")).join("|"));

    // The point of all of it: a diff restores these groups exactly.
    const fresh = fakeBoard(manifest);
    const restore = new ParamCli(manifest, fresh);
    const refused = [];
    for (const line of diffed.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))) {
        try {
            await restore.execute(line);
        } catch (error) {
            refused.push(`${line} -> ${error.message}`);
        }
    }
    check("the diff replays without a rejected line", refused.length === 0, refused.slice(0, 3).join(" | "));
    for (const symbol of ["featureConfig_System", "serialConfig_System", "rxConfig_System", "modeActivationConditions_SystemArray"]) {
        const pgn = groupBySymbol(symbol).pgn;
        check(`restoring reproduces ${symbol} byte for byte`,
            JSON.stringify([...fresh.groups.get(pgn)]) === JSON.stringify([...b.groups.get(pgn)]));
    }
}

// --- mixer --------------------------------------------------------------------
//
// Formats and ranges from cliMixer() / printMixerInputs() / printMixerRules().
// mixerRules is 512 bytes, so every one of these also proves the reads and
// writes are chunked under MAX_TRANSFER.

{
    const b = fakeBoard(manifest);
    const c = new ParamCli(manifest, b);
    const rules = groupBySymbol("mixerRules_SystemArray");
    const inputs = groupBySymbol("mixerInputs_SystemArray");
    const ruleView = () => new DataView(b.groups.get(rules.pgn).buffer);
    const inputView = () => new DataView(b.groups.get(inputs.pgn).buffer);

    check("mixer rule lists the default rule",
        (await c.execute("mixer rule")) === "mixer rule 0 set SR S1 1000 0 1000 0 0 0 0", await c.execute("mixer rule"));
    check("mixer input lists inputs with a rate", (await c.execute("mixer input")) === "mixer input SR -1000 1000 500");

    // A rule with only the six required arguments: weightNeg mirrors weight.
    check("mixer rule sets a rule silently", (await c.execute("mixer rule 3 add CP S2 -500 100")) === "");
    check("mixer rule stores names as indices",
        b.groups.get(rules.pgn)[3 * 16] === 2 && b.groups.get(rules.pgn)[3 * 16 + 1] === 6 && b.groups.get(rules.pgn)[3 * 16 + 2] === 2);
    check("mixer rule mirrors weight into weightNeg when omitted", ruleView().getInt16(3 * 16 + 8, true) === -500);
    await c.execute("mixer rule 4 set ST M1 1000 0 800 120 2 3 1");
    check("mixer rule takes all eleven arguments",
        (await c.execute("mixer rule")).split("\n").includes("mixer rule 4 set ST M1 1000 0 800 120 2 3 1"));
    check("mixer rule accepts a numeric input", (await c.execute("mixer rule 5 set 1 1 10 0")) === "" &&
        b.groups.get(rules.pgn)[5 * 16 + 1] === 1);
    await throwsAsync("mixer rule refuses a weight out of range", () => c.execute("mixer rule 6 set SR S1 20000 0"));
    await throwsAsync("mixer rule refuses a role out of range", () => c.execute("mixer rule 6 set SR S1 10 0 10 0 0 0 9"));
    await throwsAsync("mixer rule refuses an index past the table", () => c.execute("mixer rule 32 set SR S1 10 0"));
    await throwsAsync("mixer rule refuses a bad argument count", () => c.execute("mixer rule 6 set SR S1"));

    await c.execute("mixer rule 0 del");
    check("mixer rule del clears the rule", ruleView().getUint8(0) === 0 && ruleView().getInt16(6, true) === 0);

    check("mixer input sets min, max and rate", (await c.execute("mixer input CR -500 500 250")) === "");
    check("mixer input stores it", inputView().getInt16(5 * 6, true) === 250 && inputView().getInt16(5 * 6 + 2, true) === -500);
    await throwsAsync("mixer input refuses min above max", () => c.execute("mixer input CR 500 -500 250"));
    await throwsAsync("mixer input refuses input 0", () => c.execute("mixer input - 0 0 1"));
    await c.execute("mixer rate SR 0");
    check("mixer rate changes only the rate",
        inputView().getInt16(6, true) === 0 && inputView().getInt16(6 + 2, true) === -1000);
    await c.execute("mixer limit CR -400 400");
    check("mixer limit changes only min and max",
        (await c.execute("mixer limit")) === "mixer limit CR -400 400" && inputView().getInt16(5 * 6, true) === 250);

    const diffed = (await c.diff("all")).split("\n");
    const mixerLines = diffed.filter((l) => l.startsWith("mixer "));
    check("diff deletes the default rule that was removed", mixerLines.includes("mixer rule 0 del"), mixerLines.join(" | "));
    check("diff zeroes the default input whose rate was cleared", mixerLines.includes("mixer input SR -1000 1000 0"),
        mixerLines.join(" | "));
    check("diff carries the new rules", mixerLines.includes("mixer rule 3 add CP S2 -500 100 -500 0 0 0 0"));
    check("diff orders inputs before rules",
        diffed.indexOf("# mixer input") < diffed.indexOf("# mixer rule") && diffed.indexOf("# mixer input") > 0);

    const fresh = fakeBoard(manifest);
    const restore = new ParamCli(manifest, fresh);
    const refused = [];
    for (const line of diffed.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))) {
        try {
            await restore.execute(line);
        } catch (error) {
            refused.push(`${line} -> ${error.message}`);
        }
    }
    check("a mixer diff replays without a rejected line", refused.length === 0, refused.slice(0, 3).join(" | "));
    for (const group of [inputs, rules]) {
        check(`restoring reproduces ${group.symbol} byte for byte`,
            JSON.stringify([...fresh.groups.get(group.pgn)]) === JSON.stringify([...b.groups.get(group.pgn)]));
    }

    await c.execute("mixer reset");
    check("mixer reset restores the default rule", ruleView().getUint8(0) === 1 && ruleView().getUint8(3 * 16) === 0);
    check("mixer reset restores the default input", inputView().getInt16(6, true) === 500);
    await throwsAsync("mixer curve is refused rather than ignored", () => c.execute("mixer curve"));
}

// --- servo / rxfail / adjfunc ---------------------------------------------------
//
// As cliServo(), cliRxFailsafe() and cliAdjustmentRange().

{
    const b = fakeBoard(manifest);
    const c = new ParamCli(manifest, b);
    const servoConfig = groupBySymbol("servoConfig_System");
    const tags = servoConfig.fields.find((f) => f.name === "ioTags");
    b.groups.get(servoConfig.pgn).set([0x19, 0x1a], tags.off); // two PWM servos on A09, A10

    // servo
    check("servo lists the PWM servos in use",
        (await c.execute("servo")) === "# PWM Servos\nservo 1 1500 -700 700 500 500 50 0 0\nservo 2 1500 -700 700 500 500 50 0 0",
        await c.execute("servo"));
    check("servo sets all nine values",
        (await c.execute("servo 2 1520 -600 600 400 450 100 10 1")) === "servo 2 1520 -600 600 400 450 100 10 1");
    await throwsAsync("servo refuses a mid below the pulse minimum", () => c.execute("servo 2 20 -600 600 400 450 100 10 1"));
    await throwsAsync("servo refuses min above max", () => c.execute("servo 2 1500 600 -600 400 450 100 10 1"));
    await throwsAsync("servo refuses unknown flags", () => c.execute("servo 2 1500 -600 600 400 450 100 10 4"));
    await throwsAsync("servo refuses a short line", () => c.execute("servo 2 1500"));
    check("servo flags toggles by name", (await c.execute("servo flags 2 +GEO")) === "servo flags 2 +REV +GEO");
    check("servo flags lists every PWM servo",
        (await c.execute("servo flags")) === "servo flags 1 -REV -GEO\nservo flags 2 +REV +GEO");
    await throwsAsync("servo flags refuses a bad flag", () => c.execute("servo flags 2 +FOO"));
    await throwsAsync("servo override is refused rather than ignored", () => c.execute("servo override 1 0"));

    const busPort = manifest.raw.cli.serial_ports.find((id) => id >= 0 && id < 20);
    await c.execute(`serial ${busPort} ${manifest.raw.cli.limits.busServoFunctionMask & -manifest.raw.cli.limits.busServoFunctionMask} 115200 57600 0 115200`);
    const withBus = (await c.execute("servo")).split("\n");
    check("servo lists the bus servos once SBUS out is on a port",
        withBus.includes("servo 9 1500 -500 500 1000 1000 50 0 0") && withBus.at(-1).startsWith("servo 26 "));

    // rxfail
    check("rxfail sets a value on a flight channel", (await c.execute("rxfail 3 s 1000")) === "rxfail 3 s 1000");
    check("rxfail quantises to 5us steps", (await c.execute("rxfail 2 s 1002")) === "rxfail 2 s 1000");
    check("rxfail with only a channel reports it", (await c.execute("rxfail 0")) === "rxfail 0 a");
    check("rxfail holds an aux channel", (await c.execute("rxfail 6 h")) === "rxfail 6 h");
    await throwsAsync("rxfail refuses auto on an aux channel", () => c.execute("rxfail 5 a"));
    await throwsAsync("rxfail refuses a value for hold", () => c.execute("rxfail 5 h 1500"));
    await throwsAsync("rxfail refuses set without a value", () => c.execute("rxfail 5 s"));
    await throwsAsync("rxfail refuses a value out of range", () => c.execute("rxfail 2 s 3000"));
    await throwsAsync("rxfail refuses a channel past the last", () => c.execute("rxfail 18"));
    check("rxfail lists every channel", (await c.execute("rxfail")).split("\n").length === 18);

    // adjfunc
    const adj = "adjfunc 0 5 0 1300 1700 1 900 1400 1600 2100 5 -100 100";
    check("adjfunc sets all twelve values", (await c.execute(adj)) === adj);
    check("adjfunc accepts 255 as the enable channel",
        (await c.execute("adjfunc 1 5 255 1300 1700 1 900 1400 1600 2100 5 -100 100")).startsWith("adjfunc 1 5 255 "));
    await throwsAsync("adjfunc refuses a short line", () => c.execute("adjfunc 1 5 0 1300"));
    const adjGroup = groupBySymbol("adjustmentRanges_SystemArray");
    const slot1 = [...b.groups.get(adjGroup.pgn).slice(adjGroup.elem_size, 2 * adjGroup.elem_size)];
    check("adjfunc clears the slot when the line is short, as the firmware did", slot1.every((x) => x === 0));
    await throwsAsync("adjfunc refuses a function past the last", () =>
        c.execute("adjfunc 1 200 0 1300 1700 1 900 1400 1600 2100 5 -100 100"));
    await throwsAsync("adjfunc refuses an index past the last slot", () => c.execute(`adjfunc ${adjGroup.length} 0`));
    check("adjfunc echoes the step as stored (uint8)",
        (await c.execute("adjfunc 2 5 0 1300 1700 1 900 1400 1600 2100 300 -100 100")).split(" ")[11] === "44");

    // diff and restore
    const diffed = (await c.diff("all")).split("\n");
    check("diff carries the changed servo", diffed.includes("servo 2 1520 -600 600 400 450 100 10 3"));
    check("diff carries only changed rxfail channels",
        diffed.filter((l) => l.startsWith("rxfail ")).join("|") === "rxfail 2 s 1000|rxfail 3 s 1000",
        diffed.filter((l) => l.startsWith("rxfail ")).join("|"));
    check("diff carries the adjfunc slots", diffed.includes(adj) && diffed.some((l) => l.startsWith("adjfunc 2 ")));

    const fresh = fakeBoard(manifest);
    const restore = new ParamCli(manifest, fresh);
    const refused = [];
    for (const line of diffed.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))) {
        try {
            await restore.execute(line);
        } catch (error) {
            refused.push(`${line} -> ${error.message}`);
        }
    }
    check("the diff replays without a rejected line", refused.length === 0, refused.slice(0, 3).join(" | "));
    for (const symbol of ["servoParams_SystemArray", "rxFailsafeChannelConfigs_SystemArray", "adjustmentRanges_SystemArray"]) {
        const pgn = groupBySymbol(symbol).pgn;
        check(`restoring reproduces ${symbol} byte for byte`,
            JSON.stringify([...fresh.groups.get(pgn)]) === JSON.stringify([...b.groups.get(pgn)]));
    }
}

// --- beeper / beacon / led / color / mode_color -------------------------------

// Goldens from the firmware's own parseLedStripConfig() and generateLedConfig()
// (io/ledstrip.c), compiled on the host and fed these lines. They pin the
// quirks: a short line zeroes the ring colour, nothing is masked before it is
// shifted, a negative colour sign-extends, and an overlong chunk shifts every
// later field.
const LED_GOLDENS = [
    ["1,2:NE:CT:3:0:0:0", "0000000003301012", "1,2:NE:CT:3:0:0:0"],
    ["15,15:NESWUD:RTOBVIWKD:15:65535:15:15", "01fffffe3ffff6ff", "15,15:NESWUD:RTOBVIWKD:15:65535:15:15"],
    ["0,0:N:C:5", "0000000001000000", "0,0:N:C:0:0:0:0"],
    ["3,4:S:L", null, null],
    ["3,4:S:L:", "0000000004000334", "3,4:S:L:0:0:0:0"],
    ["20,1:X:Z:99:70000:3:20", "000622e000000041", "4,1::C:0:4464:3:0"],
    ["-1,0:N:C:-1:0:0:0", "fffffffffff000f0", "15,0:NESWUD:C:15:65535:15:15"],
    ["", null, null],
    ["1,2:NE:CTTTTTTTTTTTTTTT:3:0:0:0", "0000000603000012", "1,2:NE:C:0:3:0:0"],
    ["7,9:UD:GW:12:4660:9:11", "0172246830c20579", "7,9:UD:GW:12:4660:9:11"],
];
for (const [text, hex, formatted] of LED_GOLDENS) {
    const cfg = parseLed(text);
    if (hex === null) {
        check(`led '${text}' is refused, as the firmware refused it`, cfg === null);
        continue;
    }
    check(`led '${text}' packs as the firmware packed it`, cfg?.toString(16).padStart(16, "0") === hex,
        cfg?.toString(16));
    check(`led '${text}' prints as the firmware printed it`, formatLed(cfg) === formatted, formatLed(cfg ?? 0n));
}

{
    const b = fakeBoard(manifest);
    const c = new ParamCli(manifest, b);
    const L = manifest.raw.cli.limits;
    const beepers = manifest.raw.cli.beepers;

    // beeper
    check("beeper with nothing disabled", (await c.execute("beeper")) === "Disabled:  none");
    check("beeper disables by prefix", (await c.execute("beeper -bat_c")) === "Disabled BAT_CRIT_LOW");
    check("beeper lists what is off", (await c.execute("beeper")) === "Disabled:  BAT_CRIT_LOW");
    check("beeper -ALL turns off every allowed condition", (await c.execute("beeper -ALL")) === "Disabled ALL");
    const beeperGroup = groupBySymbol("beeperConfig_System");
    const offAt = beeperGroup.fields.find((f) => f.name === "beeper_off_flags").off;
    check("beeper -ALL stores the allowed mask",
        new DataView(b.groups.get(beeperGroup.pgn).buffer).getUint32(offAt, true) === L.beeperAllowedModes);
    check("beeper ALL turns them all back on", (await c.execute("beeper ALL")) === "Enabled ALL" &&
        new DataView(b.groups.get(beeperGroup.pgn).buffer).getUint32(offAt, true) === 0);
    await throwsAsync("beeper refuses an unknown condition", () => c.execute("beeper NOPE"));
    check("beeper list omits ALL", !(await c.execute("beeper list")).includes(" ALL"));
    await c.execute("beeper -RX_LOST");
    if (L.dshotBeacon) {
        check("beacon only offers its own conditions", (await c.execute("beacon list")) === "Available: RX_LOST RX_SET");
        await throwsAsync("beacon refuses a beeper-only condition", () => c.execute("beacon -BAT_LOW"));
        check("beacon disables RX_SET", (await c.execute("beacon -RX_SET")) === "Disabled RX_SET");
    }
    const dumped = (await c.dump()).split("\n");
    const allowedCount = beepers.slice(0, -1).filter((x) => x.mode && 2 ** (x.mode - 1) & L.beeperAllowedModes).length;
    check("dump lists every allowed beeper condition", dumped.filter((l) => l.startsWith("beeper ")).length === allowedCount);

    // led / color / mode_color
    check("led sets and echoes", (await c.execute("led 3 1,2:NE:CT:3:0:0:0")) === "led 3 1,2:NE:CT:3:0:0:0");
    await c.execute("led 4 7,9:UD:GW:12:4660:9:11");
    await throwsAsync("led refuses a short line", () => c.execute("led 5 3,4:S:L"));
    await throwsAsync("led refuses an index past the strip", () => c.execute("led 32 1,2:N:C:0:0:0:0"));
    check("color sets and echoes", (await c.execute("color 2 200,128,64")) === "color 2 200,128,64");
    await throwsAsync("color refuses a hue above 359", () => c.execute("color 2 360,0,0"));
    const ledGroup = groupBySymbol("ledStripStatusModeConfig_System");
    const colorsField = ledGroup.fields.find((f) => f.name === "colors");
    check("a refused color is cleared, as parseColor() did",
        [...b.groups.get(ledGroup.pgn).slice(colorsField.off + 2 * 4, colorsField.off + 3 * 4)].every((x) => x === 0));
    await c.execute("color 2 200,128,64");
    await throwsAsync("color refuses two components", () => c.execute("color 3 10,20"));
    check("mode_color sets a mode colour", (await c.execute("mode_color 1 2 7")) === "mode_color 1 2 7");
    check("mode_color sets a special colour", (await c.execute(`mode_color ${L.ledSpecial} 3 9`)) === `mode_color ${L.ledSpecial} 3 9`);
    check("mode_color sets the aux channel", (await c.execute(`mode_color ${L.ledAuxChannel} 0 5`)) === `mode_color ${L.ledAuxChannel} 0 5`);
    await throwsAsync("mode_color refuses a colour past the palette", () => c.execute("mode_color 1 2 16"));
    await throwsAsync("mode_color refuses a second aux slot", () => c.execute(`mode_color ${L.ledAuxChannel} 1 5`));
    await throwsAsync("mode_color refuses the wrong argument count", () => c.execute("mode_color 1 2"));

    const diffed = (await c.diff("all")).split("\n");
    check("diff carries changed beeper conditions", diffed.includes("beeper -RX_LOST"));
    check("diff carries changed leds only",
        diffed.filter((l) => l.startsWith("led ")).join("|") === "led 3 1,2:NE:CT:3:0:0:0|led 4 7,9:UD:GW:12:4660:9:11",
        diffed.filter((l) => l.startsWith("led ")).join("|"));
    check("diff carries the changed colour", diffed.filter((l) => l.startsWith("color ")).join("|") === "color 2 200,128,64");
    check("diff carries the mode colours",
        diffed.filter((l) => l.startsWith("mode_color ")).length === 3);
    // printConfig()'s order, for the blocks this diff has.
    const ORDER = ["feature", "serial", "servo", "mixer input", "mixer rule", "beeper", "beacon", "map",
        "led", "color", "mode_color", "aux", "adjfunc", "rxfail"];
    const headings = diffed.filter((l) => ORDER.includes(l.slice(2)) && l.startsWith("# ")).map((l) => l.slice(2));
    check("blocks come in the firmware's dump order",
        headings.length >= 4 && headings.every((h, i) => i === 0 || ORDER.indexOf(h) > ORDER.indexOf(headings[i - 1])),
        headings.join(", "));

    const fresh = fakeBoard(manifest);
    const restore = new ParamCli(manifest, fresh);
    const refused = [];
    for (const line of diffed.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))) {
        try {
            await restore.execute(line);
        } catch (error) {
            refused.push(`${line} -> ${error.message}`);
        }
    }
    check("the diff replays without a rejected line", refused.length === 0, refused.slice(0, 3).join(" | "));
    for (const group of [beeperGroup, ledGroup]) {
        check(`restoring reproduces ${group.symbol} byte for byte`,
            JSON.stringify([...fresh.groups.get(group.pgn)]) === JSON.stringify([...b.groups.get(group.pgn)]));
    }
}

console.log(`\n${checks - failures}/${checks} checks passed (resources, timers and dma included)`);
process.exit(failures ? 1 : 0);
