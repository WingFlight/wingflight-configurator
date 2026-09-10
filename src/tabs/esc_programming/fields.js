import { registerFields, when } from "@/js/relevance.js";

// Field registry for the esc_programming tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// The whole tab is expert and only relevant with motors (when.hasMotors). The
// parameter form is generated from per-manufacturer JSON with hard-coded
// English page/field titles, so it is registered once as a section; the
// manufacturer picker (the entry point of the flow) is registered separately
// so the tab folds away as a unit on a glider.
registerFields({
  "esc_programming.picker.manufacturer": {
    tier: "expert",
    tab: "esc_programming",
    labelKey: "escProgrammingSelectManufacturer",
    when: when.hasMotors,
  },
  "esc_programming.form.parameters": {
    tier: "expert",
    tab: "esc_programming",
    labelKey: "tabEscProgramming",
    when: when.hasMotors,
  },
});
