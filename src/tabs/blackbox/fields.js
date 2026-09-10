import { registerFields, when } from "@/js/relevance.js";

// Field registry for the blackbox tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// The device select is what turns blackbox on, so it is always relevant; every
// other setting only matters once a logging device is chosen (when.hasBlackbox).
// The flash/SD summaries and erase/save buttons are actions and stay untagged.
registerFields({
  // Configuration
  "blackbox.configuration.device": {
    tier: "standard",
    tab: "blackbox",
    labelKey: "blackboxDevice",
    helpKey: "blackboxDeviceHelp",
  },
  "blackbox.configuration.mode": {
    tier: "standard",
    tab: "blackbox",
    labelKey: "blackboxMode",
    helpKey: "blackboxModeHelp",
    when: when.hasBlackbox,
  },
  "blackbox.configuration.rate": {
    tier: "standard",
    tab: "blackbox",
    labelKey: "blackboxRateOfLogging",
    helpKey: "blackboxRateOfLoggingHelp",
    when: when.hasBlackbox,
  },
  "blackbox.configuration.gracePeriod": {
    tier: "expert",
    tab: "blackbox",
    labelKey: "blackboxGracePeriod",
    helpKey: "blackboxGracePeriodHelp",
    when: when.hasBlackbox,
  },
  "blackbox.configuration.debugMode": {
    tier: "expert",
    tab: "blackbox",
    labelKey: "blackboxDebugMode",
    helpKey: "blackboxDebugModeHelp",
  },
  "blackbox.configuration.debugAxis": {
    tier: "expert",
    tab: "blackbox",
    labelKey: "blackboxDebugAxis",
    helpKey: "blackboxDebugAxisHelp",
  },
  "blackbox.configuration.initialErase": {
    tier: "expert",
    tab: "blackbox",
    labelKey: "blackboxInitialErase",
    helpKey: "blackboxInitialEraseHelp",
    when: when.hasBlackbox,
  },
  "blackbox.configuration.rollingErase": {
    tier: "expert",
    tab: "blackbox",
    labelKey: "blackboxRollingErase",
    helpKey: "blackboxRollingEraseHelp",
    when: when.hasBlackbox,
  },

  // Logged fields (whole section: one tier, one predicate)
  "blackbox.options.fields": {
    tier: "expert",
    tab: "blackbox",
    labelKey: "blackboxOptions",
    when: when.hasBlackbox,
  },
});
