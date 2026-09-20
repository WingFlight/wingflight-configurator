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
import { ParamCli, CliError, formatValue, parseValue, formatPin, resourceLines } from "./cli.js";

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
        live.set(name, JSON.parse(JSON.stringify(value)));
    }

    // Raw group bytes, so resource pins can be served the way a board would.
    const groups = new Map();
    for (const pg of manifest.raw.pgs) {
        groups.set(pg.pgn, new Uint8Array(pg.size));
    }

    return {
        identity: { target: "STM32F7X2", version: "4.6.0", revision: "abc1234" },
        saved: 0,
        groups,
        async readRange(pgn, offset, length) {
            const bytes = groups.get(pgn);
            if (!bytes || offset + length > bytes.length) {
                throw new Error(`out of range: pgn ${pgn} +${offset}`);
            }
            return new DataView(bytes.buffer, offset, length);
        },
        async read(name) {
            if (!live.has(name)) {
                throw new Error(`unknown ${name}`);
            }
            return live.get(name);
        },
        async readDefault(name) {
            return defaults.get(name);
        },
        async write(name, value) {
            live.set(name, value);
        },
        async save() {
            this.saved++;
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
check("dump emits a set line per setting", dumpSets.length === manifest.settings.size,
    `${dumpSets.length} vs ${manifest.settings.size}`);
check("diff emits only what changed", diffSets.length < dumpSets.length,
    `diff=${diffSets.length} dump=${dumpSets.length}`);
check("diff includes the settings just changed", diffSets.some((l) => l.includes(numeric.name)));

// Every emitted line must be re-executable -- that is what makes it a backup.
let replayed = 0;
for (const line of diffSets) {
    await cli.execute(line);
    replayed++;
}
check("every diff line replays through execute()", replayed === diffSets.length);

// And replaying a dump must reproduce the same dump.
const before = await cli.dump("all");
for (const line of before.split("\n").filter((l) => l.startsWith("set "))) {
    await cli.execute(line);
}
check("dump is idempotent when replayed", (await cli.dump("all")) === before);

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

await cli.execute("save");
check("save reaches the board", board.saved === 1);


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

console.log(`\n${checks - failures}/${checks} checks passed (resources included)`);
process.exit(failures ? 1 : 0);
