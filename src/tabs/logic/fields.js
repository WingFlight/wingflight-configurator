import { registerFields } from "@/js/relevance.js";

// Field registry for the logic tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// Logic conditions are expert territory as a whole: the conditions section
// (add button, condition rows) folds away under a single id.
registerFields({
  "logic.conditions.list": {
    tier: "expert",
    tab: "logic",
    labelKey: "logicConditionsTitle",
    helpKey: "logicNote",
  },
  // Modes in FlightMode.EXPERT_MODES are filtered out of the operand mode
  // pick-list below this tier. Consulted from JS via visible(), not a
  // <Tier> wrapper. Same treatment as auxiliary.modes.expertModes.
  "logic.conditions.expertModes": {
    tier: "expert",
    tab: "logic",
    label: "Expert-only modes",
  },
});
