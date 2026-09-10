import { registerFields, when } from "@/js/relevance.js";

// Field registry for the power tab: id -> { tier, when, tab, labelKey, helpKey }.
// Ids are "<tab>.<section>.<field>" and match <Tier id="..."> wrappers in the
// tab's Svelte components.
registerFields({
  // Battery
  "power.battery.minCellVoltage": {
    tier: "essential",
    tab: "power",
    labelKey: "powerBatteryMinimumCellVoltage",
    when: when.hasVoltageSensor,
  },
  "power.battery.fullCellVoltage": {
    tier: "standard",
    tab: "power",
    labelKey: "powerBatteryFullCellVoltage",
    when: when.hasVoltageSensor,
  },
  "power.battery.warningCellVoltage": {
    tier: "essential",
    tab: "power",
    labelKey: "powerBatteryWarningCellVoltage",
    when: when.hasVoltageSensor,
  },
  "power.battery.maxCellVoltage": {
    tier: "standard",
    tab: "power",
    labelKey: "powerBatteryMaximumCellVoltage",
    when: when.hasVoltageSensor,
  },
  "power.battery.cellCount": { tier: "standard", tab: "power", labelKey: "powerBatteryCellCount" },
  // Per-profile capacity inputs plus the profile activation buttons.
  "power.battery.capacities": { tier: "standard", tab: "power", labelKey: "powerBatteryCapacity" },

  // Smart Fuel. Voltage mode needs only a voltage sensor; the drop-rate and
  // sag tuning fields apply to the voltage track (modes Voltage/Combined).
  "power.smartFuel.mode": {
    tier: "standard",
    tab: "power",
    labelKey: "powerSmartFuelSource",
    helpKey: "powerSmartFuelSourceHelp",
    when: when.any(when.hasVoltageSensor, when.hasCurrentSensor),
  },
  "power.smartFuel.voltageDropRate": {
    tier: "expert",
    tab: "power",
    labelKey: "powerSmartFuelVoltageDropRate",
    helpKey: "powerSmartFuelVoltageDropRateHelp",
    when: when.hasVoltageSensor,
  },
  "power.smartFuel.chargeDropRate": {
    tier: "expert",
    tab: "power",
    labelKey: "powerSmartFuelChargeDropRate",
    helpKey: "powerSmartFuelChargeDropRateHelp",
    when: when.hasVoltageSensor,
  },
  "power.smartFuel.sagGain": {
    tier: "expert",
    tab: "power",
    labelKey: "powerSmartFuelSagGain",
    helpKey: "powerSmartFuelSagGainHelp",
    when: when.hasVoltageSensor,
  },

  // Meter sources
  "power.meters.voltageSource": { tier: "essential", tab: "power", labelKey: "powerBatteryVoltageMeterSource" },
  "power.meters.currentSource": { tier: "standard", tab: "power", labelKey: "powerBatteryCurrentMeterSource" },

  // Raw ADC meter calibration (the calibration manager dialog is the
  // friendly path; these are the underlying scale factors).
  "power.voltage.scale": { tier: "expert", tab: "power", labelKey: "powerVoltageScale", when: when.hasVoltageSensor },
  "power.voltage.divider": {
    tier: "expert",
    tab: "power",
    labelKey: "powerVoltageDivider",
    when: when.hasVoltageSensor,
  },
  "power.current.scale": { tier: "expert", tab: "power", labelKey: "powerAmperageScale", when: when.hasCurrentSensor },
  "power.current.offset": {
    tier: "expert",
    tab: "power",
    labelKey: "powerAmperageOffset",
    when: when.hasCurrentSensor,
  },
});
