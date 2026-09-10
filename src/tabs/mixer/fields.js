import { registerFields, when } from "@/js/relevance.js";

// Field registry for the mixer tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components.
registerFields({
  // Model type picker (ModelTypePicker.svelte)
  "mixer.model.type": { tier: "essential", tab: "mixer", labelKey: "mixerModelTypeTitle" },

  // Airframe drawing derived from the loaded rules
  "mixer.airframe.canvas": {
    tier: "standard",
    tab: "mixer",
    labelKey: "mixerAirframeCanvas",
    helpKey: "mixerAirframeCanvasHelp",
  },

  // Rules: the read-only per-output summary + "Edit Configuration" for named
  // model types; the raw rule editor for the Custom type.
  "mixer.rules.summary": {
    tier: "essential",
    tab: "mixer",
    labelKey: "mixerEditConfiguration",
    when: when.not(when.isCustomMixer),
  },
  "mixer.rules.table": { tier: "expert", tab: "mixer", labelKey: "mixerRulesTitle", when: when.isCustomMixer },

  // Per-axis stabilised input gain / inversion (AxisConfig.svelte)
  "mixer.axis.gain": { tier: "expert", tab: "mixer", labelKey: "mixerAxisGainTitle", helpKey: "mixerAxisGainHelp" },
  "mixer.axis.invert": {
    tier: "expert",
    tab: "mixer",
    labelKey: "mixerAxisInvertTitle",
    helpKey: "mixerAxisInvertHelp",
  },

  // Control surface override (OverridePanel.svelte)
  "mixer.override.panel": { tier: "expert", tab: "mixer", labelKey: "mixerOverrideTitle" },
});
