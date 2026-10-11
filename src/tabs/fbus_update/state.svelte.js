import { MSPCodes } from "@/js/msp/MSPCodes.js";

import {
    MAX_DATA_LENGTH,
    OtaError,
    OtaState,
    buildDataPayload,
    buildStartPayload,
    parseFirmwareFile,
} from "./protocol.js";

export const View = {
    SETUP: "setup",
    UPDATING: "updating",
    DONE: "done",
    FAILED: "failed",
    UNSUPPORTED: "unsupported",
};

// Wait between status polls while the FC's buffer is full
const POLL_INTERVAL_MS = 20;

const ERROR_MESSAGES = {
    [OtaError.NO_RESPONSE]: "fbusUpdateErrorNoResponse",
    [OtaError.TIMEOUT]: "fbusUpdateErrorTimeout",
    [OtaError.REJECTED]: "fbusUpdateErrorRejected",
    [OtaError.STALLED]: "fbusUpdateErrorStalled",
    [OtaError.ABORTED]: "fbusUpdateErrorAborted",
};

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class State {
    view = $state(View.SETUP);
    // FBUS devices seen by the FC's FBUS master: [{ physicalId, name }]
    devices = $state([]);
    physicalId = $state(null);
    file = $state(null); // { info, payload }
    fileError = $state(null);
    error = $state(null); // i18n key
    acked = $state(0);
    size = $state(0);
    phase = $state(OtaState.IDLE);
    retries = $state(0);

    #cancel = false;

    get busy() {
        return this.view === View.UPDATING;
    }

    reset() {
        this.view = View.SETUP;
        this.error = null;
        this.acked = 0;
        this.size = 0;
        this.phase = OtaState.IDLE;
        this.retries = 0;
    }

    async fetchStatus() {
        const response = await MSP.promise(MSPCodes.MSP2_WING_FBUS_OTA_STATUS);
        if (response.unsupported || !FC.FBUS_OTA_STATUS) {
            return null;
        }
        return FC.FBUS_OTA_STATUS;
    }

    // Checks that the firmware supports device updates and lists the FBUS devices
    // the FBUS master has found (telemetry from them, including XACT servos).
    async load() {
        const status = await this.fetchStatus();
        if (!status) {
            this.view = View.UNSUPPORTED;
            return;
        }
        if (status.state !== OtaState.IDLE && status.state < OtaState.DONE) {
            // An update started earlier is still running; follow it
            this.size = status.size;
            this.physicalId = status.physicalId;
            this.view = View.UPDATING;
            this.follow();
        }
        await this.refreshDevices();
    }

    async refreshDevices() {
        await MSP.promise(MSPCodes.MSP2_WING_FBUS_SENSORS);
        this.devices = (FC.FBUS_SENSORS ?? [])
            .filter((sensor) => sensor.source === 0)
            .map((sensor) => ({ physicalId: sensor.physicalId, name: sensor.name }));
        if (this.physicalId === null && this.devices.length > 0) {
            this.physicalId = this.devices[0].physicalId;
        }
    }

    async loadFile(file) {
        this.fileError = null;
        this.file = null;
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            this.file = parseFirmwareFile(file.name, bytes);
        } catch (err) {
            this.fileError = err?.message?.startsWith("fbusUpdate") ? err.message : "fbusUpdateFileInvalid";
        }
    }

    async start() {
        if (!this.file || this.physicalId === null || this.busy) {
            return;
        }
        const payload = this.file.payload;
        this.reset();
        this.size = payload.byteLength;

        const response = await MSP.promise(
            MSPCodes.MSP2_WING_FBUS_OTA_START,
            buildStartPayload(this.physicalId, payload.byteLength),
        );
        if (response.unsupported) {
            this.error = "fbusUpdateErrorStartRefused";
            this.view = View.FAILED;
            return;
        }
        this.view = View.UPDATING;
        await this.follow(payload);
    }

    // Polls the FC and keeps its buffer filled until the update ends. Without a
    // payload (update started before this tab was opened) it only shows progress.
    async follow(payload = null) {
        this.#cancel = false;
        while (this.view === View.UPDATING) {
            const status = await this.fetchStatus();
            if (!status) {
                await delay(POLL_INTERVAL_MS);
                continue;
            }
            this.phase = status.state;
            this.acked = status.acked;
            this.retries = status.retries;

            if (status.state === OtaState.DONE) {
                this.view = View.DONE;
                break;
            }
            if (status.state === OtaState.FAILED || status.state === OtaState.IDLE) {
                this.error = ERROR_MESSAGES[status.error] ?? "fbusUpdateErrorAborted";
                this.view = View.FAILED;
                break;
            }

            let next = status.received;
            let free = status.bufferFree;
            let sent = false;
            while (payload && !this.#cancel && free > 0 && next < payload.byteLength) {
                const length = Math.min(MAX_DATA_LENGTH, free, payload.byteLength - next);
                const reply = await MSP.promise(
                    MSPCodes.MSP2_WING_FBUS_OTA_DATA,
                    buildDataPayload(next, payload.subarray(next, next + length)),
                );
                if (reply.unsupported) {
                    break; // continue from the FC's status
                }
                next += length;
                free -= length;
                sent = true;
            }
            if (this.#cancel) {
                await MSP.promise(MSPCodes.MSP2_WING_FBUS_OTA_ABORT);
                this.#cancel = false;
            }
            if (!sent) {
                await delay(POLL_INTERVAL_MS);
            }
        }
    }

    abort() {
        if (this.busy) {
            this.#cancel = true;
            // The loop sends the abort; send it here too in case it is waiting on a reply
            MSP.promise(MSPCodes.MSP2_WING_FBUS_OTA_ABORT);
        }
    }
}

export default new State();
