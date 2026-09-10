import { registerFields, when } from "@/js/relevance.js";

// Field registry for the receiver tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components.
registerFields({
  // Receiver selection (ReceiverType.svelte)
  "receiver.selection.protocol": {
    tier: "essential",
    tab: "receiver",
    labelKey: "receiverProtocol",
  },
  "receiver.selection.serialInverted": {
    tier: "expert",
    tab: "receiver",
    labelKey: "receiverSerialInverted",
    helpKey: "receiverSerialInvertedHelp",
    when: when.serialLink,
  },
  "receiver.selection.serialHalfDuplex": {
    tier: "expert",
    tab: "receiver",
    labelKey: "receiverSerialHalfDuplex",
    helpKey: "receiverSerialHalfDuplexHelp",
    when: when.serialLink,
  },
  "receiver.selection.serialPinSwap": {
    tier: "expert",
    tab: "receiver",
    labelKey: "receiverSerialPinSwap",
    helpKey: "receiverSerialPinSwapHelp",
    when: when.serialLink,
  },

  // Serial RX #2 / backup input (Receiver.svelte). The section only renders
  // when a port carries RX_INPUT_BACKUP; that port is serial whatever the
  // primary link is, so no link predicate here.
  "receiver.backup.provider": {
    tier: "expert",
    tab: "receiver",
    labelKey: "receiverBackupRxProvider",
  },
  "receiver.backup.inverted": {
    tier: "expert",
    tab: "receiver",
    labelKey: "receiverBackupRxInverted",
    helpKey: "receiverBackupRxInvertedHelp",
  },
  "receiver.backup.halfDuplex": {
    tier: "expert",
    tab: "receiver",
    labelKey: "receiverBackupRxHalfDuplex",
    helpKey: "receiverBackupRxHalfDuplexHelp",
  },
  "receiver.backup.pinSwap": {
    tier: "expert",
    tab: "receiver",
    labelKey: "receiverBackupRxPinSwap",
    helpKey: "receiverBackupRxPinSwapHelp",
  },

  // Receiver settings (ChannelRange.svelte)
  "receiver.settings.stickCenter": {
    tier: "standard",
    tab: "receiver",
    labelKey: "receiverStickCenter",
    helpKey: "receiverHelpStickCenter",
  },
  "receiver.settings.stickDeflection": {
    tier: "standard",
    tab: "receiver",
    labelKey: "receiverStickDeflection",
    helpKey: "receiverHelpStickDeflection",
  },
  "receiver.settings.cyclicDeadband": {
    tier: "standard",
    tab: "receiver",
    labelKey: "receiverCyclicDeadband",
    helpKey: "receiverHelpCyclicDeadband",
  },
  "receiver.settings.yawDeadband": {
    tier: "standard",
    tab: "receiver",
    labelKey: "receiverYawDeadband",
    helpKey: "receiverHelpYawDeadband",
    when: when.drivesYaw,
  },
  "receiver.throttle.autoRange": {
    tier: "standard",
    tab: "receiver",
    labelKey: "receiver.channel_range.automatic_throttle_range.label",
    helpKey: "receiver.channel_range.automatic_throttle_range.help",
    when: when.hasMotors,
  },
  "receiver.throttle.min": {
    tier: "standard",
    tab: "receiver",
    labelKey: "receiverZeroThrottle",
    helpKey: "receiverHelpZeroThrottle2",
    when: when.hasMotors,
  },
  "receiver.throttle.max": {
    tier: "standard",
    tab: "receiver",
    labelKey: "receiverFullThrottle",
    helpKey: "receiverHelpFullThrottle2",
    when: when.hasMotors,
  },

  // Telemetry (TelemetrySettings.svelte, TelemetrySensors.svelte)
  "receiver.telemetry.enable": {
    tier: "standard",
    tab: "receiver",
    labelKey: "receiverTelemetryEnabled",
  },
  "receiver.telemetry.inverted": {
    tier: "expert",
    tab: "receiver",
    labelKey: "receiverTelemetryInverted",
    when: when.hasTelemetry,
  },
  "receiver.telemetry.halfDuplex": {
    tier: "expert",
    tab: "receiver",
    labelKey: "receiverTelemetryHalfDuplex",
    when: when.hasTelemetry,
  },
  "receiver.telemetry.pinSwap": {
    tier: "expert",
    tab: "receiver",
    labelKey: "receiverTelemetryPinSwap",
    when: when.hasTelemetry,
  },
  "receiver.telemetry.crsfCustomMode": {
    tier: "standard",
    tab: "receiver",
    labelKey: "receiverCrsfTelemetryMode",
    helpKey: "receiverHelpCrsfTelemetryMode",
    when: when.hasTelemetry,
  },
  "receiver.telemetry.crsfRate": {
    tier: "expert",
    tab: "receiver",
    labelKey: "receiverCrsfTelemetryRate",
    helpKey: "receiverHelpCrsfTelemetryRate",
    when: when.hasTelemetry,
  },
  "receiver.telemetry.crsfRatio": {
    tier: "expert",
    tab: "receiver",
    labelKey: "receiverCrsfTelemetryRatio",
    helpKey: "receiverHelpCrsfTelemetryRatio",
    when: when.hasTelemetry,
  },
  "receiver.telemetry.sensors": {
    tier: "standard",
    tab: "receiver",
    labelKey: "receiverTelemetrySensors",
    when: when.hasTelemetry,
  },

  // Channel assignment (ChannelAssignment.svelte)
  "receiver.channels.preset": {
    tier: "essential",
    tab: "receiver",
    labelKey: "receiverChannelOrder",
  },
  "receiver.channels.map": {
    tier: "essential",
    tab: "receiver",
    labelKey: "receiverBars",
  },
  "receiver.channels.rssiSource": {
    tier: "standard",
    tab: "receiver",
    label: "RSSI",
  },

  // 3D preview (ModelPreview.svelte)
  "receiver.preview.model": {
    tier: "standard",
    tab: "receiver",
    labelKey: "receiverModelPreview",
  },
});
