// FBUS mux FPGA (STM32F7X2M builds, e.g. the FrSky Vantac RF007 V3): an FPGA
// between the MCU and some outputs that switches each one between the MCU's
// timer output (PWM), the FBUS master line (FBUS) and a bidirectional DShot
// bridge (DSHOT). Read with MSP2_WING_FBUS_MUX_CONFIG; other builds answer it
// as unsupported, which leaves FC.FBUS_MUX null.

// fbusMuxMode_e and fbusMuxFpgaStatus_e, in firmware order
export const FBUS_MUX_MODES = ["PWM", "FBUS", "DSHOT"];
export const FBUS_MUX_STATUSES = ["DISABLED", "RESOURCE_ERROR", "LOAD_FAILED", "NO_CONFIG_ECHO", "READY"];

// motor_pwm_protocol values the DShot bridge works with
const DSHOT_BRIDGE_PROTOCOLS = ["DSHOT300", "DSHOT600"];

/**
 * Decodes MSP2_WING_FBUS_MUX_CONFIG. Returns null for a reply too short to hold
 * the fixed fields (the Virtual FC answers every read with an empty reply).
 */
export function readFbusMuxConfig(data) {
    if (data.remaining() < 9) return null;

    data.readU8(); // payload version, unused for now
    const channelCount = data.readU8();
    const dshotMask = data.readU8();
    const serialPort = data.readU8();
    const status = FBUS_MUX_STATUSES[data.readU8()] ?? "UNKNOWN";
    const modeWord = data.readU32();

    const channels = [];
    for (let i = 0; i < channelCount && data.remaining() >= 2; i++) {
        channels.push({
            mode: FBUS_MUX_MODES[data.readU8()] ?? "PWM",
            activeMode: FBUS_MUX_MODES[data.readU8()] ?? "PWM",
        });
    }

    // Held by MSP2_WING_SET_FBUS_MUX_OVERRIDE; the modes in use are then its modes
    const overrideActive = data.remaining() >= 1 && data.readU8() !== 0;

    return { dshotMask, serialPort, status, modeWord, channels, overrideActive };
}

/** MSP_SERIAL_CONFIG identifier (UART1 = 0) of the port the FPGA needs free, or null. */
export function fbusMuxSerialIdentifier(mux) {
    return mux?.serialPort ? mux.serialPort - 1 : null;
}

export function isFbusMuxSerialPort(mux, port) {
    const identifier = fbusMuxSerialIdentifier(mux);
    return identifier !== null && port?.identifier === identifier;
}

/** Whether 1-based `channel` has a DShot bridge in the bitstream. */
export function isDshotChannel(mux, channel) {
    return !!(mux && mux.dshotMask & (1 << (channel - 1)));
}

/** `set fbus_mux_chN_mode` lines for every channel whose mode changed. */
export function fbusMuxModeCommands(originalModes, workingModes) {
    const commands = [];
    workingModes.forEach((mode, i) => {
        if (mode !== originalModes[i]) {
            commands.push(`set fbus_mux_ch${i + 1}_mode = ${mode}`);
        }
    });
    return commands;
}

/**
 * Parses what the remap tool reads in the CLI for the mux checks: `get
 * motor_pwm_protocol`, `get dshot_bidir`, `serial` and `dump hardware`.
 */
export function parseFbusMuxPrerequisites(text) {
    const value = (name) => text.match(new RegExp(`^${name} = (\\S+)`, "m"))?.[1] ?? null;
    const sendPin = text.match(/^resource FBUS_MASTER_SEND 1 (\S+)/m)?.[1] ?? null;

    // `serial <index> <function mask> ...`; FUNCTION_FBUS_MASTER is 1 << 19
    const fbusMasterPort = [...text.matchAll(/^serial (\d+) (\d+) /gm)].some(
        (match) => Number(match[2]) & (1 << 19),
    );

    return {
        motorProtocol: value("motor_pwm_protocol"),
        dshotBidir: value("dshot_bidir") === "ON",
        fbusMasterPort,
        sendPinAssigned: !!sendPin && sendPin !== "NONE",
    };
}

/**
 * What would keep each channel from running in its selected mode. The firmware
 * falls back to PWM in every one of these cases (fbus_mux_fpga.c buildModeWord),
 * so they are warnings, not errors.
 * @param {string[]} modes - Selected mode per channel (index 0 = channel 1).
 * @param {Object.<number, string>} channelPins - 1-based channel -> MCU pin (e.g. "A08").
 * @param {Object} hardware - The remap tool's working HardwareMap (option -> {pin}).
 * @param {Object} prerequisites - From parseFbusMuxPrerequisites.
 * @returns {{channel: number, pin: ?string, issue: string}[]}
 */
export function findFbusMuxIssues(modes, channelPins, hardware, prerequisites) {
    const issues = [];

    modes.forEach((mode, i) => {
        const channel = i + 1;
        const pin = channelPins[channel] ?? null;
        const add = (issue) => issues.push({ channel, pin, issue });

        if (mode === "FBUS") {
            if (!prerequisites.fbusMasterPort) add("fbusNeedsMasterPort");
            if (!prerequisites.sendPinAssigned) add("fbusNeedsSendPin");
        } else if (mode === "DSHOT") {
            if (!DSHOT_BRIDGE_PROTOCOLS.includes(prerequisites.motorProtocol) || !prerequisites.dshotBidir) {
                add("dshotNeedsBidirProtocol");
            }
            // The bridge passes the MCU's own DShot signal, which only a motor makes
            const occupant = Object.keys(hardware).find((option) => hardware[option]?.pin === pin);
            if (!occupant || !/^M\d+$/.test(occupant)) add("dshotNeedsMotor");
        }
    });

    return issues;
}
