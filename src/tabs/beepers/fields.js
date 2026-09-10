import { registerFields, when } from "@/js/relevance.js";

// Field registry for the beepers tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// The beeper condition list is one switch per firmware beeper; it is
// registered as a single section-level field because every row shares the
// same tier and predicate. The DShot beacon plays through the motors, so it is
// irrelevant on a glider (when.hasMotors).
registerFields({
  "beepers.beeper.conditions": {
    tier: "standard",
    tab: "beepers",
    labelKey: "configurationBeeper",
    helpKey: "configurationBeeperHelp",
  },
  "beepers.dshotBeacon.tone": {
    tier: "expert",
    tab: "beepers",
    labelKey: "configurationDshotBeaconTone",
    when: when.hasMotors,
  },
  "beepers.dshotBeacon.conditions": {
    tier: "expert",
    tab: "beepers",
    labelKey: "configurationDshotBeeper",
    helpKey: "configurationDshotBeaconHelp",
    when: when.hasMotors,
  },
});
