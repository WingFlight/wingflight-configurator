import { registerFields, when } from "@/js/relevance.js";

// Field registry for the thrust_vector tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// Everything here is relevant only with a thrust-vector setup.
const tab = "thrust_vector";
const tv = when.hasThrustVector;

registerFields({
  // PID gains table -- per-term columns and per-axis rows.
  "thrust_vector.pidGains.p": {
    tier: "standard",
    tab,
    labelKey: "profilesProportional",
    helpKey: "profilesProportionalHelp",
    when: tv,
  },
  "thrust_vector.pidGains.i": {
    tier: "standard",
    tab,
    labelKey: "profilesIntegral",
    helpKey: "profilesIntegralHelp",
    when: tv,
  },
  "thrust_vector.pidGains.d": {
    tier: "standard",
    tab,
    labelKey: "profilesDerivative",
    helpKey: "profilesDerivativeHelp",
    when: tv,
  },
  "thrust_vector.pidGains.f": {
    tier: "expert",
    tab,
    labelKey: "profilesFeedforward",
    helpKey: "profilesFeedforwardHelp",
    when: tv,
  },
  "thrust_vector.pidGains.b": {
    tier: "expert",
    tab,
    labelKey: "profilesBoost",
    helpKey: "profilesBoostHelp",
    when: tv,
  },
  "thrust_vector.pidGains.roll": {
    tier: "standard",
    tab,
    labelKey: "axisROLL",
    when: tv,
  },
  "thrust_vector.pidGains.pitch": {
    tier: "standard",
    tab,
    labelKey: "axisPITCH",
    when: tv,
  },
  "thrust_vector.pidGains.yaw": {
    tier: "standard",
    tab,
    labelKey: "axisYAW",
    when: tv,
  },

  // Master gains -- one row per axis.
  "thrust_vector.masterGains.roll": {
    tier: "standard",
    tab,
    labelKey: "axisROLL",
    helpKey: "profilesMasterGainHelp",
    when: tv,
  },
  "thrust_vector.masterGains.pitch": {
    tier: "standard",
    tab,
    labelKey: "axisPITCH",
    helpKey: "profilesMasterGainHelp",
    when: tv,
  },
  "thrust_vector.masterGains.yaw": {
    tier: "standard",
    tab,
    labelKey: "axisYAW",
    helpKey: "profilesMasterGainHelp",
    when: tv,
  },

  // Hold mode -- the gain is a gain; the rest is tuning detail.
  "thrust_vector.hold.gain": {
    tier: "standard",
    tab,
    labelKey: "thrustVectorHoldGain",
    helpKey: "thrustVectorHoldGainHelp",
    when: tv,
  },
  "thrust_vector.hold.deadband": {
    tier: "expert",
    tab,
    labelKey: "thrustVectorHoldDeadband",
    helpKey: "thrustVectorHoldDeadbandHelp",
    when: tv,
  },
  "thrust_vector.hold.maxRate": {
    tier: "expert",
    tab,
    labelKey: "thrustVectorHoldMaxRate",
    helpKey: "thrustVectorHoldMaxRateHelp",
    when: tv,
  },

  // PID settings -- the whole section is expert.
  "thrust_vector.pidSettings.section": {
    tier: "expert",
    tab,
    labelKey: "thrustVectorPidSettings",
    when: tv,
  },
});
