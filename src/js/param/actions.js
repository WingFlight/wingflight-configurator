/**
 * The CLI's action commands: reboots, passthrough, binding, dataflash.
 *
 * These are not configuration, so they do not go through the manifest's
 * parameter groups. Each maps onto an MSP opcode that already existed for the
 * configurator's own use (see §8.2 of the firmware's
 * parameter-addressing-design.md), and talks to the board only through `io`,
 * so it can be checked without hardware. What this build supports comes from
 * the manifest's `cli.limits`, so a command the target lacks is refused rather
 * than sent and left to fail.
 *
 * Where MSP cannot do what the firmware CLI did, the command says so instead
 * of half-working -- see serialpassthrough.
 */

import { CliError } from "./cli_error.js";

// MSP_REBOOT modes, msp.c mspRebootFn().
const REBOOT = { FIRMWARE: 0, BOOTLOADER_ROM: 1, MSC: 2, MSC_UTC: 3, BOOTLOADER_FLASH: 4 };
// MSP_SET_PASSTHROUGH modes, msp.c mspPassthroughMode.
const PASSTHROUGH_SERIAL_ID = 0xfd;
const PASSTHROUGH_SERIAL_FUNCTION_ID = 0xfe;
// escprog protocols, drivers/serial_escserial.h escProtocol_e.
const ESC_PROTOCOLS = [
    ["sk", 0], // SIMONK
    ["bl", 1], // BLHELI
    ["ki", 2], // KISS
    ["cc", 3], // KISSALL
];
const ALL_MOTORS = 255;
const TIMEZONE_OFFSET_MINUTES = [-780, 780];
const FLASHFS_FLAG_READY = 1 << 0;
const FLASHFS_FLAG_SUPPORTED = 1 << 1;

const limitsOf = (manifest) => manifest.raw.cli?.limits ?? {};

const needs = (io, method, command) => {
    if (typeof io[method] !== "function") {
        throw new CliError(`${command} is not available on this connection`);
    }
};

/** C's atoi: a leading integer, 0 if there is none. */
function atoi(text) {
    const n = parseInt(text ?? "", 10);
    return Number.isNaN(n) ? 0 : n;
}

// --- reboots ---------------------------------------------------------------

async function reboot(io, mode, message) {
    needs(io, "reboot", "reboot");
    const reply = await io.reboot(mode);
    if (!reply.accepted) {
        throw new CliError("the flight controller refused the reboot");
    }
    return message;
}

/** `exit`: the firmware left CLI mode by rebooting, dropping unsaved changes. */
export function exitCommand(io) {
    return reboot(io, REBOOT.FIRMWARE, "# leaving CLI mode, unsaved changes lost\nRebooting");
}

export function dfuCommand(io) {
    return reboot(io, REBOOT.BOOTLOADER_ROM, "# restarting in DFU mode");
}

/** `bl [rom|flash]`, defaulting to the flash bootloader where the build has one. */
export function blCommand(manifest, io, argument) {
    const flash = Boolean(limitsOf(manifest).flashBootLoader);
    const arg = argument.toLowerCase();
    if ((!arg && !flash) || arg.startsWith("rom")) {
        return reboot(io, REBOOT.BOOTLOADER_ROM, "# restarting in ROM bootloader mode");
    }
    if (flash && (!arg || arg.startsWith("flash"))) {
        return reboot(io, REBOOT.BOOTLOADER_FLASH, "# restarting in flash bootloader mode");
    }
    throw new CliError("Invalid option");
}

/**
 * `msc [<timezone offset minutes>]`.
 *
 * MSP_REBOOT's MSC mode uses the configured timezone offset, so an offset on
 * the command line is written to timezone_offset_minutes first -- in RAM only,
 * which is all the reboot needs; it is not saved.
 */
export async function mscCommand(io, argument) {
    needs(io, "reboot", "msc");
    if (argument) {
        const offset = atoi(argument);
        if (offset < TIMEZONE_OFFSET_MINUTES[0] || offset > TIMEZONE_OFFSET_MINUTES[1]) {
            throw new CliError("INVALID TIMEZONE OFFSET");
        }
        await io.write("timezone_offset_minutes", offset);
    }
    const reply = await io.reboot(REBOOT.MSC);
    if (!reply.accepted) {
        throw new CliError("msc is not supported by this firmware");
    }
    if (!reply.storageReady) {
        return "# Storage not present or failed to initialize!";
    }
    return "# Restarting in mass storage mode\nRebooting";
}

// --- binding ---------------------------------------------------------------

export async function bindRxCommand(io) {
    needs(io, "bind", "bind_rx");
    if (!(await io.bind())) {
        throw new CliError("Not supported.");
    }
    return "Binding...";
}

// --- passthrough -----------------------------------------------------------

async function startPassthrough(io, mode, argument, started, refused) {
    needs(io, "passthrough", "passthrough");
    const reply = await io.passthrough(mode, argument);
    if (!reply) {
        throw new CliError(refused);
    }
    // The port now carries the other device, not MSP: let it go, so the tool
    // that wants it can open it. Passthrough lasts until the board restarts.
    io.releasePort?.();
    return `${started}\n# the configurator has disconnected; open this port with your tool, and power-cycle the flight controller to end passthrough`;
}

/**
 * `serialpassthrough <port id | esc_sensor>`.
 *
 * MSP passthrough bridges this port to a UART that is already open, at the
 * speed it is configured for. The firmware CLI could also open an idle UART
 * at a given baud rate and mode, drive a DTR pin, and bridge two UARTs; none
 * of that exists over MSP, so those arguments are refused rather than
 * silently ignored.
 */
export function serialPassthroughCommand(manifest, io, argument) {
    const args = argument ? argument.split(/\s+/) : [];
    if (args.length === 0) {
        throw new CliError("INVALID ARGUMENT COUNT");
    }
    if (args.length > 1) {
        throw new CliError(
            "baud rate, mode, DTR and second-port arguments are not supported: passthrough runs at the port's " +
                "configured speed. Set the port up in the Ports tab, then use `serialpassthrough <port>`",
        );
    }
    if (args[0].toLowerCase().includes("esc_sensor")) {
        return startPassthrough(io, PASSTHROUGH_SERIAL_FUNCTION_ID, limitsOf(manifest).escSensorFunctionBit ?? 10,
            "# passthrough to the ESC sensor port started", "no port is configured for ESC_SENSOR");
    }
    const id = atoi(args[0]);
    return startPassthrough(io, PASSTHROUGH_SERIAL_ID, id & 0xff, `# passthrough to port ${id} started`,
        `port ${id} is not open: give it a function in the Ports tab and save before passing through`);
}

export function gpsPassthroughCommand(manifest, io) {
    return startPassthrough(io, PASSTHROUGH_SERIAL_FUNCTION_ID, limitsOf(manifest).gpsFunctionBit ?? 1,
        "# passthrough to the GPS started", "no port is configured for GPS");
}

/** `escprog <sk|bl|ki|cc> <output>`, as cliEscPassthrough; KISS also takes 255 for all. */
export function escprogCommand(manifest, io, argument) {
    if (!limitsOf(manifest).escSerial) {
        throw new CliError("escprog is not supported by this firmware");
    }
    const args = argument ? argument.split(/\s+/) : [];
    if (args.length !== 2) {
        throw new CliError("INVALID ARGUMENT COUNT");
    }
    const word = args[0].toLowerCase();
    const protocol = ESC_PROTOCOLS.find(([name]) => name.startsWith(word));
    if (!protocol) {
        throw new CliError("PARSING FAILED");
    }
    const output = atoi(args[1]);
    const all = protocol[1] === 2 && output === ALL_MOTORS;
    if (!all && output < 1) {
        throw new CliError("INVALID OUTPUT NUMBER");
    }
    return startPassthrough(io, protocol[1], all ? ALL_MOTORS : (output - 1) & 0xff,
        `# ESC passthrough on ${all ? "all outputs" : `output ${output}`} started`,
        "Error starting ESC connection (is the output number valid?)");
}

// --- dataflash -------------------------------------------------------------

/**
 * `flash_info`. MSP_DATAFLASH_SUMMARY carries the FlashFS partition, not the
 * chip geometry and partition table the firmware printed.
 */
export async function flashInfoCommand(io) {
    needs(io, "dataflashSummary", "flash_info");
    const s = await io.dataflashSummary();
    if (!(s.flags & FLASHFS_FLAG_SUPPORTED)) {
        return "# no dataflash on this board";
    }
    return [
        `FlashFS sectors=${s.sectors}, size=${s.totalSize}, usedSize=${s.usedSize}`,
        s.flags & FLASHFS_FLAG_READY ? "FlashFS ready" : "FlashFS busy",
    ].join("\n");
}

/** `flash_erase`: start the erase, then wait until the board reports ready again. */
export async function flashEraseCommand(io, { pollMs = 500, timeoutMs = 10 * 60 * 1000 } = {}) {
    needs(io, "dataflashErase", "flash_erase");
    const before = await io.dataflashSummary();
    if (!(before.flags & FLASHFS_FLAG_SUPPORTED)) {
        return "";
    }
    await io.dataflashErase();
    const sleep = io.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    for (let waited = 0; waited < timeoutMs; waited += pollMs) {
        await sleep(pollMs);
        if ((await io.dataflashSummary()).flags & FLASHFS_FLAG_READY) {
            return "Erasing, please wait ...\nDone.";
        }
    }
    throw new CliError("the erase did not finish in time; check the Blackbox tab");
}

/**
 * `flash_read <address> <length>`. Addresses are within the FlashFS partition,
 * as MSP_DATAFLASH_READ reads them; the firmware CLI read physical addresses
 * and wrote the raw bytes to the terminal, which is shown here as hex.
 */
export async function flashReadCommand(io, argument) {
    needs(io, "dataflashRead", "flash_read");
    const args = argument ? argument.split(/\s+/) : [];
    if (args.length < 2) {
        throw new CliError("INVALID ARGUMENT COUNT");
    }
    let address = atoi(args[0]) >>> 0;
    let length = atoi(args[1]) >>> 0;
    const lines = [`Reading ${length} bytes at ${address}:`];
    const bytes = [];
    while (length > 0) {
        const chunk = await io.dataflashRead(address, Math.min(length, 128));
        if (!chunk.length) break; // end of the volume
        bytes.push(...chunk);
        address += chunk.length;
        length -= chunk.length;
    }
    const start = atoi(args[0]) >>> 0;
    for (let i = 0; i < bytes.length; i += 16) {
        const row = bytes.slice(i, i + 16);
        lines.push(`${(start + i).toString(16).padStart(8, "0")}  ${row.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`);
    }
    return lines.join("\n");
}

// --- everything else ---------------------------------------------------------

/**
 * Commands the firmware CLI had that the configurator does not provide: bench
 * and developer tools, live hardware diagnostics and board identity. Named so
 * that typing one says what happened to it rather than "Unknown command".
 */
export const NOT_AVAILABLE = {
    flash_fill: "a developer tool",
    flash_verify: "a developer tool",
    flash_write: "a developer tool",
    flash_erase_sector: "a developer tool",
    flashfs_initial_erase: "a developer tool",
    play_sound: "a bench test",
    motor: "a bench test; use the Motors tab",
    dshotprog: "a bench test",
    dshot_telemetry_info: "a live diagnostic",
    fbus_sensors: "a live diagnostic",
    sd_info: "a live diagnostic; see the Blackbox tab",
    srxl2esc: "a live diagnostic",
    mcu_id: "board identity; see the Setup tab",
    signature: "board identity",
    board_name: "board identity",
    board_design: "board identity",
    manufacturer_id: "board identity",
    logic: "not part of a backup yet",
    vtx: "not built into Wingflight",
    vtx_info: "not built into Wingflight",
    vtxtable: "not built into Wingflight",
};
