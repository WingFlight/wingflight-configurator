/**
 * Offline checks for the CLI's action commands (param/actions.js).
 *
 * The board is a recorder: each check asserts what would have gone over MSP
 * -- which reboot mode, which passthrough mode and argument -- and what the
 * user is told, including the refusals for what MSP cannot do. The manifest
 * decides what the build supports, so run it against each target.
 *
 *   node src/js/param/actions.selftest.mjs <manifest.json>
 */

import { readFileSync } from "node:fs";
import { Manifest } from "./manifest.js";
import { ParamCli, CliError } from "./cli.js";

let checks = 0;
let failures = 0;

function check(what, condition, detail = "") {
    checks++;
    if (!condition) {
        failures++;
        console.error(`FAIL  ${what}${detail ? ` -- ${detail}` : ""}`);
    }
}

async function refuses(what, fn, pattern) {
    checks++;
    try {
        await fn();
        failures++;
        console.error(`FAIL  ${what} -- expected a refusal, got none`);
    } catch (error) {
        if (!(error instanceof CliError) || (pattern && !pattern.test(error.message))) {
            failures++;
            console.error(`FAIL  ${what} -- ${error.constructor.name}: ${error.message}`);
        }
    }
}

const manifest = new Manifest(JSON.parse(readFileSync(process.argv[2], "utf8")));
const limits = manifest.raw.cli.limits;

function board(overrides = {}) {
    const calls = [];
    const io = {
        calls,
        identity: { target: "STM32F7X2", version: "4.6.0", revision: "abc1234" },
        written: {},
        released: 0,
        async reboot(mode) {
            calls.push(`reboot ${mode}`);
            return { accepted: true, storageReady: true, ...(overrides.reboot ?? {}) };
        },
        async bind() {
            calls.push("bind");
            return overrides.bind ?? true;
        },
        async passthrough(mode, argument) {
            calls.push(`passthrough ${mode} ${argument}`);
            return overrides.passthrough ?? 1;
        },
        releasePort() {
            this.released++;
        },
        async write(name, value) {
            this.written[name] = value;
        },
        summaries: overrides.summaries ?? [{ flags: 3, sectors: 256, totalSize: 16777216, usedSize: 4096 }],
        async dataflashSummary() {
            calls.push("summary");
            return this.summaries.length > 1 ? this.summaries.shift() : this.summaries[0];
        },
        async dataflashErase() {
            calls.push("erase");
        },
        async sleep() {},
        flash: Uint8Array.from({ length: 300 }, (_, i) => i & 0xff),
        async dataflashRead(address, length) {
            calls.push(`read ${address} ${length}`);
            return this.flash.slice(address, Math.min(address + length, this.flash.length));
        },
    };
    return { io, cli: new ParamCli(manifest, io) };
}

// --- reboots ------------------------------------------------------------------

{
    const { io, cli } = board();
    check("version prints the banner line", (await cli.execute("version")) === "# Wingflight / STM32F7X2 4.6.0 abc1234");
    check("exit reboots without saving", (await cli.execute("exit")).startsWith("# leaving CLI mode, unsaved changes lost"));
    check("exit sends MSP_REBOOT firmware", io.calls.at(-1) === "reboot 0");
    await cli.execute("dfu");
    check("dfu sends MSP_REBOOT bootloader rom", io.calls.at(-1) === "reboot 1");
    await cli.execute("bl rom");
    check("bl rom sends the ROM bootloader", io.calls.at(-1) === "reboot 1");
    await cli.execute("bl");
    check("bl defaults to the flash bootloader only where the build has one",
        io.calls.at(-1) === (limits.flashBootLoader ? "reboot 4" : "reboot 1"));
    if (!limits.flashBootLoader) {
        await refuses("bl flash is refused without a flash bootloader", () => cli.execute("bl flash"), /Invalid option/);
    }
    check("msc restarts into mass storage", (await cli.execute("msc")).includes("mass storage") && io.calls.at(-1) === "reboot 2");
    await cli.execute("msc -120");
    check("msc <offset> sets the timezone first, in RAM", io.written.timezone_offset_minutes === -120);
    await refuses("msc refuses an offset past 13 hours", () => cli.execute("msc 900"), /TIMEZONE/);
}
{
    const { cli } = board({ reboot: { accepted: true, storageReady: false } });
    check("msc reports missing storage instead of rebooting", (await cli.execute("msc")).includes("Storage not present"));
}
{
    const { cli } = board({ reboot: { accepted: false } });
    await refuses("a refused reboot is reported", () => cli.execute("exit"), /refused/);
}

// --- bind / passthrough ----------------------------------------------------------

{
    const { io, cli } = board();
    check("bind_rx starts binding", (await cli.execute("bind_rx")) === "Binding..." && io.calls.at(-1) === "bind");

    const started = await cli.execute("serialpassthrough 1");
    check("serialpassthrough uses MSP passthrough by port id", io.calls.at(-1) === "passthrough 253 1");
    check("serialpassthrough lets go of the port", io.released === 1);
    check("serialpassthrough says how to end it", started.includes("power-cycle"));
    await cli.execute("serialpassthrough esc_sensor");
    check("serialpassthrough esc_sensor goes by function",
        io.calls.at(-1) === `passthrough 254 ${limits.escSensorFunctionBit}`);
    await refuses("serialpassthrough refuses a baud rate MSP cannot set", () => cli.execute("serialpassthrough 1 115200"),
        /configured speed/);
    await refuses("serialpassthrough needs a port", () => cli.execute("serialpassthrough"), /ARGUMENT COUNT/);
    await cli.execute("gpspassthrough");
    check("gpspassthrough goes by the GPS function", io.calls.at(-1) === `passthrough 254 ${limits.gpsFunctionBit}`);

    if (limits.escSerial) {
        await cli.execute("escprog bl 2");
        check("escprog sends the protocol and a zero-based output", io.calls.at(-1) === "passthrough 1 1");
        await cli.execute("escprog ki 255");
        check("escprog ki 255 addresses all outputs", io.calls.at(-1) === "passthrough 2 255");
        await refuses("escprog refuses an unknown protocol", () => cli.execute("escprog zz 1"), /PARSING/);
        await refuses("escprog refuses output 0", () => cli.execute("escprog bl 0"), /OUTPUT/);
    } else {
        await refuses("escprog is refused where the build has no ESC serial", () => cli.execute("escprog bl 1"),
            /not supported/);
    }
}
{
    const { cli } = board({ bind: false });
    await refuses("bind_rx reports an unsupported receiver", () => cli.execute("bind_rx"), /Not supported/);
}
{
    const { io, cli } = board({ passthrough: 0 });
    await refuses("serialpassthrough explains a port that is not open", () => cli.execute("serialpassthrough 3"),
        /not open/);
    check("a refused passthrough keeps the connection", io.released === 0);
}

// --- dataflash ---------------------------------------------------------------------

{
    const { cli } = board();
    check("flash_info reports the FlashFS",
        (await cli.execute("flash_info")) === "FlashFS sectors=256, size=16777216, usedSize=4096\nFlashFS ready");
    const read = (await cli.execute("flash_read 250 100")).split("\n");
    check("flash_read stops at the end of the volume", read[0] === "Reading 100 bytes at 250:" && read.length === 5,
        read.join(" | "));
    check("flash_read prints hex rows", read[1] === "000000fa  fa fb fc fd fe ff 00 01 02 03 04 05 06 07 08 09");
    await refuses("flash_read needs an address and a length", () => cli.execute("flash_read 0"), /ARGUMENT COUNT/);
}
{
    const busy = { flags: 2, sectors: 256, totalSize: 16777216, usedSize: 0 };
    const ready = { flags: 3, sectors: 256, totalSize: 16777216, usedSize: 0 };
    const { io, cli } = board({ summaries: [ready, busy, busy, ready] });
    check("flash_erase waits until the board is ready again", (await cli.execute("flash_erase")).endsWith("Done."));
    check("flash_erase erased and polled", io.calls.filter((c) => c === "summary").length === 4 && io.calls.includes("erase"));
}
{
    const { io, cli } = board({ summaries: [{ flags: 0, sectors: 0, totalSize: 0, usedSize: 0 }] });
    check("flash_info on a board without flash", (await cli.execute("flash_info")) === "# no dataflash on this board");
    check("flash_erase does nothing without flash", (await cli.execute("flash_erase")) === "" && !io.calls.includes("erase"));
}

// --- the rest ---------------------------------------------------------------------

{
    const { cli } = board();
    await refuses("a developer tool says what it is", () => cli.execute("flash_fill"), /developer tool/);
    await refuses("a bench test points to its tab", () => cli.execute("motor 1 1500"), /Motors tab/);
    await refuses("a truly unknown command is still unknown", () => cli.execute("frobnicate"), /Unknown command/);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
