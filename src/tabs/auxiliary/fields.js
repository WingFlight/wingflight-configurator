import { registerFields } from "@/js/relevance.js";

// Field registry for the auxiliary tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
registerFields({
  // The mode list itself (ARM lives here) and its channel ranges are how a
  // model gets armed at all.
  "auxiliary.modes.card": {
    tier: "essential",
    tab: "auxiliary",
    labelKey: "tabAuxiliary",
    helpKey: "auxiliaryHelp",
  },
  "auxiliary.modes.range": {
    tier: "essential",
    tab: "auxiliary",
    labelKey: "auxiliaryAddRange",
  },
  "auxiliary.modes.link": {
    tier: "standard",
    tab: "auxiliary",
    labelKey: "auxiliaryAddLink",
  },
  // Modes in FlightMode.EXPERT_MODES (blackbox, beeper, failsafe, prearm,
  // trainer, ...) are filtered out of the list below this tier. Consulted
  // from JS via visible(), not a <Tier> wrapper.
  "auxiliary.modes.expertModes": {
    tier: "expert",
    tab: "auxiliary",
    label: "Expert-only modes",
  },
});
