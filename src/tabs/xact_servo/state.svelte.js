import diff from "microdiff";

import { MSPCodes } from "@/js/msp/MSPCodes.js";

import { parseServoParams, buildServoParamsPayload, NO_SERVO_PHYSICAL_ID } from "./protocol.js";

export const View = {
    IDLE: "idle",
    SCANNING: "scanning",
    FORM: "form",
    NOT_FOUND: "not_found",
};

// Mirrors xact_servo_gui.py's scan flow: MSP_SET_XACT_SCAN restarts FBUS sensor discovery,
// then the reference tool waits 2s before its single MSP_XACT_PARAMS read. Polling here
// instead of a single fixed wait lets the form appear as soon as the servo answers, while
// still giving up after a similar overall timeout if nothing is found.
const SCAN_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 400;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class State {
    view = $state(View.IDLE);
    values = $state({});
    error = $state(null);

    // initialValues must be reactive ($state): `changes` reads it, and a plain field
    // reassignment wouldn't invalidate the derived, leaving isDirty()/the Save toolbar stuck.
    initialValues = $state(null);

    changes = $derived.by(() => {
        if (!this.initialValues) return [];
        return diff(this.initialValues, $state.snapshot(this.values));
    });

    isDirty() {
        return this.view === View.FORM && this.changes.length > 0;
    }

    reset() {
        this.view = View.IDLE;
        this.values = {};
        this.initialValues = null;
        this.error = null;
    }

    async fetchParams() {
        const response = await MSP.promise(MSPCodes.MSP_XACT_PARAMS);
        return parseServoParams(response.data);
    }

    applyFoundParams(params) {
        this.values = params;
        this.initialValues = $state.snapshot(this.values);
        this.view = View.FORM;
    }

    async scan() {
        this.view = View.SCANNING;
        this.error = null;

        try {
            await MSP.promise(MSPCodes.MSP_SET_XACT_SCAN);

            const deadline = Date.now() + SCAN_TIMEOUT_MS;
            let found = null;
            while (Date.now() < deadline) {
                await delay(POLL_INTERVAL_MS);
                const params = await this.fetchParams();
                if (params.physicalId !== NO_SERVO_PHYSICAL_ID) {
                    found = params;
                    break;
                }
            }

            if (found) {
                this.applyFoundParams(found);
            } else {
                this.view = View.NOT_FOUND;
            }
        } catch (err) {
            this.error = err?.message ?? String(err);
            this.view = View.NOT_FOUND;
        }
    }

    async rescan() {
        return this.scan();
    }

    async onSave() {
        const payload = buildServoParamsPayload(this.values);
        await MSP.promise(MSPCodes.MSP_SET_XACT_PARAMS, Array.from(payload));
        this.initialValues = $state.snapshot(this.values);
    }

    onRevert() {
        this.values = { ...this.initialValues };
    }
}

export default new State();
