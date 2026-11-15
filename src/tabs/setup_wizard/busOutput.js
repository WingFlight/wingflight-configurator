// Servos on a bus output (F.Bus or SBUS) for the Setup Wizard's bus step.
//
// Servo N is sent on PWM output N where the board has one and on channel N
// of a bus output when one is set up on a serial port (firmware
// flight/servos.c), so a bus output is what lifts the servo count past the
// board's PWM pins.

// Serial port function bits (firmware io/serial.h): FUNCTION_SBUS_OUT and
// FUNCTION_FBUS_MASTER.
export const SBUS_OUT_FUNCTION = 1 << 18;
export const FBUS_OUT_FUNCTION = 1 << 19;
const BUS_FUNCTIONS = SBUS_OUT_FUNCTION | FBUS_OUT_FUNCTION;

// `channelsKey` is the channel count in FC.MIXER_CONFIG.
export const BUS_PROTOCOLS = {
    fbus: {
        mask: FBUS_OUT_FUNCTION,
        channels: [8, 12, 16, 24],
        channelsKey: 'fbus_master_channels',
    },
    sbus: {
        mask: SBUS_OUT_FUNCTION,
        channels: [8, 12, 16],
        channelsKey: 'sbus_out_channels',
    },
};

function maskOf(port) {
    return port?.functionMask ?? 0;
}

/** The port a bus output is on, or null. */
export function busPort(ports) {
    return ports.find((port) => maskOf(port) & BUS_FUNCTIONS) ?? null;
}

/** 'fbus', 'sbus' or null. F.Bus wins if a port list somehow has both. */
export function busProtocol(ports) {
    if (ports.some((port) => maskOf(port) & FBUS_OUT_FUNCTION)) return 'fbus';
    if (ports.some((port) => maskOf(port) & SBUS_OUT_FUNCTION)) return 'sbus';
    return null;
}

/**
 * Identifier of the port whose connector is labelled SBUS, or null.
 * @param {Object.<number, string>} portNames - identifier -> connector name
 *   for the connected board design (PORT_NAMES_RF2[boardDesign]).
 */
export function sbusConnectorIdentifier(portNames) {
    for (const [identifier, name] of Object.entries(portNames ?? {})) {
        if (/^S\.?BUS$/i.test(name)) return Number(identifier);
    }
    return null;
}

/**
 * Whether F.Bus on this port needs the pin swap. F.Bus runs half-duplex on
 * the UART's TX pin. A connector labelled SBUS or RX is a receiver input,
 * the UART's RX pin, so F.Bus only reaches it with the pins swapped.
 */
export function needsPinSwap(portNames, port) {
    if (!port) return false;
    return /^(S\.?BUS|RX)$/i.test(portNames?.[port.identifier] ?? '');
}

/**
 * How many F.Bus devices are answering now. The flight controller lists
 * every device it has heard from since boot, so a device counts only if its
 * packet count rose since the previous poll.
 * @param {Map<string, number>|null} previous - packet counts from the last
 *   poll, null on the first.
 * @param {Array} sensors - FC.FBUS_SENSORS.
 * @returns {{answering: number|null, counts: Map<string, number>}} answering
 *   is null on the first poll, when there is nothing to compare with.
 */
export function answeringDevices(previous, sensors) {
    const FBUS_SOURCE = 0; // 0 = F.Bus, 1 = S.Port
    const counts = new Map();
    let answering = 0;
    for (const sensor of sensors ?? []) {
        if (sensor.source !== FBUS_SOURCE) continue;
        const key = String(sensor.physicalId);
        counts.set(key, sensor.packetCount);
        if (previous && sensor.packetCount > (previous.get(key) ?? 0)) answering += 1;
    }
    return { answering: previous ? answering : null, counts };
}

/** Takes every bus output off the ports. */
export function clearBusOutput(ports) {
    for (const port of ports) {
        if (maskOf(port) & BUS_FUNCTIONS) {
            port.functionMask = maskOf(port) & ~BUS_FUNCTIONS;
        }
    }
}

/**
 * Puts the protocol's bus output on `port`, and off every other port. The
 * port must be free or already a bus output. Returns whether it was set.
 */
export function setBusOutput(ports, port, protocol) {
    const config = BUS_PROTOCOLS[protocol];
    if (!config || !port || maskOf(port) & ~BUS_FUNCTIONS) return false;
    clearBusOutput(ports);
    port.functionMask = config.mask;
    return true;
}

/**
 * The port to offer first: the SBUS connector if it's free (or already the
 * bus output), otherwise none. `blocked(port)` excludes ports that can't
 * be used at all.
 */
export function recommendedPort(ports, portNames, blocked = () => false) {
    const identifier = sbusConnectorIdentifier(portNames);
    const port = ports.find((p) => p.identifier === identifier);
    if (!port || blocked(port) || maskOf(port) & ~BUS_FUNCTIONS) return null;
    return port;
}
