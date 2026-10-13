// XACT programming on boards with an FBUS mux FPGA (FC.FBUS_MUX, e.g. the RF007 V3). Each
// mux output can be put on the FBUS line on its own with MSP2_WING_SET_FBUS_MUX_OVERRIDE, so
// servos that share factory IDs can be told apart: one output at a time.
//
// Auto-programming gives the servo on each output saved as FBUS fixed values for that
// output, so the servos no longer collide once every FBUS output is on the bus together.
// The ESC output is never auto-programmed.

import { FBUS_SERVO_DATA_BASE } from "./protocol.js";

// Fixed values per mux channel (1-based): Physical ID = output number, App ID 0x6800 +
// index, and the channel that follows the output (wire value, 0 = CH1), which with
// bus_servo_clone_pwm is the bus channel mirroring the PWM servo on that pin.
export const AUTO_PROGRAM_PLAN = {
    1: { physicalId: 1, appIdOffset: 0, channel: 0 }, // S1
    2: { physicalId: 2, appIdOffset: 1, channel: 1 }, // S2
    3: { physicalId: 3, appIdOffset: 2, channel: 2 }, // S3
    4: { physicalId: 4, appIdOffset: 3, channel: 3 }, // TAIL
};

// Range every auto-programmed servo gets (protocol.js / XACT_FIELD_RANGE: 0 = 120°)
export const AUTO_PROGRAM_RANGE = 0;

const MODE_PWM = 0;
const MODE_FBUS = 1;
const MODE_INDEX = { PWM: 0, FBUS: 1, DSHOT: 2 };

/** 1-based mux channels saved as FBUS. */
export function fbusChannels(mux) {
    return (mux?.channels ?? [])
        .map((channel, i) => (channel.mode === "FBUS" ? i + 1 : null))
        .filter((channel) => channel !== null);
}

/**
 * Override modes that put FBUS on `channel` only: the other FBUS outputs go to PWM so
 * their servos stay off the line, everything else keeps its saved mode.
 * @returns {number[]} fbusMuxMode_e per channel.
 */
export function isolateChannelModes(mux, channel) {
    return mux.channels.map((saved, i) => {
        if (i + 1 === channel) return MODE_FBUS;
        return saved.mode === "FBUS" ? MODE_PWM : MODE_INDEX[saved.mode];
    });
}

/** MSP2_WING_SET_FBUS_MUX_OVERRIDE payload; timeout 0 ends the override. */
export function buildMuxOverridePayload(timeoutMs, modes = []) {
    const payload = [timeoutMs & 0xff, (timeoutMs >> 8) & 0xff];
    if (timeoutMs) payload.push(modes.length, ...modes);
    return payload;
}

function isXactAppId(appId) {
    return appId >= FBUS_SERVO_DATA_BASE && appId <= FBUS_SERVO_DATA_BASE + 0x0f;
}

/** Physical IDs of FBUS devices that are not XACT servos (FC.FBUS_SENSORS), e.g. a GPS. */
export function otherDevicePhysicalIds(sensors) {
    return new Set(
        (sensors ?? [])
            .filter((sensor) => !sensor.appIds.some(isXactAppId))
            .map((sensor) => sensor.physicalId),
    );
}

/**
 * What auto-programming does with the servos found on each output.
 * @param {{channel: number, servos: Object[]}[]} survey - Per FBUS output, the servos its scan found.
 * @param {Set<number>} otherIds - otherDevicePhysicalIds of every device found on the bus.
 * @returns {{channel: number, status: string, servo?: Object, target?: Object}[]} status is
 *   "program", "unchanged", "notPlanned" (the ESC output), "noServo", "multipleServos"
 *   (they can't be told apart) or "idClash" (another device has the target Physical ID).
 */
export function planAutoProgram(survey, otherIds) {
    // Servos on FBUS outputs that keep their IDs share the bus with the programmed ones
    const keptIds = new Set();
    const keptAppIds = new Set();
    for (const { channel, servos } of survey) {
        if (AUTO_PROGRAM_PLAN[channel]) continue;
        for (const servo of servos) {
            keptIds.add(servo.physicalId);
            keptAppIds.add(servo.appIdOffset);
        }
    }

    return survey.map(({ channel, servos }) => {
        const target = AUTO_PROGRAM_PLAN[channel];
        if (!target) return { channel, status: "notPlanned" };
        if (servos.length === 0) return { channel, status: "noServo" };
        if (servos.length > 1 || servos[0].conflict || servos[0].duplicateAppId) {
            return { channel, status: "multipleServos" };
        }

        const servo = servos[0];
        if (otherIds.has(target.physicalId) || keptIds.has(target.physicalId) || keptAppIds.has(target.appIdOffset)) {
            return { channel, status: "idClash", servo, target };
        }

        const unchanged =
            servo.physicalId === target.physicalId &&
            servo.appIdOffset === target.appIdOffset &&
            servo.channel === target.channel &&
            servo.range === AUTO_PROGRAM_RANGE;
        return { channel, status: unchanged ? "unchanged" : "program", servo, target };
    });
}

/** The servo's full parameters with the auto-programmed fields replaced. */
export function autoProgramValues(params, target) {
    return {
        ...params,
        physicalId: target.physicalId,
        appIdOffset: target.appIdOffset,
        channel: target.channel,
        range: AUTO_PROGRAM_RANGE,
    };
}
