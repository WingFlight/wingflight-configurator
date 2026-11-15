// The F.Bus wiring trial (MSP2_WING_FBUS_MASTER_TRIAL): the flight
// controller tries each pin and polarity on the bus port until a device on
// the line answers. A found wiring is left live and in the FC's config (RAM);
// saving keeps it, and a stop puts the old wiring back.
//
// Keep the states in step with fbusMasterTrialState_e in the firmware's
// drivers/fbus_master.h.

export const BUS_TRIAL = {
    IDLE: 0,
    RUNNING: 1,
    SUCCESS: 2,
    FAILED: 3,
    // No F.Bus port open, armed, or an FBUS mux board
    REJECTED: 4,
};

export const BUS_TRIAL_ACTION = { POLL: 0, START: 1, STOP: 2 };

const REPLY_BYTES = 8;

/**
 * Decodes a trial reply. Null for firmware without the command, which
 * answers with no payload.
 * @param {DataView} data - with this app's readU8()/readU16() helpers.
 */
export function readBusTrial(data) {
    if (!data || data.byteLength < REPLY_BYTES) return null;
    return {
        state: data.readU8(),
        comboIndex: data.readU8(),
        comboCount: data.readU8(),
        pinSwap: data.readU8() !== 0,
        inverted: data.readU8() !== 0,
        frames: data.readU16(),
        portOpen: data.readU8() !== 0,
    };
}

/** Whether a reply ends the run: nothing more to poll for. */
export function busTrialEnded(state) {
    return state !== BUS_TRIAL.RUNNING;
}
