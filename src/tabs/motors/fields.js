import { registerFields, when } from "@/js/relevance.js";

// Field registry for the motors tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// Everything here is irrelevant without a motor, so every id carries
// when.hasMotors (or when.hasEscSensor, which implies a motor). The ESC
// telemetry protocol select deliberately does NOT use when.hasEscSensor:
// the ESC_SENSOR feature is derived from that very select (state.fixConfig),
// so gating it on the feature would make the feature impossible to enable.
// The "*.section" ids wrap whole sections so a glider never sees an empty
// throttle/governor shell; the field ids inside them give settings search
// something to jump to.
registerFields({
  "motors.throttle.section": {
    tier: "essential",
    tab: "motors",
    labelKey: "motorsSectionLabelThrottle",
    when: when.hasMotors,
  },
  "motors.throttle.escProtocol": {
    tier: "essential",
    tab: "motors",
    labelKey: "motorsEscProtocol",
    helpKey: "motorsEscProtocolHelp",
    when: when.hasMotors,
  },
  "motors.throttle.pwmRate": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsUnsyncedPWMFreq",
    helpKey: "motorsUnsyncedPWMFreqHelp",
    when: when.hasMotors,
  },
  "motors.throttle.unsyncedPwm": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsUnsyncedPwm",
    helpKey: "motorsUnsyncedPwmHelp",
    when: when.hasMotors,
  },
  "motors.throttle.endpoints": {
    tier: "standard",
    tab: "motors",
    labelKey: "motorsThrottleEndpoints",
    when: when.hasMotors,
  },
  "motors.throttle.endpointRealtime": {
    tier: "standard",
    tab: "motors",
    labelKey: "motorsThrottleEndpointRealtime",
    helpKey: "motorsThrottleEndpointRealtimeHelp",
    when: when.hasMotors,
  },
  "motors.throttle.minCommand": {
    tier: "standard",
    tab: "motors",
    labelKey: "motorsThrottleMinimumCommand",
    helpKey: "motorsThrottleMinimumCommandHelp",
    when: when.hasMotors,
  },
  "motors.throttle.minThrottle": {
    tier: "standard",
    tab: "motors",
    labelKey: "motorsThrottleMinimum",
    helpKey: "motorsThrottleMinimumHelp",
    when: when.hasMotors,
  },
  "motors.throttle.maxThrottle": {
    tier: "standard",
    tab: "motors",
    labelKey: "motorsThrottleMaximum",
    helpKey: "motorsThrottleMaximumHelp",
    when: when.hasMotors,
  },
  "motors.telemetry.section": {
    tier: "standard",
    tab: "motors",
    labelKey: "motorsEscTelemetry",
    when: when.hasMotors,
  },
  "motors.telemetry.protocol": {
    tier: "standard",
    tab: "motors",
    labelKey: "motorsEscTelemetryProtocol",
    helpKey: "motorsEscTelemetryProtocolHelp",
    when: when.hasMotors,
  },
  "motors.telemetry.signaling": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsSectionSignaling",
    when: when.hasEscSensor,
  },
  "motors.telemetry.halfDuplex": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsEscTelemetryHalfDuplex",
    helpKey: "motorsEscTelemetryHalfDuplexHelp",
    when: when.hasEscSensor,
  },
  "motors.telemetry.pinswap": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsEscTelemetryPinswap",
    helpKey: "motorsEscTelemetryPinswapHelp",
    when: when.hasEscSensor,
  },
  "motors.telemetry.sensorCorrection": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsSectionSensorCorrection",
    when: when.hasEscSensor,
  },
  "motors.telemetry.voltageCorrection": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsVoltageCorrection",
    helpKey: "motorsVoltageCorrectionHelp",
    when: when.hasEscSensor,
  },
  "motors.telemetry.currentCorrection": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsCurrentCorrection",
    helpKey: "motorsCurrentCorrectionHelp",
    when: when.hasEscSensor,
  },
  "motors.telemetry.consumptionCorrection": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsConsumptionCorrection",
    helpKey: "motorsConsumptionCorrectionHelp",
    when: when.hasEscSensor,
  },
  "motors.rpm.section": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsSectionLabelRPM",
    when: when.hasMotors,
  },
  "motors.rpm.freqSensor": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsRPMSensor",
    helpKey: "motorsRPMSensorHelp",
    when: when.hasMotors,
  },
  "motors.rpm.dshotTelemetry": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsDshotBidir",
    helpKey: "motorsDshotBidirHelp",
    when: when.hasMotors,
  },
  "motors.rpm.motorPoles": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsMotorPoles1Long",
    helpKey: "motorsMotorPolesHelp",
    when: when.hasMotors,
  },
  "motors.governor.section": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsSectionLabelGovernor",
    when: when.hasMotors,
  },
  "motors.governor.mode": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsGovernorMode",
    helpKey: "motorsGovernorModeHelp",
    when: when.hasMotors,
  },
  "motors.governor.rpm": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsGovernorRpm",
    helpKey: "motorsGovernorRpmHelp",
    when: when.hasMotors,
  },
  "motors.governor.rpmMaxLimit": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsGovernorRpmMaxLimit",
    helpKey: "motorsGovernorRpmMaxLimitHelp",
    when: when.hasMotors,
  },
  "motors.governor.rpmMin": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsGovernorRpmMin",
    helpKey: "motorsGovernorRpmMinHelp",
    when: when.hasMotors,
  },
  "motors.governor.rpmMax": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsGovernorRpmMax",
    helpKey: "motorsGovernorRpmMaxHelp",
    when: when.hasMotors,
  },
  "motors.governor.gain": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsGovernorGain",
    helpKey: "motorsGovernorGainHelp",
    when: when.hasMotors,
  },
  "motors.governor.iGain": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsGovernorIGain",
    helpKey: "motorsGovernorIGainHelp",
    when: when.hasMotors,
  },
  "motors.governor.throttle": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsGovernorThrottle",
    helpKey: "motorsGovernorThrottleHelp",
    when: when.hasMotors,
  },
  "motors.governor.handover": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsGovernorHandover",
    helpKey: "motorsGovernorHandoverHelp",
    when: when.hasMotors,
  },
  "motors.governor.ceiling": {
    tier: "expert",
    tab: "motors",
    labelKey: "motorsGovernorCeiling",
    helpKey: "motorsGovernorCeilingHelp",
    when: when.hasMotors,
  },
  "motors.override.enable": {
    tier: "standard",
    tab: "motors",
    labelKey: "motorOverrideTitle",
    when: when.hasMotors,
  },
});
