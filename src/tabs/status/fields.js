import { registerFields } from "@/js/relevance.js";

// Field registry for the status tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
registerFields({});
