import { registerFields, when } from "@/js/relevance.js";

// Field registry for the configuration tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
registerFields({
  // Personalisation
  "configuration.personalisation.craftName": {
    tier: "standard",
    tab: "configuration",
    labelKey: "craftName",
  },
  "configuration.personalisation.modelId": {
    tier: "standard",
    tab: "configuration",
    labelKey: "configuration.personalisation.model_id.label",
  },

  // Flight statistics (the whole section folds under the enable switch)
  "configuration.flightStats.enable": {
    tier: "expert",
    tab: "configuration",
    labelKey: "configuration.flight_stats.enable.label",
  },
  "configuration.flightStats.minArmedTime": {
    tier: "expert",
    tab: "configuration",
    labelKey: "configuration.flight_stats.min_armed_time.label",
    helpKey: "configuration.flight_stats.min_armed_time.help",
  },

  // System
  "configuration.system.gyroFrequency": {
    tier: "expert",
    tab: "configuration",
    labelKey: "configurationGyroSyncDenom",
  },
  "configuration.system.pidDenom": {
    tier: "expert",
    tab: "configuration",
    labelKey: "configurationPidProcessDenom",
    helpKey: "configurationPidProcessDenomHelp",
  },
  "configuration.system.accHardware": {
    tier: "expert",
    tab: "configuration",
    labelKey: "configurationAccHardware",
    helpKey: "configurationAccHardwareHelp",
  },
  "configuration.system.baroHardware": {
    tier: "expert",
    tab: "configuration",
    labelKey: "configurationBaroHardware",
    helpKey: "configurationBaroHardwareHelp",
  },
  "configuration.system.magHardware": {
    tier: "expert",
    tab: "configuration",
    labelKey: "configurationMagHardware",
    helpKey: "configurationMagHardwareHelp",
  },
  "configuration.system.wiggleReady": {
    tier: "standard",
    tab: "configuration",
    labelKey: "configurationWiggleReady",
    helpKey: "configurationWiggleReadyHelp",
  },

  // Other features. These switches are how a peripheral becomes relevant,
  // so they carry no relevance predicate of their own.
  "configuration.features.gps": {
    tier: "standard",
    tab: "configuration",
    labelKey: "feature_GPS",
    helpKey: "featureTip_GPS",
  },
  "configuration.features.ledStrip": {
    tier: "standard",
    tab: "configuration",
    labelKey: "feature_LED_STRIP",
    helpKey: "featureTip_LED_STRIP",
  },
  "configuration.features.thrustVector": {
    tier: "expert",
    tab: "configuration",
    labelKey: "feature_THRUST_VECTOR",
    helpKey: "featureTip_THRUST_VECTOR",
  },

  // Serial ports (one row per UART; function column standard, baud expert)
  "configuration.serialPorts.function": {
    tier: "standard",
    tab: "configuration",
    labelKey: "configurationSerialPorts",
    helpKey: "configurationSerialPortsHelp",
  },
  "configuration.serialPorts.baudrate": {
    tier: "expert",
    tab: "configuration",
    label: "Baud rate",
  },

  // Board alignment
  "configuration.boardAlignment.roll": {
    tier: "essential",
    tab: "configuration",
    labelKey: "configurationBoardAlignmentRoll",
    helpKey: "configurationBoardAlignmentSectionHelp",
  },
  "configuration.boardAlignment.pitch": {
    tier: "essential",
    tab: "configuration",
    labelKey: "configurationBoardAlignmentPitch",
    helpKey: "configurationBoardAlignmentSectionHelp",
  },
  "configuration.boardAlignment.yaw": {
    tier: "essential",
    tab: "configuration",
    labelKey: "configurationBoardAlignmentYaw",
    helpKey: "configurationBoardAlignmentSectionHelp",
  },
  "configuration.boardAlignment.mountTrim": {
    tier: "standard",
    tab: "configuration",
    labelKey: "configurationBoardMountTrim",
    helpKey: "configurationBoardMountTrimHelp",
  },
  "configuration.boardAlignment.magAlign": {
    tier: "expert",
    tab: "configuration",
    labelKey: "configurationSensorAlignmentMag",
    when: when.hasMagnetometer,
  },

  // Accelerometer trims
  "configuration.accelTrims.roll": {
    tier: "standard",
    tab: "configuration",
    labelKey: "configurationAccelTrimRoll",
    helpKey: "configurationAccelRollTrimHelp",
  },
  "configuration.accelTrims.pitch": {
    tier: "standard",
    tab: "configuration",
    labelKey: "configurationAccelTrimPitch",
    helpKey: "configurationAccelPitchTrimHelp",
  },
});
