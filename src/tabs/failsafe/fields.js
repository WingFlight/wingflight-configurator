import { registerFields } from "@/js/relevance.js";

// Field registry for the failsafe tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components.
registerFields({
  // Pulse width limits (min + max) -- previously behind <Expert>. Standard
  // rather than expert so the tab is not empty below the expert level: the
  // valid pulse window is what decides when failsafe triggers.
  "failsafe.pulse.range": {
    tier: "standard",
    tab: "failsafe",
    labelKey: "failsafePulsrangeTitle",
    helpKey: "failsafePulsrangeHelp",
  },
  // Per-channel fallback (Auto / Hold / Set) for every RC channel; one
  // group because the rows are generated per channel.
  "failsafe.fallback.channels": {
    tier: "standard",
    tab: "failsafe",
    labelKey: "failsafeChannelFallbackSettingsTitle",
    helpKey: "failsafeChannelFallbackSettingsHelp",
  },
});
