import diff from "microdiff";

import { FC } from "@/js/fc.svelte.js";
import { MSPCodes } from "@/js/msp/MSPCodes.js";

import {
    autoProgramValues,
    buildMuxOverridePayload,
    fbusChannels,
    isolateChannelModes,
    otherDevicePhysicalIds,
    planAutoProgram,
    servoSettingsMismatch,
} from "./mux_programming.js";
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
// firmware reads every discovered servo's parameters in the background as soon as it finds
// them, but selecting a servo still (re)starts its read to be sure of a fresh value, so this
// covers a full read cycle, not just serial latency.
const PARAMS_TIMEOUT_MS = 5000;
const PARAMS_POLL_INTERVAL_MS = 250;

// The firmware reads every discovered servo's parameters in the background, so by the time the
// list is shown most rows are usually already "ready" -- but a servo found right at the end of
// the scan window might not be yet. Keep refreshing the list for a bit so those rows fill in
// (e.g. Channel) without the user needing to rescan, stopping once everything is ready or the
// user has navigated away from the list.
const LIST_REFRESH_TIMEOUT_MS = 4000;
const LIST_REFRESH_INTERVAL_MS = 500;

// FBUS mux override (MSP2_WING_SET_FBUS_MUX_OVERRIDE): the firmware drops it this long after
// the last refresh, so a closed tab or lost link can't leave the outputs switched.
const MUX_OVERRIDE_TIMEOUT_MS = 3000;
const MUX_OVERRIDE_REFRESH_MS = 1000;

// Auto-programming steps (see autoProgramSurvey/autoProgramApply)
export const AutoProgramPhase = {
    SURVEY: "survey",
    REVIEW: "review",
    PROGRAMMING: "programming",
    DONE: "done",
};

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class State {
    view = $state(View.IDLE);
    values = $state({});
    error = $state(null);

    // Servos discovered by the last scan: [{ physicalId, appIdOffset, conflict, ready, channel }]
    servos = $state([]);
    selectedPhysicalId = $state(null);

    // FBUS mux boards only: the output (1-based mux channel) scans and writes go to, with FBUS
    // put on it alone by a held override; null for every FBUS output together (saved modes).
    muxChannel = $state(null);
    #muxOverrideTimer = null;
    #muxOverrideModes = null;

    // Auto-programming in progress or finished: { phase, current, plan, results }, else null
    autoProgram = $state(null);

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
        this.autoProgram = null;
    }

    // Puts the mux in `modes` and keeps it there until endMuxOverride(). Throws if the FC
    // refuses (armed, FPGA not ready, or the FPGA didn't confirm the modes).
    async holdMuxOverride(modes) {
        this.#muxOverrideModes = modes;
        await this.#sendMuxOverride();
        if (!this.#muxOverrideTimer) {
            this.#muxOverrideTimer = setInterval(() => {
                this.#sendMuxOverride().catch((err) => {
                    console.error("xact_servo: FBUS mux override refresh failed", err);
                });
            }, MUX_OVERRIDE_REFRESH_MS);
        }
    }

    async #sendMuxOverride() {
        const payload = buildMuxOverridePayload(MUX_OVERRIDE_TIMEOUT_MS, this.#muxOverrideModes);
        const response = await MSP.promise(MSPCodes.MSP2_WING_SET_FBUS_MUX_OVERRIDE, payload);
        if (!response || response.unsupported) {
            throw new Error("the FBUS mux refused the output modes");
        }
    }

    async endMuxOverride() {
        clearInterval(this.#muxOverrideTimer);
        this.#muxOverrideTimer = null;
        if (this.#muxOverrideModes) {
            this.#muxOverrideModes = null;
            await MSP.promise(MSPCodes.MSP2_WING_SET_FBUS_MUX_OVERRIDE, buildMuxOverridePayload(0));
        }
    }

    // Scans and writes go to `channel` alone (null: every FBUS output, as saved). The servos
    // found before are on another output now, so the list starts over.
    async selectMuxChannel(channel) {
        this.reset();
        this.muxChannel = channel;
        try {
            if (channel === null) {
                await this.endMuxOverride();
            } else {
                await this.holdMuxOverride(isolateChannelModes(FC.FBUS_MUX, channel));
            }
        } catch (err) {
            this.muxChannel = null;
            this.error = err?.message ?? String(err);
            await this.endMuxOverride();
        }
    }

    // Leaving the tab: back to the saved modes
    async releaseMux() {
        this.muxChannel = null;
        await this.endMuxOverride();
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
            await this.discoverServos((servos) => {
                this.servos = servos;
            });

            if (this.servos.length === 0) {
                this.view = View.NOT_FOUND;
            } else if (this.servos.length === 1) {
                await this.selectServo(this.servos[0].physicalId);
            } else {
                this.view = View.LIST;
                this.refreshListInBackground();
            }
        } catch (err) {
            this.error = err?.message ?? String(err);
            this.view = View.NOT_FOUND;
        }
    }

    async rescan() {
        return this.scan();
    }

    // Restarts discovery and polls the list until it has settled, calling onUpdate with
    // every poll's list. Returns the final list.
    async discoverServos(onUpdate = () => {}) {
        await MSP.promise(MSPCodes.MSP_SET_XACT_SCAN);

        const deadline = Date.now() + SCAN_TIMEOUT_MS;
        let servos = [];
        let lastCount = 0;
        let stableSince = Date.now();

        while (Date.now() < deadline) {
            await delay(SCAN_POLL_INTERVAL_MS);
            servos = await this.fetchServoList();
            onUpdate(servos);

            if (servos.length !== lastCount) {
                lastCount = servos.length;
                stableSince = Date.now();
            } else if (lastCount > 0 && Date.now() - stableSince > SCAN_SETTLE_MS) {
                break;
            }
        }
        return servos;
    }

    // A discovered servo's parameters once its read has completed, or null
    async waitForParams(physicalId) {
        const deadline = Date.now() + PARAMS_TIMEOUT_MS;
        let params = await this.fetchParams(physicalId);
        while (!params.ready && Date.now() < deadline) {
            await delay(PARAMS_POLL_INTERVAL_MS);
            params = await this.fetchParams(physicalId);
        }
        return params.ready ? params : null;
    }

    // Auto-programming, step 1: visit every output saved as FBUS on its own and note the
    // servos (with their parameters) and other FBUS devices there, then plan the changes
    // (see mux_programming.js planAutoProgram) for the user to review.
    async autoProgramSurvey() {
        this.reset();
        this.autoProgram = { phase: AutoProgramPhase.SURVEY, current: null, plan: [], results: [] };

        try {
            // Devices seen before (e.g. on an output saved as PWM) won't share the bus, so
            // only count the ones the survey finds
            await MSP.promise(MSPCodes.MSP2_WING_CLEAR_FBUS_SENSORS);

            const survey = [];
            for (const channel of fbusChannels(FC.FBUS_MUX)) {
                this.autoProgram.current = channel;
                await this.holdMuxOverride(isolateChannelModes(FC.FBUS_MUX, channel));

                const found = await this.discoverServos();
                const servos = [];
                for (const servo of found) {
                    const params = await this.waitForParams(servo.physicalId);
                    servos.push(params ? { ...servo, ...params } : servo);
                }
                survey.push({ channel, servos });
            }

            await MSP.promise(MSPCodes.MSP2_WING_FBUS_SENSORS);
            const plan = planAutoProgram(survey, otherDevicePhysicalIds(FC.FBUS_SENSORS));
            this.autoProgram = { phase: AutoProgramPhase.REVIEW, current: null, plan, results: [] };
        } catch (err) {
            this.error = err?.message ?? String(err);
            this.autoProgram = null;
        } finally {
            await this.endMuxOverride();
            this.muxChannel = null;
        }
    }

    // Auto-programming, step 2: write each planned servo on its own output, then rescan that
    // output and check the servo answers with the new values.
    async autoProgramApply() {
        const plan = this.autoProgram.plan;
        this.autoProgram = { phase: AutoProgramPhase.PROGRAMMING, current: null, plan, results: [] };

        try {
            for (const entry of plan) {
                if (entry.status !== "program") {
                    this.autoProgram.results.push({ channel: entry.channel, status: entry.status });
                    continue;
                }

                this.autoProgram.current = entry.channel;
                await this.holdMuxOverride(isolateChannelModes(FC.FBUS_MUX, entry.channel));
                this.autoProgram.results.push({
                    channel: entry.channel,
                    status: await this.#programServo(entry),
                });
            }
            this.autoProgram.phase = AutoProgramPhase.DONE;
            this.autoProgram.current = null;
        } catch (err) {
            this.error = err?.message ?? String(err);
            this.autoProgram.phase = AutoProgramPhase.DONE;
        } finally {
            await this.endMuxOverride();
            this.muxChannel = null;
        }
    }

    async #programServo(entry) {
        // The survey's discovery list was replaced by the next output's, so find it again
        const found = await this.discoverServos();
        const servo = found.find((s) => s.physicalId === entry.servo.physicalId);
        const params = found.length === 1 && servo ? await this.waitForParams(servo.physicalId) : null;
        if (!params) return "failed";

        const values = autoProgramValues(params, entry.target);
        const payload = buildServoParamsPayload(servo.physicalId, values);
        await MSP.promise(MSPCodes.MSP_SET_XACT_PARAMS, Array.from(payload));

        // Read back from the servo itself after a fresh discovery, not the firmware's cache,
        // and check every setting, so one the write wasn't meant to touch can't change unseen
        const after = await this.discoverServos();
        const check = after.length === 1 ? await this.waitForParams(after[0].physicalId) : null;
        return check && servoSettingsMismatch(values, check).length === 0 ? "programmed" : "failed";
    }

    closeAutoProgram() {
        this.autoProgram = null;
    }

    // Keep polling the servo list for a while so rows fill in (e.g. Channel) as the firmware's
    // background read reaches each one, without a full rescan. Stops on its own once every
    // servo is ready, once LIST_REFRESH_TIMEOUT_MS has passed, or once the user has navigated
    // away from the list (selected a servo, rescanned, etc.).
    async refreshListInBackground() {
        const deadline = Date.now() + LIST_REFRESH_TIMEOUT_MS;

        while (
            this.view === View.LIST &&
            this.servos.some((servo) => !servo.ready) &&
            Date.now() < deadline
        ) {
            await delay(LIST_REFRESH_INTERVAL_MS);
            if (this.view !== View.LIST) return;
            this.servos = await this.fetchServoList();
        }
    }

    // Fetch (waiting for) one discovered servo's full parameters, then show its form. Safe to
    // call directly from the servo list, or from scan() when exactly one servo was found.
    async selectServo(physicalId) {
        this.view = View.SCANNING;
        this.error = null;

        try {
            const params = await this.waitForParams(physicalId);

            if (params) {
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
    // discarded. Always re-fetches once so a just-saved change (e.g. a new Channel) shows up
    // immediately -- refreshListInBackground() alone wouldn't do it, since it only keeps
    // polling while some row isn't ready yet, which won't be true once everything's already
    // been read.
    async backToList() {
        this.values = {};
        this.initialValues = null;
        this.selectedPhysicalId = null;
        this.view = View.LIST;
        this.servos = await this.fetchServoList();
        this.refreshListInBackground();
    }

    async onSave() {
        const payload = buildServoParamsPayload(this.selectedPhysicalId, this.values);
        await MSP.promise(MSPCodes.MSP_SET_XACT_PARAMS, Array.from(payload));

        // If this save renamed the servo's own Physical ID, the firmware now tracks it under
        // the new one (see fbus_xact.c's XACT_FIELD_PHYSICAL_ID write) -- follow the rename so
        // the verification re-fetch below, and anything afterwards (Save again, back to list),
        // addresses the servo correctly instead of a Physical ID nothing answers to anymore.
        this.selectedPhysicalId = this.values.physicalId;

        // The firmware can silently refuse the write (e.g. this servo shares its App ID with
        // another discovered one -- see fbusXactHasDuplicateAppId()) while still ACK'ing the
        // MSP frame itself, so trusting `this.values` as "now saved" would hide that. Re-fetch
        // from the firmware's own cache instead: a refused write shows up as the values not
        // having actually changed.
        this.values = await this.fetchParams(this.selectedPhysicalId);
        this.initialValues = $state.snapshot(this.values);

        // Refresh the discovered-servo list too -- it drives the form's live Physical ID/App
        // ID collision checks, and a stale entry for this same servo's pre-save identity would
        // otherwise look like a collision with itself after a rename.
        this.servos = await this.fetchServoList();
    }

    onRevert() {
        this.values = { ...this.initialValues };
    }
}

export default new State();
