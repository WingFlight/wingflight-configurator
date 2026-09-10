import { registerFields } from "@/js/relevance.js";

// Field registry for the adjustments tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// In-flight adjustments are expert territory as a whole: the slot list
// (add button, slot cards with their channel/range/function fields) folds
// away under a single id.
registerFields({
  "adjustments.slots.list": {
    tier: "expert",
    tab: "adjustments",
    labelKey: "tabAdjustments",
    helpKey: "adjustmentsHelp",
  },
});
