import semver from "semver";

import { API_VERSION_22_2 } from "@/js/configurator.svelte.js";
import { FC } from "@/js/fc.svelte.js";

import { PORT_FUNCTIONS } from "../configuration/util.js";

// The serial port function id a UART is assigned in Configuration > Ports to
// carry the SRXL2 ESC bus. That single assignment is the source of truth for
// SRXL2 -- the firmware forces motor_pwm_protocol and ESC_SENSOR_CONFIG.protocol
// to match it on save (validateAndFixSrxl2escConfig()), so the Motors tab
// mirrors that here instead of leaving those two as separately-editable
// fields that would just get silently overwritten.
const SRXL2_ESC_FUNCTION_ID =
  PORT_FUNCTIONS.find((f) => f.name === "SRXL2_ESC")?.id ?? 0;

class State {
  overrideEnabled = $state(false);

  throttleProtocols = $derived([
    "PWM",
    "ONESHOT125",
    "ONESHOT42",
    "MULTISHOT",
    "BRUSHED",
    "DSHOT150",
    "DSHOT300",
    "DSHOT600",
    "PROSHOT",
    "CASTLE",
    ...(semver.gte(FC.CONFIG.apiVersion, API_VERSION_22_2) ? ["SRXL2"] : []),
    "DISABLED",
  ]);

  telemetryProtocols = $derived([
    "Disabled",
    "BLHeli32",
    "Hobbywing Platinum V4 / FlyFun V5",
    "Hobbywing Platinum V5",
    "Scorpion",
    "Kontronik",
    "OMPHobby",
    "ZTW",
    "APD",
    "OpenYGE",
    "FLYROTOR",
    "Graupner",
    "XDFLY",
    "FrSky F.BUS",
    ...(semver.gte(FC.CONFIG.apiVersion, API_VERSION_22_2) ? ["SRXL2"] : []),
  ]);

  throttleEnabled = $derived(
    this.throttleProtocols[FC.MOTOR_CONFIG.motor_pwm_protocol] !== "DISABLED",
  );
  isDshot = $derived.by(() => {
    const protoName =
      this.throttleProtocols[FC.MOTOR_CONFIG.motor_pwm_protocol];
    return protoName.startsWith("DSHOT") || protoName === "PROSHOT";
  });
  isCastleLink = $derived(
    this.throttleProtocols[FC.MOTOR_CONFIG.motor_pwm_protocol] === "CASTLE",
  );
  // True the moment a UART is assigned the "SRXL2 ESC" port function, ahead
  // of any save/reboot round-trip -- this is what actually drives SRXL2 on
  // the firmware side, not the throttle protocol dropdown below.
  srxl2PortAssigned = $derived(
    (FC.SERIAL_CONFIG.ports ?? []).some(
      (port) => (port.functionMask & SRXL2_ESC_FUNCTION_ID) !== 0,
    ),
  );
  isSrxl2 = $derived(
    this.srxl2PortAssigned ||
      this.throttleProtocols[FC.MOTOR_CONFIG.motor_pwm_protocol] === "SRXL2",
  );
  hasTelemPort = $derived(FC.ESC_SENSOR_CONFIG.protocol > 0);
  telemEnabled = $derived(this.hasTelemPort || this.isCastleLink);

  /**
   * Sets the correct features and config based on the state of CastleLink
   * and SRXL2 ESC.
   */
  fixConfig() {
    FC.FEATURE_CONFIG.features.ESC_SENSOR = this.telemEnabled;
    if (this.isCastleLink) {
      FC.ESC_SENSOR_CONFIG.protocol = 0;
    }
    if (this.srxl2PortAssigned) {
      const throttleIndex = this.throttleProtocols.indexOf("SRXL2");
      const telemIndex = this.telemetryProtocols.indexOf("SRXL2");
      if (throttleIndex >= 0) {
        FC.MOTOR_CONFIG.motor_pwm_protocol = throttleIndex;
      }
      if (telemIndex >= 0) {
        FC.ESC_SENSOR_CONFIG.protocol = telemIndex;
      }
      FC.ESC_SENSOR_CONFIG.half_duplex = true;
    }
  }
}

export default new State();
