/**
 * File: src/js/boardview/port_function.js
 * Says in words what a serial port is set to.
 *
 * The firmware stores a port's job as a bit mask, and a port can carry
 * more than one -- MSP plus a telemetry protocol, say. The Serial
 * Ports table shows one <select>, which is enough when the mask holds
 * a single function and shows "Custom" when it does not. A drawing has
 * room for the real answer, so this decomposes the mask.
 */

import { PORT_FUNCTIONS } from "@/tabs/configuration/util.js";

/**
 * Every function a mask has switched on.
 * @param {number} functionMask
 * @returns {{id: number, name: string}[]}
 */
export function functionsInMask(functionMask) {
  const mask = Number(functionMask) || 0;
  return PORT_FUNCTIONS.filter(
    (func) => func.id !== 0 && (mask & func.id) === func.id,
  );
}

/**
 * A port's job as display text, e.g. "GPS" or "MSP + S.Port
 * telemetry". Empty string when the port is switched off, so callers
 * can test it for truth.
 * @param {?{functionMask: number}} port a FC.SERIAL_CONFIG.ports entry
 * @param {(key: string) => string} t translator, normally i18n's
 * @returns {string}
 */
export function describePortFunction(port, t) {
  const mask = Number(port?.functionMask) || 0;
  if (!mask) return "";

  const names = functionsInMask(mask).map((func) =>
    t(`portsFunction_${func.name}`),
  );
  if (!names.length) return t("portsFunction_CUSTOM");
  return names.join(" + ");
}
