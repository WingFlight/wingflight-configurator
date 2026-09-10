import { registerFields, when } from "@/js/relevance.js";

// Field registry for the fbus_sensors tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// The tab lists sensors seen on the FBUS master port (read-only) and has a
// single setting per row: the "forwarded" switch. That column is registered
// once as the tab's only field, expert and relevant only when a port carries
// the FBUS/S.Port master (when.hasBusServos). The clear button is an action.
registerFields({
  "fbus_sensors.sensors.forwarded": {
    tier: "expert",
    tab: "fbus_sensors",
    labelKey: "fbusSensorsColForwarded",
    when: when.hasBusServos,
  },
});
