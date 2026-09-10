import { registerFields } from "@/js/relevance.js";

// Field registry for the status tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// The status tab is read-only telemetry (board info, battery, attitude,
// receiver bars, arming flags). Its only controls are the arm-enable switch
// (an action with a confirmation dialog) and the yaw-reset button; neither is
// a persisted setting, so nothing is registered here.
registerFields({});
