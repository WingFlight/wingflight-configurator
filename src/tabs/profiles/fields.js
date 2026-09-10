import { registerFields, when } from "@/js/relevance.js";

// Field registry for the profiles tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
registerFields({
  // PID gains table -- per-term columns and per-axis rows.
  "profiles.pidGains.p": {
    tier: "standard",
    tab: "profiles",
    labelKey: "profilesProportional",
    helpKey: "profilesProportionalHelp",
  },
  "profiles.pidGains.i": {
    tier: "standard",
    tab: "profiles",
    labelKey: "profilesIntegral",
    helpKey: "profilesIntegralHelp",
  },
  "profiles.pidGains.d": {
    tier: "standard",
    tab: "profiles",
    labelKey: "profilesDerivative",
    helpKey: "profilesDerivativeHelp",
  },
  "profiles.pidGains.f": {
    tier: "expert",
    tab: "profiles",
    labelKey: "profilesFeedforward",
    helpKey: "profilesFeedforwardHelp",
  },
  "profiles.pidGains.b": {
    tier: "expert",
    tab: "profiles",
    labelKey: "profilesBoost",
    helpKey: "profilesBoostHelp",
  },
  "profiles.pidGains.roll": {
    tier: "standard",
    tab: "profiles",
    labelKey: "axisROLL",
  },
  "profiles.pidGains.pitch": {
    tier: "standard",
    tab: "profiles",
    labelKey: "axisPITCH",
  },
  "profiles.pidGains.yaw": {
    tier: "standard",
    tab: "profiles",
    labelKey: "axisYAW",
    when: when.drivesYaw,
  },

  // Master gains -- one row per axis plus throttle (TPA); the gain-curve
  // column is a curves-tab concept and folds away below expert.
  "profiles.masterGains.roll": {
    tier: "standard",
    tab: "profiles",
    labelKey: "axisROLL",
    helpKey: "profilesMasterGainHelp",
  },
  "profiles.masterGains.pitch": {
    tier: "standard",
    tab: "profiles",
    labelKey: "axisPITCH",
    helpKey: "profilesMasterGainHelp",
  },
  "profiles.masterGains.yaw": {
    tier: "standard",
    tab: "profiles",
    labelKey: "axisYAW",
    helpKey: "profilesMasterGainHelp",
    when: when.drivesYaw,
  },
  "profiles.masterGains.throttle": {
    tier: "expert",
    tab: "profiles",
    labelKey: "controlAxisThrottle",
    helpKey: "profilesFwTpaHelp",
    when: when.hasMotors,
  },
  "profiles.masterGains.gainCurve": {
    tier: "expert",
    tab: "profiles",
    labelKey: "profilesGainCurveColumn",
    helpKey: "profilesGainCurveHelp",
  },

  // Whole sections whose fields are all expert with no relevance predicate.
  "profiles.leveling.section": {
    tier: "expert",
    tab: "profiles",
    labelKey: "profilesLevelingSettings",
  },
  "profiles.pidSettings.section": {
    tier: "expert",
    tab: "profiles",
    labelKey: "profilesPidSettings",
  },
  "profiles.pidBandwidth.section": {
    tier: "expert",
    tab: "profiles",
    labelKey: "profilesPidBandwidth",
  },
});
