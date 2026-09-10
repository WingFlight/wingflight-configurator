import { registerFields } from "@/js/relevance.js";

// Field registry for the sensors tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// The raw sensor graphs and their on/off toggles are diagnostics, not
// settings, and stay untagged. Only the per-graph refresh-rate and scale
// selects are registered (expert); they are rendered by SensorPanel for every
// graph, so one id covers each control kind.
registerFields({
  "sensors.graph.refreshRate": {
    tier: "expert",
    tab: "sensors",
    labelKey: "sensorsRefresh",
  },
  "sensors.graph.scale": {
    tier: "expert",
    tab: "sensors",
    labelKey: "sensorsScale",
  },
});
