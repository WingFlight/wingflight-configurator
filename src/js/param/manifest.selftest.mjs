/**
 * Offline checks for the manifest model.
 *
 * The configurator has no test runner, and this logic decides where writes
 * land in a flight controller's configuration -- getting an offset wrong here
 * puts a value in the wrong field. So it is exercised against a real generated
 * manifest, alongside a stand-in for the firmware that repeats the same bounds
 * check msp_param.c does, so that an address this module is willing to produce
 * can be shown to be one the firmware would accept.
 *
 *   node src/js/param/manifest.selftest.mjs <manifest.json>
 */

import { readFileSync } from "node:fs";
import { Manifest, ManifestError, decodeValues, encodeValues, settingSpan, isProfiled } from "./manifest.js";

let failures = 0;
let checks = 0;

function check(what, condition, detail = "") {
    checks++;
    if (!condition) {
        failures++;
        console.error(`FAIL  ${what}${detail ? ` -- ${detail}` : ""}`);
    }
}

function throws(what, fn) {
    checks++;
    try {
        fn();
        failures++;
        console.error(`FAIL  ${what} -- expected it to be rejected, it was not`);
    } catch (error) {
        if (!(error instanceof ManifestError)) {
            failures++;
            console.error(`FAIL  ${what} -- threw ${error.constructor.name}, expected ManifestError`);
        }
    }
}

/**
 * What msp_param.c's pgFindChecked() does, in JS. A request this rejects is
 * one the firmware would answer with MSP_RESULT_ERROR.
 */
function firmwareWouldAccept(manifest, { pgn, offset, length }) {
    const group = manifest.group(pgn);
    if (!group) {
        return false;
    }
    return offset + length <= group.size;
}

const path = process.argv[2];
if (!path) {
    console.error("usage: node manifest.selftest.mjs <manifest.json>");
    process.exit(2);
}

const manifest = new Manifest(JSON.parse(readFileSync(path, "utf8")));

console.log(`manifest: target=${manifest.target} build=${manifest.buildId}`);
console.log(`groups=${manifest.groups.size} settings=${manifest.settings.size}`);

// --- every setting must produce an address the firmware would accept --------

let addressable = 0;
let repeated = 0;
for (const name of manifest.names()) {
    const setting = manifest.setting(name);
    const group = manifest.group(setting.pgn);
    if (!group) {
        check(`${name}: names a known group`, false, `pgn ${setting.pgn}`);
        continue;
    }

    // Only a profiled setting moves with the profile index. A master setting
    // in a repeated group (vbec_scale and friends) has its element baked into
    // its offset, and asking for "profile 3" of it is meaningless.
    const lastProfile = isProfiled(setting) ? group.length - 1 : 0;
    if (isProfiled(setting)) {
        repeated++;
    }

    for (const profile of new Set([0, lastProfile])) {
        let address;
        try {
            address = manifest.address(name, profile);
        } catch (error) {
            check(`${name}[profile ${profile}]: addressable`, false, error.message);
            continue;
        }
        check(
            `${name}[profile ${profile}]: firmware would accept`,
            firmwareWouldAccept(manifest, address),
            `pgn=${address.pgn} off=${address.offset} len=${address.length} groupSize=${group.size}`,
        );
        addressable++;
    }
}
console.log(`addressed ${addressable} setting/profile combinations (${repeated} settings live in repeated groups)`);

// --- profile indices out of range must be refused, not silently clamped ----

const profiled = manifest.names().find((n) => isProfiled(manifest.setting(n)));
if (profiled) {
    const group = manifest.group(manifest.setting(profiled).pgn);
    throws(`${profiled}: profile ${group.length} is out of range`, () => manifest.address(profiled, group.length));
    throws(`${profiled}: negative profile`, () => manifest.address(profiled, -1));

    // Consecutive profiles must be exactly one element apart, which is the
    // property that makes PG_ARRAY_ELEMENT_OFFSET arithmetic correct.
    const a = manifest.address(profiled, 0);
    const b = manifest.address(profiled, 1);
    check(
        `${profiled}: profile stride matches the group's element size`,
        b.offset - a.offset === group.elem_size,
        `got ${b.offset - a.offset}, expected ${group.elem_size}`,
    );
} else {
    console.warn("WARN  no setting lives in a repeated group; profile addressing was not exercised");
}

throws("unknown setting name", () => manifest.address("no_such_setting_exists"));

// A master setting whose group repeats must ignore the profile index entirely:
// its element is already in its offset. Getting this wrong addressed past the
// end of the voltage sensor group.
const masterInRepeated = manifest
    .names()
    .find((n) => !isProfiled(manifest.setting(n)) && (manifest.group(manifest.setting(n).pgn)?.length ?? 1) > 1);
if (masterInRepeated) {
    const a = manifest.address(masterInRepeated, 0);
    const b = manifest.address(masterInRepeated, 3);
    check(
        `${masterInRepeated}: a master setting does not move with the profile index`,
        a.offset === b.offset,
        `${a.offset} vs ${b.offset}`,
    );
} else {
    console.warn("WARN  no master setting in a repeated group; that path was not exercised");
}

// --- value codec round trip ------------------------------------------------

for (const [kind, size, samples] of [
    ["uint", 1, [0, 1, 255]],
    ["int", 1, [-128, -1, 0, 127]],
    ["uint", 2, [0, 1000, 65535]],
    ["int", 2, [-32768, -180, 0, 360, 32767]],
    ["uint", 4, [0, 4294967295]],
    ["int", 4, [-2147483648, -180, 0, 360, 2147483647]],
]) {
    const bytes = encodeValues(samples, kind, size);
    check(`${kind}${size * 8}: encodes to the right length`, bytes.length === samples.length * size);
    const view = new DataView(new Uint8Array(bytes).buffer);
    const back = decodeValues(view, 0, kind, size, samples.length);
    check(`${kind}${size * 8}: round trips`, JSON.stringify(back) === JSON.stringify(samples), `${back} vs ${samples}`);
}

// Out-of-range must be refused. Truncating instead is the exact bug that
// align_board_roll had in the firmware.
throws("int16 rejects 40000", () => encodeValues([40000], "int", 2));
throws("uint8 rejects -1", () => encodeValues([-1], "uint", 1));
throws("int32 rejects a non-integer", () => encodeValues([1.5], "int", 4));

// --- a real signed setting, end to end ------------------------------------

const align = manifest.setting("align_board_roll");
if (align) {
    check("align_board_roll is signed", align.kind === "int", `kind=${align.kind}`);
    check("align_board_roll is 4 bytes", align.size === 4, `size=${align.size}`);
    const view = new DataView(new Uint8Array(encodeValues([-10], align.kind, align.size)).buffer);
    check("align_board_roll survives -10", decodeValues(view, 0, align.kind, align.size, 1)[0] === -10);
} else {
    console.warn("WARN  align_board_roll not in this manifest");
}

// --- spans agree with the groups they live in ------------------------------

for (const name of manifest.names()) {
    const setting = manifest.setting(name);
    const { count, bytes } = settingSpan(setting);
    check(`${name}: span is positive`, bytes > 0 && count > 0, `count=${count} bytes=${bytes}`);
}

// --- registry cross-check --------------------------------------------------

const truthful = [...manifest.groups.values()].map((pg) => ({
    pgn: pg.pgn,
    version: pg.version,
    size: pg.size,
    length: pg.length,
}));
check("registry cross-check passes against itself", manifest.checkAgainstRegistry(truthful).length === 0);

const lying = truthful.map((g, i) => (i === 3 ? { ...g, size: g.size + 2 } : g));
check("registry cross-check catches a changed size", manifest.checkAgainstRegistry(lying).length === 1);
check("registry cross-check catches a missing group", manifest.checkAgainstRegistry(truthful.slice(1)).length === 1);

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
