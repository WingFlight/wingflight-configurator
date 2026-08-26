import diff from "microdiff";

import { MSPCodes } from "@/js/msp/MSPCodes.js";

import { parseServoList, parseServoParams, buildServoParamsPayload } from "./protocol.js";

export const View = {
    IDLE: "idle",
    SCANNING: "scanning",
    LIST: "list",
    FORM: "form",
    NOT_FOUND: "not_found",
};

// Mirrors xact_servo_gui.py's scan flow: MSP_SET_XACT_SCAN restarts FBUS sensor discovery.
// Polling continues for a settle period after the discovered count last changed (rather than
// stopping at the very first servo found) so a second, slower-to-answer servo on the same bus
// still makes it into the list, while the common single-servo case doesn't wait out the full
// window once nothing new has shown up for a while.
const SCAN_TIMEOUT_MS = 8000;
const SCAN_POLL_INTERVAL_MS = 400;
const SCAN_SETTLE_MS = 1200;

// How long to wait for a selected servo's parameter read to complete before giving up. The
// firmware only auto-reads the first servo it discovers; selecting any other one kicks off a
// fresh read for it, so this covers that read cycle, not just network/serial latency.
const PARAMS_TIMEOUT_MS = 5000;
const PARAMS_POLL_INTERVAL_MS = 250;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class State {
    view = $state(View.IDLE);
    values = $state({});
    error = $state(null);

    // Servos discovered by the last scan: [{ physicalId, appIdOffset, conflict }, ...]
    servos = $state([]);
    selectedPhysicalId = $state(null);

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
        this.servos = [];
        this.selectedPhysicalId = null;
    }

    async fetchServoList() {
        const response = await MSP.promise(MSPCodes.MSP_XACT_SERVO_LIST);
        return parseServoList(response.data);
    }

    async fetchParams(physicalId) {
        const response = await MSP.promise(MSPCodes.MSP_XACT_PARAMS, [physicalId]);
        return parseServoParams(response.data);
    }

    applyFoundParams(physicalId, params) {
        this.selectedPhysicalId = physicalId;
        this.values = params;
        this.initialValues = $state.snapshot(this.values);
        this.view = View.FORM;
    }

    async scan() {
        this.view = View.SCANNING;
        this.error = null;
        this.servos = [];

        try {
            await MSP.promise(MSPCodes.MSP_SET_XACT_SCAN);

            const deadline = Date.now() + SCAN_TIMEOUT_MS;
            let lastCount = 0;
            let stableSince = Date.now();

            while (Date.now() < deadline) {
                await delay(SCAN_POLL_INTERVAL_MS);
                this.servos = await this.fetchServoList();

                if (this.servos.length !== lastCount) {
                    lastCount = this.servos.length;
                    stableSince = Date.now();
                } else if (lastCount > 0 && Date.now() - stableSince > SCAN_SETTLE_MS) {
                    break;
                }
            }

            if (this.servos.length === 0) {
                this.view = View.NOT_FOUND;
            } else if (this.servos.length === 1) {
                await this.selectServo(this.servos[0].physicalId);
            } else {
                this.view = View.LIST;
            }
        } catch (err) {
            this.error = err?.message ?? String(err);
            this.view = View.NOT_FOUND;
        }
    }

    async rescan() {
        return this.scan();
    }

    // Fetch (waiting for) one discovered servo's full parameters, then show its form. Safe to
    // call directly from the servo list, or from scan() when exactly one servo was found.
    async selectServo(physicalId) {
        this.view = View.SCANNING;
        this.error = null;

        try {
            const deadline = Date.now() + PARAMS_TIMEOUT_MS;
            let params = await this.fetchParams(physicalId);
            while (!params.ready && Date.now() < deadline) {
                await delay(PARAMS_POLL_INTERVAL_MS);
                params = await this.fetchParams(physicalId);
            }

            if (params.ready) {
                this.applyFoundParams(physicalId, params);
            } else {
                this.view = this.servos.length > 1 ? View.LIST : View.NOT_FOUND;
            }
        } catch (err) {
            this.error = err?.message ?? String(err);
            this.view = this.servos.length > 1 ? View.LIST : View.NOT_FOUND;
        }
    }

    // Return to the servo list without a full rescan (only relevant when more than one servo
    // was discovered). The toolbar only allows this while not dirty, so edits aren't silently
    // discarded.
    backToList() {
        this.values = {};
        this.initialValues = null;
        this.selectedPhysicalId = null;
        this.view = View.LIST;
    }

    async onSave() {
        const payload = buildServoParamsPayload(this.selectedPhysicalId, this.values);
        await MSP.promise(MSPCodes.MSP_SET_XACT_PARAMS, Array.from(payload));
        this.initialValues = $state.snapshot(this.values);
    }

    onRevert() {
        this.values = { ...this.initialValues };
    }
}

export default new State();
