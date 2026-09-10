import { registerFields, when } from "@/js/relevance.js";

// Field registry for the xact_servo tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// Xact servos are programmed over the FBUS master link, so the whole tab is
// expert and only relevant when a port carries bus servos (when.hasBusServos).
// The scan button, servo list and warnings are actions/notes and stay untagged.
const def = (labelKey, helpKey) => ({
  tier: "expert",
  tab: "xact_servo",
  labelKey,
  helpKey,
  when: when.hasBusServos,
});

registerFields({
  // Protocol
  "xact_servo.protocol.physicalId": def("xactServoPhysicalId", "xactServoPhysicalIdHelp"),
  "xact_servo.protocol.appIdOffset": def("xactServoAppIdOffset", "xactServoAppIdOffsetHelp"),
  "xact_servo.protocol.firmwareVersion": def("xactServoFirmwareVersion", "xactServoFirmwareVersionHelp"),

  // Servo
  "xact_servo.servo.range": def("xactServoRange", "xactServoRangeHelp"),
  "xact_servo.servo.direction": def("xactServoDirection", "xactServoDirectionHelp"),
  "xact_servo.servo.pulseType": def("xactServoPulseType", "xactServoPulseTypeHelp"),
  "xact_servo.servo.dataRate": def("xactServoDataRate", "xactServoDataRateHelp"),
  "xact_servo.servo.channel": def("xactServoChannel", "xactServoChannelHelp"),
  "xact_servo.servo.center": def("xactServoCenter", "xactServoCenterHelp"),

  // Advanced
  "xact_servo.advanced.holdingStrength": def("xactServoHoldingStrength", "xactServoHoldingStrengthHelp"),
  "xact_servo.advanced.operationSmoothing": def(
    "xactServoOperationSmoothing",
    "xactServoOperationSmoothingHelp",
  ),
  "xact_servo.advanced.deadband": def("xactServoDeadband", "xactServoDeadbandHelp"),

  // Series 65 extended parameters
  "xact_servo.series65.workingMode": def("xactServoWorkingMode", "xactServoWorkingModeHelp"),
  "xact_servo.series65.maxAngle": def("xactServoMaxAngle", "xactServoMaxAngleHelp"),
});
