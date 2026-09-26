/**
 * Runtime diagnostics: `tasks`, `gyroregisters`, `setpoint_info`.
 *
 * The firmware lost these with its CLI and now reports the raw numbers over
 * MSP2_WING_TASK_INFO / _GYRO_REGISTERS / _SETPOINT_INFO; see the firmware's
 * msp/msp_runtime.c for the wire shapes. This module decodes those replies and
 * formats them the way the on-device CLI printed them.
 *
 * Nothing here talks to the board, so it can be checked offline.
 */

export const TASK_INFO_FLAG_STATISTICS = 1 << 0;
export const TASK_INFO_FLAG_LATE_STATS = 1 << 1;

const TASK_HEADER_BYTES = 15;

/** Decode one MSP2_WING_TASK_INFO page. */
export function decodeTaskPage(view) {
    if (view.byteLength < TASK_HEADER_BYTES) {
        throw new Error(`task info: ${view.byteLength} bytes is shorter than the header`);
    }

    const page = {
        flags: view.getUint8(0),
        taskCount: view.getUint8(1),
        nextTaskId: view.getUint8(2),
        checkFunc: {
            maxExecutionTimeUs: view.getUint32(3, true),
            averageExecutionTimeUs: view.getUint32(7, true),
            totalExecutionTimeUs: view.getUint32(11, true),
        },
        tasks: [],
    };

    let at = TASK_HEADER_BYTES;
    while (at < view.byteLength) {
        const id = view.getUint8(at);
        const nameLength = view.getUint8(at + 1);
        const fields = at + 2 + nameLength;
        if (fields + 28 > view.byteLength) {
            throw new Error(`task info: entry for task ${id} is truncated`);
        }
        let name = "";
        for (let i = 0; i < nameLength; i++) {
            name += String.fromCharCode(view.getUint8(at + 2 + i));
        }
        page.tasks.push({
            id,
            name,
            averageDeltaTime10thUs: view.getUint32(fields, true),
            maxExecutionTimeUs: view.getUint32(fields + 4, true),
            averageExecutionTime10thUs: view.getUint32(fields + 8, true),
            totalExecutionTimeUs: view.getUint32(fields + 12, true),
            runCount: view.getUint32(fields + 16, true),
            lateCount: view.getUint32(fields + 20, true),
            execTime: view.getUint32(fields + 24, true),
        });
        at = fields + 28;
    }

    return page;
}

/** Decode an MSP2_WING_GYRO_REGISTERS reply into one entry per sensor. */
export function decodeGyroRegisters(view) {
    const count = view.getUint8(0);
    if (view.byteLength < 1 + count * 4) {
        throw new Error(`gyro registers: ${count} sensors reported in ${view.byteLength} bytes`);
    }
    const sensors = [];
    for (let i = 0; i < count; i++) {
        const at = 1 + i * 4;
        sensors.push({
            sensor: view.getUint8(at),
            whoAmI: view.getUint8(at + 1),
            config: view.getUint8(at + 2),
            gyroConfig: view.getUint8(at + 3),
        });
    }
    return sensors;
}

/** Decode an MSP2_WING_SETPOINT_INFO reply. */
export function decodeSetpointInfo(view) {
    return {
        receivingSignal: view.getUint8(0) !== 0,
        averageRxFrameUs: view.getUint16(1, true),
    };
}

// The on-device CLI's arithmetic, kept integer so the columns match it.

function taskFrequency(task) {
    return task.averageDeltaTime10thUs === 0 ? 0 : Math.round(1e7 / task.averageDeltaTime10thUs);
}

function percent(tenths) {
    return `${String(Math.trunc(tenths / 10)).padStart(4)}.${tenths % 10}%`;
}

function col(value, width) {
    return String(value).padStart(width);
}

/** Format a full task list (all pages merged) as `tasks` printed it. */
export function formatTasks({ flags, checkFunc, tasks }) {
    const statistics = Boolean(flags & TASK_INFO_FLAG_STATISTICS);
    const late = Boolean(flags & TASK_INFO_FLAG_LATE_STATS);
    const lines = [];

    if (!statistics) {
        lines.push("Task list");
    } else if (late) {
        lines.push("Task list             rate/hz  max/us  avg/us maxload avgload  total/ms   late    run reqd/us");
    } else {
        lines.push("Task list             rate/hz  max/us  avg/us maxload avgload  total/ms");
    }

    let averageLoadSum = 0;
    for (const task of tasks) {
        const frequency = taskFrequency(task);
        const maxLoad = task.maxExecutionTimeUs === 0 ? 0 : Math.trunc((task.maxExecutionTimeUs * frequency) / 1000);
        const averageLoad =
            task.averageExecutionTime10thUs === 0 ? 0 : Math.trunc((task.averageExecutionTime10thUs * frequency) / 10000);
        if (task.name !== "SERIAL") {
            averageLoadSum += averageLoad;
        }

        const prefix = `${String(task.id).padStart(2, "0")} - (${task.name.padStart(15)}) `;
        if (!statistics) {
            lines.push(prefix + col(frequency, 6));
            continue;
        }

        let line =
            prefix +
            [
                col(frequency, 6),
                col(task.maxExecutionTimeUs, 7),
                col(Math.trunc(task.averageExecutionTime10thUs / 10), 7),
                percent(maxLoad),
                percent(averageLoad),
                col(Math.trunc(task.totalExecutionTimeUs / 1000), 9),
            ].join(" ");
        if (late) {
            line += ` ${col(task.lateCount, 6)} ${col(task.runCount, 6)} ${col(task.execTime, 7)}`;
        }
        lines.push(line);
    }

    if (statistics) {
        lines.push(
            `RX Check Function ${col(checkFunc.maxExecutionTimeUs, 19)} ${col(checkFunc.averageExecutionTimeUs, 7)} ` +
                col(Math.trunc(checkFunc.totalExecutionTimeUs / 1000), 25),
        );
        lines.push(`Total (excluding SERIAL) ${col(Math.trunc(averageLoadSum / 10), 33)}.${averageLoadSum % 10}%`);
    }

    return lines.join("\n");
}

function hex(value) {
    return `0x${value.toString(16).toUpperCase()}`;
}

/** Format gyro registers as `gyroregisters` printed them. */
export function formatGyroRegisters(sensors) {
    if (!sensors.length) {
        return "# gyro register dump is not built into this firmware";
    }
    const lines = [];
    for (const s of sensors) {
        if (sensors.length > 1) {
            lines.push("", `# Gyro ${s.sensor}`);
        }
        lines.push(`# WHO_AM_I    ${hex(s.whoAmI)}`);
        lines.push(`# CONFIG      ${hex(s.config)}`);
        lines.push(`# GYRO_CONFIG ${hex(s.gyroConfig)}`);
    }
    return lines.join("\n");
}

// --- status ------------------------------------------------------------------

/**
 * Decode MSP_STATUS as Wingflight writes it (msp.c): not Betaflight's layout
 * -- the second word is the gyro cycle time, not I2C errors.
 */
export function decodeStatus(view) {
    // u16 pid cycle, u16 gyro cycle, u16 sensors, u32 modes, u8, u16 max load,
    // u16 avg load, u8, u8 flag count, u32 arming flags, u8 reboot, u8 state,
    // then profile and output counts and, last (byte 29), gyro detection.
    if (view.byteLength < 23) {
        throw new Error(`status: ${view.byteLength} bytes is too short`);
    }
    return {
        pidCycleUs: view.getUint16(0, true),
        gyroCycleUs: view.getUint16(2, true),
        sensors: view.getUint16(4, true),
        averageCpuLoad: view.getUint16(13, true), // tenths of a percent
        armingDisableFlags: view.getUint32(17, true),
        configurationState: view.getUint8(22),
        gyroDetectionFlags: view.byteLength > 29 ? view.getUint8(29) : 0,
    };
}

/** Decode MSP_BATTERY_STATE. */
export function decodeBatteryState(view) {
    return {
        state: view.getUint8(0),
        cellCount: view.getUint8(1),
        voltage: view.byteLength >= 8 ? view.getUint16(6, true) : 0, // 10 mV
    };
}

// MSP_STATUS sensor bits, in the order cli.c's sensorTypeNames printed them.
const STATUS_SENSORS = [
    ["GYRO", 5],
    ["ACC", 0],
    ["BARO", 1],
    ["MAG", 2],
    ["RANGEFINDER", 4],
    ["GPS", 3],
];

/**
 * `status`, from what MSP carries. The firmware printed more -- clock, Vref,
 * core temperature, stack and EEPROM sizes, I2C errors, sensor hardware
 * names, uptime -- none of which any MSP reply has, so they are named as
 * missing rather than guessed.
 */
export function formatStatus({ status, battery, mcuTypeId, setpoint }, tables = {}) {
    const name = (list, index, fallback) => list?.[index] ?? fallback;
    const lines = [];

    lines.push(`MCU ${name(tables.mcu_types, mcuTypeId, `type ${mcuTypeId}`)}`);
    lines.push(`Configuration: ${name(tables.configuration_states, status.configurationState, status.configurationState)}`);

    const gyros = [];
    for (let pos = 0; pos < 7; pos++) {
        if (status.gyroDetectionFlags & (1 << pos)) gyros.push(` gyro ${pos + 1}`);
    }
    lines.push(`Gyros detected:${gyros.join(",")}`);
    lines.push(`Sensors detected: ${STATUS_SENSORS.filter(([, bit]) => status.sensors & (1 << bit)).map(([n]) => n).join(", ")}`);

    const cpu = Math.min(Math.max(Math.trunc(status.averageCpuLoad / 10), 0), 100);
    const gyroRate = status.gyroCycleUs ? Math.trunc(1e6 / status.gyroCycleUs) : 0;
    const rxRate = setpoint?.receivingSignal && setpoint.averageRxFrameUs ? Math.trunc(1e6 / setpoint.averageRxFrameUs) : 0;
    lines.push(`CPU:${cpu}%, cycle time: ${status.gyroCycleUs}, GYRO rate: ${gyroRate}, RX rate: ${rxRate}`);

    lines.push(`Voltage: ${battery.voltage} * 0.01V (${battery.cellCount}S battery - ${name(tables.battery_states, battery.state, battery.state)})`);

    const flags = [];
    for (let bit = 0; bit < 32; bit++) {
        if (status.armingDisableFlags & (1 << bit)) flags.push(` ${name(tables.arming_disable_flags, bit, `bit${bit}`)}`);
    }
    lines.push(`Arming disable flags:${flags.join("")}`);

    lines.push("# not reported over MSP: clock, Vref, core temperature, stack, EEPROM size, I2C errors, sensor models, uptime");
    return lines.join("\n");
}

/** Format RX timing as `setpoint_info` printed it. */
export function formatSetpointInfo({ receivingSignal, averageRxFrameUs }) {
    if (!receivingSignal) {
        return "# Detected RX frame rate: NO SIGNAL";
    }
    const ms = Math.trunc(averageRxFrameUs / 1000);
    const us = String(averageRxFrameUs % 1000).padStart(3, "0");
    return `# Detected RX frame rate: ${ms}.${us}ms`;
}
