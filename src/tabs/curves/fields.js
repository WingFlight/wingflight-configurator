import { registerFields } from "@/js/relevance.js";

// Field registry for the curves tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components.
//
// The whole curve editor (category tabs, curve selector, plot and point
// table) is one expert-tier group: curves only matter once a mixer rule or
// gain references one.
registerFields({
  "curves.editor.curves": { tier: "expert", tab: "curves", labelKey: "tabCurves", helpKey: "curveEditorHint" },
});
