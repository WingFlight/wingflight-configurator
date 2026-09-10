import { registerFields, when } from "@/js/relevance.js";

// Field registry for the gyro tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
registerFields({
  // Lowpass filter 1 -- the one filter everybody touches.
  "gyro.lowpass1.enable": {
    tier: "standard",
    tab: "gyro",
    labelKey: "genericEnable",
    helpKey: "gyroLowpassFilterHelp",
  },
  "gyro.lowpass1.type": {
    tier: "expert",
    tab: "gyro",
    labelKey: "gyroLowpassType",
  },
  "gyro.lowpass1.frequency": {
    tier: "standard",
    tab: "gyro",
    labelKey: "gyroLowpassFrequency",
    helpKey: "gyroLowpassFilterHelp",
  },
  "gyro.lowpass1.dynamicCutoff": {
    tier: "expert",
    tab: "gyro",
    labelKey: "gyroLowpassDynamicCutoff",
  },
  "gyro.lowpass1.dynMinFrequency": {
    tier: "standard",
    tab: "gyro",
    labelKey: "gyroLowpassDynMinFrequency",
  },
  "gyro.lowpass1.dynMaxFrequency": {
    tier: "standard",
    tab: "gyro",
    labelKey: "gyroLowpassDynMaxFrequency",
  },

  // Whole sub-sections/sections whose fields are all expert.
  "gyro.lowpass2.section": {
    tier: "expert",
    tab: "gyro",
    labelKey: "gyroLowpassFilter2",
  },
  "gyro.notch.section": {
    tier: "expert",
    tab: "gyro",
    labelKey: "gyroNotchFilterHeading",
    helpKey: "gyroNotchFilterHelp",
  },
  "gyro.dynamicNotch.section": {
    tier: "expert",
    tab: "gyro",
    labelKey: "gyroDynamicFilterHeading",
    helpKey: "gyroDynamicFilterHelp",
  },

  // RPM filter -- needs a motor to read RPM from.
  "gyro.rpmFilter.section": {
    tier: "expert",
    tab: "gyro",
    labelKey: "gyroRpmFilterSettings",
    helpKey: "gyroRpmFilterHelp",
    when: when.hasMotors,
  },
  "gyro.rpmFilter.minFreq": {
    tier: "expert",
    tab: "gyro",
    labelKey: "gyroRpmFilterMinFreq",
    helpKey: "gyroRpmFilterMinFreqHelp",
    when: when.hasMotors,
  },
  "gyro.rpmFilter.customNotches": {
    tier: "expert",
    tab: "gyro",
    labelKey: "gyroRpmFilterBanks",
    when: when.hasMotors,
  },
});
