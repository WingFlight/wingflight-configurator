// ESC protocols that are not just a signal on the motor (ESC) output, for
// the Setup Wizard's Motor step.
//
// SRXL2: throttle and telemetry share one half-duplex wire on a serial
// port. The firmware starts the SRXL2 ESC driver only when a port has the
// SRXL2 ESC function (drivers/srxl2_esc.c srxl2escDriverInit()), drives no
// motor pin for it (drivers/motor.c motorDevInit()), and on save forces the
// throttle protocol, the ESC telemetry protocol and half duplex from that
// port (validateAndFixSrxl2escConfig()). So the port is what turns SRXL2 on,
// and the SRXL2 throttle protocol without a port gives the ESC no signal.
//
// Castle Link: an ordinary PWM signal on the motor output, and the firmware
// reads the ESC's telemetry on that same pin (drivers/pwm_output.c,
// drivers/castle_telemetry_decode.c). No serial port. Its telemetry is read
// only with the ESC_SENSOR feature on and the ESC telemetry protocol off
// (sensors/esc_sensor.c getEscSensorData()).

// Serial port function bit (firmware io/serial.h): FUNCTION_SRXL2_ESC.
export const SRXL2_ESC_FUNCTION = 1 << 21;

function maskOf(port) {
    return port?.functionMask ?? 0;
}

/** Whether the throttle protocol takes its signal on a serial port. */
export function needsSerialPort(protocol) {
    return protocol === 'SRXL2';
}

/** The port the SRXL2 ESC is on, or null. */
export function srxl2Port(ports) {
    return ports.find((port) => maskOf(port) & SRXL2_ESC_FUNCTION) ?? null;
}

/** Takes the SRXL2 ESC off every port. Returns whether a port changed. */
export function clearSrxl2Port(ports) {
    let changed = false;
    for (const port of ports) {
        if (maskOf(port) & SRXL2_ESC_FUNCTION) {
            port.functionMask = maskOf(port) & ~SRXL2_ESC_FUNCTION;
            changed = true;
        }
    }
    return changed;
}

/**
 * Puts the SRXL2 ESC on `port`, and off every other port. The port must be
 * free or already the SRXL2 ESC port. Returns whether it was set.
 */
export function setSrxl2Port(ports, port) {
    if (!port || maskOf(port) & ~SRXL2_ESC_FUNCTION) return false;
    clearSrxl2Port(ports);
    port.functionMask = SRXL2_ESC_FUNCTION;
    return true;
}

/**
 * The ESC telemetry settings that go with a change of throttle protocol, or
 * null when the change leaves them alone. Only a change to or from SRXL2 or
 * Castle Link touches them, as the Motors tab's fixConfig() does.
 * @param {string} from - throttle protocol name before the change
 * @param {string} to - throttle protocol name after it
 * @param {number} telemetryProtocol - ESC_SENSOR_CONFIG.protocol now
 * @param {number} srxl2Telemetry - index of the SRXL2 telemetry protocol,
 *   -1 if the firmware has none
 * @returns {{protocol: number, feature: boolean, halfDuplex?: boolean}|null}
 *   the telemetry protocol, the ESC_SENSOR feature, and half duplex when it
 *   has to change
 */
export function telemetryForProtocol(from, to, telemetryProtocol, srxl2Telemetry) {
    const special = (name) => name === 'SRXL2' || name === 'CASTLE';
    if (from === to || (!special(from) && !special(to))) return null;

    if (to === 'SRXL2') {
        // Telemetry rides on the SRXL2 bus.
        return { protocol: Math.max(srxl2Telemetry, 0), feature: srxl2Telemetry > 0, halfDuplex: true };
    }
    if (to === 'CASTLE') {
        // Castle telemetry is read on the throttle wire: no serial protocol.
        return { protocol: 0, feature: true };
    }
    // Leaving SRXL2 or Castle: SRXL2 telemetry goes with its bus, any other
    // serial ESC telemetry stays.
    const protocol = telemetryProtocol === srxl2Telemetry ? 0 : telemetryProtocol;
    return { protocol, feature: protocol > 0 };
}
