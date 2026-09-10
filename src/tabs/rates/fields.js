import { registerFields, when } from "@/js/relevance.js";

// Field registry for the rates tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
registerFields({
  // Rates table -- per-axis rows and per-parameter columns.
  "rates.rates.roll": {
    tier: "standard",
    tab: "rates",
    labelKey: "axisROLL",
  },
  "rates.rates.pitch": {
    tier: "standard",
    tab: "rates",
    labelKey: "axisPITCH",
  },
  "rates.rates.yaw": {
    tier: "standard",
    tab: "rates",
    labelKey: "axisYAW",
    when: when.drivesYaw,
  },
  "rates.rates.rate": {
    tier: "standard",
    tab: "rates",
    labelKey: "rateSetupRotorflightRate",
    helpKey: "rateSetupTuningHelp",
  },
  "rates.rates.shape": {
    tier: "standard",
    tab: "rates",
    labelKey: "rateSetupRotorflightShape",
    helpKey: "rateSetupTuningHelp",
  },
  "rates.rates.expo": {
    tier: "standard",
    tab: "rates",
    labelKey: "rateSetupRotorflightExpo",
    helpKey: "rateSetupTuningHelp",
  },

  // Dynamics -- the whole section is expert; yaw-only rows and the yaw
  // column additionally need a yaw output in the mixer.
  "rates.dynamics.section": {
    tier: "expert",
    tab: "rates",
    labelKey: "rateSetupDynamic",
  },
  "rates.dynamics.yaw": {
    tier: "expert",
    tab: "rates",
    labelKey: "axisYAW",
    when: when.drivesYaw,
  },
  "rates.dynamics.responseTime": {
    tier: "expert",
    tab: "rates",
    labelKey: "rateSetupResponse",
    helpKey: "rateSetupResponseHelp",
  },
  "rates.dynamics.setpointBoostGain": {
    tier: "expert",
    tab: "rates",
    labelKey: "rateSetpointBoostGain",
    helpKey: "rateSetpointBoostGainHelp",
  },
  "rates.dynamics.setpointBoostCutoff": {
    tier: "expert",
    tab: "rates",
    labelKey: "rateSetpointBoostCutoff",
  },
  "rates.dynamics.yawDynamicCeilingGain": {
    tier: "expert",
    tab: "rates",
    labelKey: "rateYawDynamicCeilingGain",
    helpKey: "rateYawDynamicCeilingGainHelp",
    when: when.drivesYaw,
  },
  "rates.dynamics.yawDynamicDeadbandGain": {
    tier: "expert",
    tab: "rates",
    labelKey: "rateYawDynamicDeadbandGain",
    helpKey: "rateYawDynamicDeadbandGainHelp",
    when: when.drivesYaw,
  },
  "rates.dynamics.yawDynamicDeadbandFilter": {
    tier: "expert",
    tab: "rates",
    labelKey: "rateYawDynamicDeadbandFilter",
    when: when.drivesYaw,
  },
});
