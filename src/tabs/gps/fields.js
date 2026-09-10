import { registerFields, when } from "@/js/relevance.js";

// Field registry for the gps tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// Everything here only matters once the GPS feature is on (when.hasGps). The
// live status table, satellite signal table and map are read-outs, not
// settings, and stay untagged.
registerFields({
  // Configuration
  "gps.configuration.protocol": {
    tier: "standard",
    tab: "gps",
    labelKey: "configurationGPSProtocol",
    when: when.hasGps,
  },
  "gps.configuration.ubxSbas": {
    tier: "expert",
    tab: "gps",
    labelKey: "configurationGPSubxSbas",
    when: when.hasGps,
  },
  "gps.configuration.autoBaud": {
    tier: "standard",
    tab: "gps",
    labelKey: "configurationGPSAutoBaud",
    when: when.hasGps,
  },
  "gps.configuration.autoConfig": {
    tier: "standard",
    tab: "gps",
    labelKey: "configurationGPSAutoConfig",
    when: when.hasGps,
  },
  "gps.configuration.ubloxGalileo": {
    tier: "expert",
    tab: "gps",
    labelKey: "configurationGPSGalileo",
    helpKey: "configurationGPSGalileoHelp",
    when: when.hasGps,
  },
  "gps.configuration.homePointOnce": {
    tier: "expert",
    tab: "gps",
    labelKey: "configurationGPSHomeOnce",
    helpKey: "configurationGPSHomeOnceHelp",
    when: when.hasGps,
  },
});
