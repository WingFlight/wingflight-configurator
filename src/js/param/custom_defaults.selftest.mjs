/**
 * Offline checks for the custom defaults compiler.
 *
 * The one property that matters: replaying a config through the CLI on a
 * board, and applying the compiled records to that board's reset, must leave
 * the same bytes -- for any reset values, since the compiler never sees the
 * board's. So the board here starts from random bytes (bar the reset values
 * the compiler is allowed to know), several times over.
 *
 *   node src/js/param/custom_defaults.selftest.mjs <manifest.json>
 */

import { readFileSync } from "node:fs";
import { Manifest } from "./manifest.js";
import { ParamCli, formatPin } from "./cli.js";
import {
    ImageBoard,
    compileCustomDefaults,
    encodeCustomDefaults,
    decodeCustomDefaults,
    applyCustomDefaults,
    knownResetBytes,
    crc16ccitt,
} from "./custom_defaults.js";

let checks = 0;
let failures = 0;

function check(what, condition, detail = "") {
    checks++;
    if (!condition) {
        failures++;
        console.error(`FAIL  ${what}${detail ? ` -- ${detail}` : ""}`);
    }
}

const path = process.argv[2];
if (!path) {
    console.error("usage: node custom_defaults.selftest.mjs <manifest.json>");
    process.exit(2);
}
const raw = JSON.parse(readFileSync(path, "utf8"));
const manifest = new Manifest(raw);

// --- the format, against the firmware's unit test --------------------------------

// src/test/unit/custom_defaults_unittest.cc, SHARED_VECTOR.
const SHARED_VECTOR = [
    0x57, 0x46, 0x43, 0x44, 0x01, 0x00, 0x15, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
    0x07, 0x08, 0x30, 0xe1, 0x00, 0x00, 0xfd, 0x0f, 0x00, 0x00, 0x01, 0x00, 0x2a, 0xfd,
    0x0f, 0x03, 0x00, 0x04, 0x01, 0x01, 0x00, 0x00, 0x80, 0x01, 0x00, 0x00, 0x80,
];
const PG_RESERVED_FOR_TESTING_3 = 4093;
const sharedRecords = [
    { pgn: PG_RESERVED_FOR_TESTING_3, offset: 0, data: [0x2a] },
    { pgn: PG_RESERVED_FOR_TESTING_3, offset: 3, data: [0x01, 0, 0, 0x80], mask: [0x01, 0, 0, 0x80] },
];
const encoded = encodeCustomDefaults("0102030405060708", sharedRecords);
check("encodes the firmware's shared vector", [...encoded].join() === SHARED_VECTOR.join(), [...encoded].join());
check("CRC16-CCITT check value", crc16ccitt(0, [..."123456789"].map((c) => c.charCodeAt(0))) === 0x31c3);

const decoded = decodeCustomDefaults(encoded);
check("decodes what it encodes", JSON.stringify(decoded.records) === JSON.stringify(sharedRecords));
check("carries the build ID", decoded.buildId === "0102030405060708");

const bytes = new Uint8Array([0x10, 0x11, 0x12, 0x12, 0x14, 0x15, 0x16, 0x17]);
applyCustomDefaults(sharedRecords, new Map([[PG_RESERVED_FOR_TESTING_3, bytes]]));
check("applies as the firmware does", [...bytes].join() === [0x2a, 0x11, 0x12, 0x13, 0x14, 0x15, 0x96, 0x17].join());

// --- a config that exercises every kind of line -----------------------------------

function settingWhere(predicate) {
    return [...manifest.settings.values()].find(predicate);
}

const direct = settingWhere((s) => s.mode === "direct" && s.section === "master" && s.max > s.min + 1);
const lookup = settingWhere((s) => s.mode === "lookup" && s.section === "master" && s.values?.length > 1);
const bitset = settingWhere((s) => s.mode === "bitset" && s.section === "master");
const string = settingWhere((s) => s.mode === "string" && s.section === "master");
const profiled = settingWhere((s) => s.mode === "direct" && s.section === "profile" && s.max > s.min + 1);
const timerPins = [...new Map(raw.timers.map((t) => [t.tag, t])).values()].slice(0, 2);
const feature = raw.cli.features.find((f) => f.name === "TELEMETRY") ?? raw.cli.features[1];
const unfeature = raw.cli.features[0];
const beeper = raw.cli.beepers[1];
const dmaDevice = raw.dmaopts[0];

const config = [
    "# Betaflight / STM32F7X2 (S7X2) 4.4.0 -- the kind of header target configs carry",
    "#define USE_GYRO",
    "",
    "board_name SELFTEST",
    "manufacturer_id TEST",
    "",
    "resource MOTOR 1 B00",
    "resource MOTOR 2 B01",
    "resource MOTOR 9 A00",
    `timer ${formatPin(timerPins[0].tag)} AF${timerPins[0].af}`,
    `timer ${formatPin(timerPins[1].tag)} AF${timerPins[1].af}`,
    `dma pin ${formatPin(timerPins[0].tag)} 0`,
    `dma ${dmaDevice.device} 1 0`,
    `feature ${feature.name}`,
    `feature -${unfeature.name}`,
    "serial 0 64 115200 57600 0 115200",
    `set ${direct.name} = ${direct.min + 1}`,
    `set ${lookup.name} = ${lookup.values[1]}`,
    `set ${bitset.name} = ON`,
    `set ${string.name} = ABC`,
    "set not_a_setting_here = 1",
    "map TAER1234",
    "aux 0 0 0 1700 2100 0 0",
    `beeper -${beeper.name}`,
    "profile 1",
    `set ${profiled.name} = ${profiled.min + 1}`,
    "profile 0",
    "batch end",
    "save",
].join("\n");

const compiled = await compileCustomDefaults(manifest, config);

check("compiles without errors", compiled.errors.length === 0, JSON.stringify(compiled.errors));
check(
    "skips what this firmware does not have, as the on-board CLI did",
    compiled.skipped.map((s) => s.text).join("|") === "resource MOTOR 9 A00|set not_a_setting_here = 1",
    JSON.stringify(compiled.skipped),
);
check("fits a 6K area", compiled.bytes.length < 6 * 1024, `${compiled.bytes.length} bytes`);

const known = knownResetBytes(manifest);

/** A board whose reset is random, bar what the compiler may know. */
function randomBoard(seed) {
    let state = seed;
    const next = () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state >> 16;
    };
    const board = new ImageBoard(manifest, 0, known);
    for (const reset of board.pristine.values()) {
        for (let i = 0; i < reset.length; i++) reset[i] = next() & 0xff;
    }
    for (const [pgn, offset, bytes] of known) board.pristine.get(pgn)?.set(bytes, offset);
    board.groups = new Map([...board.pristine].map(([pgn, b]) => [pgn, b.slice()]));
    return board;
}

for (const seed of [1, 2, 3]) {
    const live = randomBoard(seed);
    const cli = new ParamCli(manifest, live);
    for (const line of config.split("\n")) {
        try {
            await cli.execute(line);
        } catch {
            // the skipped lines; they write nothing before refusing
        }
    }

    const flashed = new Map([...live.pristine].map(([pgn, b]) => [pgn, b.slice()]));
    applyCustomDefaults(decodeCustomDefaults(compiled.bytes).records, flashed);

    const differing = [...live.groups].filter(([pgn, b]) => b.join() !== flashed.get(pgn).join()).map(([pgn]) => pgn);
    check(`replaying and applying the records agree, reset seed ${seed}`, differing.length === 0, `groups ${differing}`);
}

// --- board information ------------------------------------------------------------

const board = randomBoard(4);
const cli = new ParamCli(manifest, board);
check("board_name sets the name", (await cli.execute("board_name FIRST")).endsWith("board_name FIRST"));
check("the same name again is accepted", (await cli.execute("board_name FIRST")) === "board_name FIRST");
let refused = false;
try {
    await cli.execute("board_name OTHER");
} catch {
    refused = true;
}
check("a different name is refused once set", refused);
const dump = await cli.execute("diff all");
check("a diff carries the board name", dump.split("\n").includes("board_name FIRST"), dump.slice(0, 400));

// --- lines that cannot be compiled ------------------------------------------------

// Without the serial port slots, which slot `serial 0` lands in depends on the
// board's reset: refused, never guessed.
const noPorts = new Manifest({ ...raw, cli: { ...raw.cli, serial_ports: [] } });
const guessed = await compileCustomDefaults(noPorts, "serial 0 64 115200 57600 0 115200");
check("refuses a line that depends on the board", guessed.errors.length === 1, JSON.stringify(guessed));

console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
