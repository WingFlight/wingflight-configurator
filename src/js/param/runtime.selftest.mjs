/**
 * Offline checks for the runtime diagnostics (`tasks`, `gyroregisters`,
 * `setpoint_info`).
 *
 * Replies are built byte for byte the way the firmware's msp/msp_runtime.c
 * writes them. The expected text was produced by compiling the deleted
 * cli.c's own printf format strings against the same numbers, so these checks
 * compare against what the firmware actually printed, not a reading of it.
 *
 *   node src/js/param/runtime.selftest.mjs
 */

import {
    decodeTaskPage,
    decodeGyroRegisters,
    decodeSetpointInfo,
    formatTasks,
    formatGyroRegisters,
    formatSetpointInfo,
    decodeStatus,
    decodeBatteryState,
    formatStatus,
    TASK_INFO_FLAG_STATISTICS,
    TASK_INFO_FLAG_LATE_STATS,
} from "./runtime.js";

let checks = 0;
let failures = 0;

function check(what, condition, detail = "") {
    checks++;
    if (!condition) {
        failures++;
        console.error(`FAIL  ${what}${detail ? ` -- ${detail}` : ""}`);
    }
}

function sameText(what, actual, expected) {
    check(what, actual === expected, `\n--- got\n${actual}\n--- wanted\n${expected}`);
}

const TASK_COUNT = 40;

const TASKS = [
    { id: 0, name: "SYSTEM", averageDeltaTime10thUs: 100000, maxExecutionTimeUs: 50, averageExecutionTime10thUs: 305, totalExecutionTimeUs: 123456, runCount: 10, lateCount: 1, execTime: 7 },
    { id: 3, name: "SERIAL", averageDeltaTime10thUs: 100000, maxExecutionTimeUs: 400, averageExecutionTime10thUs: 1234, totalExecutionTimeUs: 5000, runCount: 20, lateCount: 2, execTime: 8 },
    { id: 7, name: "GYRO", averageDeltaTime10thUs: 1250, maxExecutionTimeUs: 12, averageExecutionTime10thUs: 45, totalExecutionTimeUs: 999999, runCount: 30, lateCount: 3, execTime: 9 },
];

/** Encode a task page as msp_runtime.c does. */
function taskPage(flags, nextTaskId, tasks) {
    const bytes = [];
    const u32 = (v) => bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);

    bytes.push(flags, TASK_COUNT, nextTaskId);
    u32(11);
    u32(22);
    u32(33000);
    for (const t of tasks) {
        bytes.push(t.id, t.name.length, ...[...t.name].map((c) => c.charCodeAt(0)));
        u32(t.averageDeltaTime10thUs);
        u32(t.maxExecutionTimeUs);
        u32(t.averageExecutionTime10thUs);
        u32(t.totalExecutionTimeUs);
        u32(t.runCount);
        u32(t.lateCount);
        u32(t.execTime);
    }
    return new DataView(new Uint8Array(bytes).buffer);
}

// --- decoding ---------------------------------------------------------------

const page = decodeTaskPage(taskPage(TASK_INFO_FLAG_STATISTICS, TASK_COUNT, TASKS));
check("task page header", page.taskCount === TASK_COUNT && page.nextTaskId === TASK_COUNT);
check("task page carries every entry", page.tasks.length === 3, `${page.tasks.length}`);
check("task entry round trips", JSON.stringify(page.tasks[2]) === JSON.stringify(TASKS[2]), JSON.stringify(page.tasks[2]));
check("check function counters decode", page.checkFunc.totalExecutionTimeUs === 33000);

const empty = decodeTaskPage(taskPage(0, TASK_COUNT, []));
check("an empty last page decodes", empty.tasks.length === 0);

const whole = taskPage(0, TASK_COUNT, TASKS.slice(0, 1));
let truncatedRejected = false;
try {
    decodeTaskPage(new DataView(whole.buffer, 0, whole.byteLength - 1));
} catch {
    truncatedRejected = true;
}
check("a truncated entry is rejected, not zero-filled", truncatedRejected);

// --- tasks, against the old firmware's output --------------------------------

sameText(
    "tasks with statistics",
    formatTasks({ flags: TASK_INFO_FLAG_STATISTICS, checkFunc: page.checkFunc, tasks: page.tasks }),
    [
        "Task list             rate/hz  max/us  avg/us maxload avgload  total/ms",
        "00 - (         SYSTEM)    100      50      30    0.5%    0.3%       123",
        "03 - (         SERIAL)    100     400     123    4.0%    1.2%         5",
        "07 - (           GYRO)   8000      12       4    9.6%    3.6%       999",
        "RX Check Function                  11      22                        33",
        "Total (excluding SERIAL)                                 3.9%",
    ].join("\n"),
);

sameText(
    "tasks with late statistics",
    formatTasks({ flags: TASK_INFO_FLAG_STATISTICS | TASK_INFO_FLAG_LATE_STATS, checkFunc: page.checkFunc, tasks: page.tasks }),
    [
        "Task list             rate/hz  max/us  avg/us maxload avgload  total/ms   late    run reqd/us",
        "00 - (         SYSTEM)    100      50      30    0.5%    0.3%       123      1     10       7",
        "03 - (         SERIAL)    100     400     123    4.0%    1.2%         5      2     20       8",
        "07 - (           GYRO)   8000      12       4    9.6%    3.6%       999      3     30       9",
        "RX Check Function                  11      22                        33",
        "Total (excluding SERIAL)                                 3.9%",
    ].join("\n"),
);

sameText(
    "tasks without statistics",
    formatTasks({ flags: 0, checkFunc: page.checkFunc, tasks: page.tasks }),
    [
        "Task list",
        "00 - (         SYSTEM)    100",
        "03 - (         SERIAL)    100",
        "07 - (           GYRO)   8000",
    ].join("\n"),
);

// --- gyro registers ---------------------------------------------------------

const oneGyro = decodeGyroRegisters(new DataView(new Uint8Array([1, 1, 0x68, 0x01, 0x18]).buffer));
sameText(
    "gyroregisters, one sensor",
    formatGyroRegisters(oneGyro),
    ["# WHO_AM_I    0x68", "# CONFIG      0x1", "# GYRO_CONFIG 0x18"].join("\n"),
);

const twoGyros = decodeGyroRegisters(new DataView(new Uint8Array([2, 1, 0x68, 0x01, 0x18, 2, 0x12, 0x00, 0x08]).buffer));
check("gyroregisters labels each of two sensors",
    /# Gyro 1[\s\S]*# Gyro 2/.test(formatGyroRegisters(twoGyros)), formatGyroRegisters(twoGyros));

check("gyroregisters explains a build without the dump",
    /not built/.test(formatGyroRegisters(decodeGyroRegisters(new DataView(new Uint8Array([0]).buffer)))));

let shortRejected = false;
try {
    decodeGyroRegisters(new DataView(new Uint8Array([2, 1, 0x68, 0x01, 0x18]).buffer));
} catch {
    shortRejected = true;
}
check("gyroregisters rejects a count the payload does not back", shortRejected);

// --- setpoint info ----------------------------------------------------------

const frame = (signal, us) => new DataView(new Uint8Array([signal, us & 0xff, us >> 8]).buffer);

sameText("setpoint_info, 6.666 ms", formatSetpointInfo(decodeSetpointInfo(frame(1, 6666))), "# Detected RX frame rate: 6.666ms");
sameText("setpoint_info, 20 ms", formatSetpointInfo(decodeSetpointInfo(frame(1, 20000))), "# Detected RX frame rate: 20.000ms");
sameText("setpoint_info, no signal", formatSetpointInfo(decodeSetpointInfo(frame(0, 6666))), "# Detected RX frame rate: NO SIGNAL");

// --- status -------------------------------------------------------------------

/** MSP_STATUS exactly as Wingflight's msp.c writes it. */
function statusReply() {
    const b = [];
    const u8 = (v) => b.push(v & 0xff);
    const u16 = (v) => b.push(v & 0xff, (v >> 8) & 0xff);
    const u32 = (v) => b.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    u16(500); //                       pid cycle
    u16(125); //                       gyro cycle
    u16((1 << 5) | (1 << 0) | (1 << 1)); // GYRO, ACC, BARO
    u32(0); //                         flight modes
    u8(0); //                          compat profile
    u16(420); //                       max real-time load
    u16(123); //                       average CPU load, tenths
    u8(0); //                          compat
    u8(28); //                         arming disable flag count
    u32((1 << 2) | (1 << 13)); //      RXLOSS, CLI
    u8(0); //                          reboot required
    u8(2); //                          CONFIGURED
    u8(0); u8(6); u8(0); u8(6); //     profiles
    u8(4); u8(8); //                   motors, servos
    u8(0b011); //                      gyros 1 and 2
    return new DataView(new Uint8Array(b).buffer);
}

const status = decodeStatus(statusReply());
check("status decodes the gyro cycle, not I2C errors", status.gyroCycleUs === 125);
check("status decodes the arming flags at their offset", status.armingDisableFlags === ((1 << 2) | (1 << 13)));
check("status decodes the gyro detection byte", status.gyroDetectionFlags === 0b011);

const battery = decodeBatteryState(new DataView(new Uint8Array([1, 4, 0x10, 0x27, 0, 0, 0x9c, 0x06, 0, 0, 50, 0]).buffer));
check("battery state decodes voltage in 10mV", battery.voltage === 1692 && battery.cellCount === 4);

const statusTables = {
    mcu_types: ["SIMULATOR", "F40X", "F411", "F446", "F722"],
    configuration_states: ["UNCONFIGURED", "CUSTOM DEFAULTS", "CONFIGURED"],
    arming_disable_flags: ["NOGYRO", "FAILSAFE", "RXLOSS", "BADRX", "BOXFAILSAFE", "RUNAWAY", "CRASH", "THROTTLE",
        "ANGLE", "BOOTGRACE", "NOPREARM", "LOAD", "CALIB", "CLI"],
    battery_states: ["OK", "WARNING", "CRITICAL", "NOT PRESENT", "INIT"],
};
sameText(
    "status, from MSP",
    formatStatus({ status, battery, mcuTypeId: 4, setpoint: { receivingSignal: true, averageRxFrameUs: 4000 } }, statusTables),
    [
        "MCU F722",
        "Configuration: CONFIGURED",
        "Gyros detected: gyro 1, gyro 2",
        "Sensors detected: GYRO, ACC, BARO",
        "CPU:12%, cycle time: 125, GYRO rate: 8000, RX rate: 250",
        "Voltage: 1692 * 0.01V (4S battery - WARNING)",
        "Arming disable flags: RXLOSS CLI",
        "# not reported over MSP: clock, Vref, core temperature, stack, EEPROM size, I2C errors, sensor models, uptime",
    ].join("\n"),
);
check("status without RX signal reports RX rate 0",
    formatStatus({ status, battery, mcuTypeId: 4, setpoint: { receivingSignal: false, averageRxFrameUs: 4000 } }, statusTables)
        .includes("RX rate: 0"));
let shortStatus = false;
try {
    decodeStatus(new DataView(new Uint8Array(10).buffer));
} catch {
    shortStatus = true;
}
check("a short status reply is rejected, not zero-filled", shortStatus);

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
