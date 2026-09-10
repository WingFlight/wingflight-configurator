// Plain-object FC fixtures for profile derivation tests. Shapes mirror what
// MSPHelper writes into FC (see src/js/fc.svelte.js / msp/MSPHelper.js).
// Mixer rule numbers follow firmware pg/mixer.h: src 1..4 stabilized
// roll/pitch/yaw/throttle, 13 = RC AUX1, 27..29 = thrust vector; dst 1..26
// servos, 27..30 motors.

function rule(oper, src, dst, weight) {
  return { oper, src, dst, offset: 0, weight, weightNeg: weight, speed: 0, curve: 0, condition: 0 };
}
const SET = 1;
const ADD = 2;

function features(...names) {
  const FLAGS = {
    RX_PPM: 0, RX_SERIAL: 3, SOFTSERIAL: 6, GPS: 7, TELEMETRY: 10, RX_PARALLEL_PWM: 13,
    RX_MSP: 14, RSSI_ADC: 15, LED_STRIP: 16, RX_SPI: 25, ESC_SENSOR: 27, FREQ_SENSOR: 28,
    THRUST_VECTOR: 24,
  };
  let bitfield = 0;
  for (const n of names) bitfield |= 1 << FLAGS[n];
  return {
    bitfield,
    isEnabled(name) {
      return ((bitfield >> FLAGS[name]) & 1) === 1;
    },
  };
}

function baseConfig(overrides = {}) {
  return {
    apiVersion: "22.2.0",
    flightControllerIdentifier: "WGFL",
    flightControllerVersion: "4.5.0",
    boardIdentifier: "MKF4",
    targetName: "MATEKF405",
    boardName: "MATEKF405",
    boardDesign: "",
    manufacturerId: "MTKS",
    mcuTypeId: 3,
    uid: [0x001a0032, 0x3438510b, 0x20343235],
    name: "Trainer",
    activeSensors: 0b100011, // gyro, acc, mag... (acc bit0, baro bit1, mag bit2, gyro bit5)
    motorCount: 1,
    servoCount: 4,
    configurationProblems: 0,
    armingDisableFlags: 0,
    armingDisableCount: 0,
    ...overrides,
  };
}

const armRange = { id: 0, auxChannelIndex: 0, range: { start: 1700, end: 2100 } };

export function conventionalTrainer() {
  return {
    CONFIG: baseConfig(),
    MIXER_CONFIG: { model_type: 0 },
    MIXER_RULES: [
      rule(SET, 1, 1, 1000), // S1 left aileron
      rule(SET, 1, 2, -1000), // S2 right aileron (reversed)
      rule(SET, 2, 3, 1000), // S3 elevator
      rule(SET, 3, 4, 1000), // S4 rudder
      rule(SET, 4, 27, 1000), // M1 throttle
    ],
    FEATURE_CONFIG: { features: features("RX_SERIAL", "TELEMETRY") },
    SERIAL_CONFIG: {
      ports: [
        { identifier: 20, functions: ["MSP"] },
        { identifier: 0, functions: ["RX_SERIAL"] },
        { identifier: 1, functions: [] },
      ],
    },
    RX_CONFIG: { serialrx_provider: 9, rx_pulse_min: 885, rx_pulse_max: 2115 },
    RC: { active_channels: 8, channels: new Array(8).fill(1500) },
    RC_MAP: [0, 1, 3, 2, 4, 5, 6, 7], // AETR
    AUX_CONFIG: ["ARM", "ANGLE", "HORIZON"],
    AUX_CONFIG_IDS: [0, 1, 2],
    MODE_RANGES: [armRange],
    BATTERY_CONFIG: { voltageMeterSource: 1, currentMeterSource: 0 },
    BLACKBOX: { blackboxDevice: 0 },
  };
}

export function flyingWingTwoMotors() {
  const fc = conventionalTrainer();
  fc.CONFIG = baseConfig({ motorCount: 2, servoCount: 3, name: "Wing" });
  fc.MIXER_CONFIG = { model_type: 1 };
  fc.MIXER_RULES = [
    rule(SET, 2, 1, 1000), // S1 left elevon: pitch
    rule(ADD, 1, 1, 1000), //   + roll
    rule(SET, 2, 2, 1000), // S2 right elevon: pitch
    rule(ADD, 1, 2, -1000), //  - roll
    rule(SET, 3, 3, 1000), // S3 rudder
    rule(SET, 4, 27, 1000), // M1
    rule(SET, 4, 28, 1000), // M2
    rule(ADD, 3, 27, 500), // differential thrust
    rule(ADD, 3, 28, -500),
  ];
  fc.FEATURE_CONFIG = { features: features("RX_SERIAL", "GPS", "LED_STRIP") };
  fc.BATTERY_CONFIG = { voltageMeterSource: 1, currentMeterSource: 1 };
  fc.BLACKBOX = { blackboxDevice: 1 };
  fc.MODE_RANGES = [];
  return fc;
}

export function vtailGliderWithFlaps() {
  const fc = conventionalTrainer();
  fc.CONFIG = baseConfig({ motorCount: 0, servoCount: 6, name: "Glider" });
  fc.MIXER_CONFIG = { model_type: 2 };
  fc.MIXER_RULES = [
    rule(SET, 1, 1, 1000), // S1 left aileron
    rule(SET, 1, 2, -1000), // S2 right aileron
    rule(SET, 3, 3, 1000), // S3 right ruddervator: yaw +
    rule(ADD, 2, 3, 1000), //   pitch
    rule(SET, 3, 4, -1000), // S4 left ruddervator: yaw -
    rule(ADD, 2, 4, 1000), //   pitch
    rule(SET, 13, 5, 1000), // S5 flap (AUX1)
    rule(SET, 13, 6, 1000), // S6 flap
  ];
  fc.FEATURE_CONFIG = { features: features("RX_PPM") };
  fc.SERIAL_CONFIG = { ports: [{ identifier: 20, functions: ["MSP"] }] };
  return fc;
}

export function customEmptyMixer() {
  const fc = conventionalTrainer();
  fc.MIXER_CONFIG = { model_type: 5 };
  fc.MIXER_RULES = Array.from({ length: 32 }, () => rule(0, 0, 0, 0));
  fc.FEATURE_CONFIG = { features: features() };
  fc.SERIAL_CONFIG = { ports: [{ identifier: 20, functions: ["MSP"] }] };
  fc.MODE_RANGES = [];
  return fc;
}

export function serialRxWithoutPort() {
  const fc = conventionalTrainer();
  fc.SERIAL_CONFIG = { ports: [{ identifier: 20, functions: ["MSP"] }] };
  return fc;
}

export { rule, features, baseConfig };
