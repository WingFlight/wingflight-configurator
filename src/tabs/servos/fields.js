import { registerFields, when } from "@/js/relevance.js";

// Field registry for the servos tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components. Filled by the disclosure sweep (P7).
//
// The servo table is a CSS grid whose column set is computed in
// ServoConfigTable.svelte; the per-column ids below are resolved there via
// visible() so the columns follow the tiers. The bus servo table reuses the
// same column ids (bus servos have no Rate column).
registerFields({
  // PWM servo configuration table
  "servos.pwm.section": {
    tier: "essential",
    tab: "servos",
    labelKey: "servoConfigurationPwm",
    when: when.hasServos,
  },
  "servos.pwm.center": {
    tier: "essential",
    tab: "servos",
    labelKey: "servoMid",
    helpKey: "servoMidHelp",
    when: when.hasServos,
  },
  "servos.pwm.min": {
    tier: "essential",
    tab: "servos",
    labelKey: "servoMin",
    helpKey: "servoMinHelp",
    when: when.hasServos,
  },
  "servos.pwm.max": {
    tier: "essential",
    tab: "servos",
    labelKey: "servoMax",
    helpKey: "servoMaxHelp",
    when: when.hasServos,
  },
  "servos.pwm.scaleNeg": {
    tier: "standard",
    tab: "servos",
    labelKey: "servoScaleNeg",
    helpKey: "servoScaleNegHelp",
    when: when.hasServos,
  },
  "servos.pwm.scalePos": {
    tier: "standard",
    tab: "servos",
    labelKey: "servoScalePos",
    helpKey: "servoScalePosHelp",
    when: when.hasServos,
  },
  "servos.pwm.rate": {
    tier: "expert",
    tab: "servos",
    labelKey: "servoRate",
    helpKey: "servoRateHelp",
    when: when.hasServos,
  },
  "servos.pwm.speed": {
    tier: "expert",
    tab: "servos",
    labelKey: "servoSpeed",
    helpKey: "servoSpeedHelp",
    when: when.hasServos,
  },
  "servos.pwm.reverse": {
    tier: "essential",
    tab: "servos",
    labelKey: "servoReverse",
    helpKey: "servoReverseHelp",
    when: when.hasServos,
  },
  "servos.pwm.geoCorrection": {
    tier: "expert",
    tab: "servos",
    labelKey: "servoGeometryCorrection",
    helpKey: "servoGeometryCorrectionHelp",
    when: when.hasServos,
  },

  // Bus (FBUS/SBUS out) servo section
  "servos.bus.section": {
    tier: "standard",
    tab: "servos",
    labelKey: "servoConfigurationBus",
    when: when.hasBusServos,
  },
  "servos.bus.clonePwm": {
    tier: "standard",
    tab: "servos",
    labelKey: "servoBusCloneLabel",
    helpKey: "servoBusCloneText",
    when: when.hasBusServos,
  },

  // Servo override
  "servos.override.enable": {
    tier: "standard",
    tab: "servos",
    labelKey: "servoEnableOverrideLabel",
    helpKey: "servoOverrideHelp",
    when: when.hasServos,
  },
  "servos.override.pwmTable": {
    tier: "standard",
    tab: "servos",
    labelKey: "servoOverridePwm",
    when: when.hasServos,
  },
  "servos.override.busTable": {
    tier: "standard",
    tab: "servos",
    labelKey: "servoOverrideBus",
    when: when.hasBusServos,
  },
});
