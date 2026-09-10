import { FC } from "@/js/fc.svelte.js";
import { MSPCodes } from "@/js/msp/MSPCodes.js";
import { getManufacturer } from "@/tabs/esc_programming/manufacturers/index.js";

let virtualEscManufacturerId = null;

// Per-manufacturer "EEPROM" for the simulated ESC: seeded from simResponse, then updated by
// MSP_SET_ESC_PARAMETERS writes so a save is actually reflected on the next read. Without this,
// every read always echoed the pristine simResponse, making saves look like they silently
// reverted to the values the form first loaded.
const virtualEscBuffers = new Map();

export function setVirtualEscManufacturer(id) {
  virtualEscManufacturerId = id;
}

function currentVirtualEscBuffer() {
  if (!virtualEscManufacturerId) return undefined;
  if (!virtualEscBuffers.has(virtualEscManufacturerId)) {
    const manufacturer = getManufacturer(virtualEscManufacturerId);
    if (!manufacturer?.simResponse) return undefined;
    virtualEscBuffers.set(
      virtualEscManufacturerId,
      Uint8Array.from(manufacturer.simResponse),
    );
  }
  return virtualEscBuffers.get(virtualEscManufacturerId);
}

// Lets the ESC Programming tab be developed/tested without hardware: MSP.send_message's
// virtualMode branch calls this before falling back to its normal no-op ack. `requestData` is
// the outgoing write payload (a plain array of byte values) for write codes.
export function getVirtualEscResponse(code, requestData) {
  if (code === MSPCodes.MSP_ESC_PARAMETERS) {
    const buffer = currentVirtualEscBuffer();
    return buffer ? Uint8Array.from(buffer) : undefined;
  }
  if (code === MSPCodes.MSP_SET_ESC_PARAMETERS) {
    if (virtualEscManufacturerId && requestData) {
      virtualEscBuffers.set(
        virtualEscManufacturerId,
        Uint8Array.from(requestData),
      );
    }
    return new Uint8Array(0);
  }
  if (code === MSPCodes.MSP_SET_4WIF_ESC_FWD_PROG) {
    return new Uint8Array(0);
  }
  return undefined;
}

export function applyVirtualConfig() {
  FC.resetState();

  Object.assign(FC.CONFIG, {
    targetName: "VirtualFC",
    name: "VirtualFC",
    buildVersion: CONFIGURATOR.virtualFwVersion,
    flightControllerVersion: CONFIGURATOR.virtualFwVersion,
    flightControllerIdentifier: "WGFL",
    apiVersion: CONFIGURATOR.virtualApiVersion,
    motorCount: 2, // lets the motor 2 RPM filter group be exercised in virtual mode
    servoCount: 4,
    sampleRateHz: 4000,
    activeSensors: 63, // activate all sensors
  });

  Object.assign(FC.ADVANCED_CONFIG, {
    pid_process_denom: 2,
  });

  // Status
  Object.assign(FC.FLIGHT_STATS, {
    stats_total_flights: 7,
    stats_total_time_s: 6000,
    stats_min_armed_time_s: 30,
  });

  // Configuration
  FC.SERIAL_CONFIG.ports = new Array(6);
  FC.SERIAL_CONFIG.ports[0] = {
    identifier: 20,
    auxChannelIndex: 0,
    functions: ["MSP"],
    msp_baudrate: 115200,
    gps_baudrate: 57600,
    telemetry_baudrate: "AUTO",
    blackbox_baudrate: 115200,
  };

  for (let i = 1; i < FC.SERIAL_CONFIG.ports.length; i++) {
    FC.SERIAL_CONFIG.ports[i] = {
      identifier: i - 1,
      auxChannelIndex: 0,
      functions: [],
      msp_baudrate: 115200,
      gps_baudrate: 57600,
      telemetry_baudrate: "AUTO",
      blackbox_baudrate: 115200,
    };
  }

  FC.SERIAL_CONFIG.ports[1].functionMask = 64; // RX_SERIAL
  FC.SERIAL_CONFIG.ports[2].functionMask = 1024; // ESC_SENSOR
  FC.SERIAL_CONFIG.ports[3].functionMask = 2; // GPS
  // The rest of the app reads port.functions (names), not the raw mask --
  // keep both in step so tab-list gating and the journey's link checks see
  // the same ports a real board would report.
  FC.SERIAL_CONFIG.ports[1].functions = ["RX_SERIAL"];
  FC.SERIAL_CONFIG.ports[2].functions = ["ESC_SENSOR"];
  FC.SERIAL_CONFIG.ports[3].functions = ["GPS"];

  // Receiver
  FC.FEATURE_CONFIG.features.RX_SERIAL = true;
  FC.FEATURE_CONFIG.features.TELEMETRY = true;
  Object.assign(FC.RX_CONFIG, {
    serialrx_provider: 9, // CRSF
  });

  Object.assign(FC.RC_CONFIG, {
    rc_center: 1500,
    rc_deflection: 510,
    rc_min_throttle: 0,
    rc_max_throttle: 0,
    rc_deadband: 5,
    rc_yaw_deadband: 5,
  });

  Object.assign(FC.ANALOG, {
    rssi: 700,
  });

  FC.RC_MAP = [0, 1, 3, 2, 5, 4, 6, 7];

  Object.assign(FC.TELEMETRY_CONFIG, {
    crsf_telemetry_mode: 1,
    crsf_telemetry_rate: 500,
    crsf_telemetry_ratio: 8,
    telemetry_sensors_list: [4, 5, 6, 7, 8],
  });

  FC.RC = {
    channels: new Array(16).fill(1500),
    active_channels: 16,
  };

  FC.RX_CHANNELS = new Array(16).fill(1500);
  FC.RC_COMMAND = new Array(16).fill(0);

  // Failsafe
  Object.assign(FC.RX_CONFIG, {
    rx_pulse_min: 885,
    rx_pulse_max: 2115,
  });

  for (let i = 0; i < 16; i++) {
    FC.RXFAIL_CONFIG[i] = {
      mode: i < 5 ? 0 : 1,
      value: 1500,
    };
  }

  // Power
  Object.assign(FC.BATTERY_CONFIG, {
    vbatmincellvoltage: 330,
    vbatmaxcellvoltage: 430,
    vbatwarningcellvoltage: 350,
    capacity: 10000,
    voltageMeterSource: 1,
    currentMeterSource: 1,
  });

  Object.assign(FC.SMARTFUEL_CONFIG, {
    mode: 0,
    voltageDropRate: 10,
    chargeDropRate: 50,
    sagGain: 40,
  });

  Object.assign(FC.BATTERY_STATE, {
    cellCount: 10,
    voltage: 20,
    mAhDrawn: 1000,
    amperage: 3,
  });

  // Gyro
  FC.FEATURE_CONFIG.features.DYN_NOTCH = true;
  FC.FEATURE_CONFIG.features.RPM_FILTER = true;

  Object.assign(FC.FILTER_CONFIG, {
    dyn_notch_count: 6,
    dyn_notch_q: 20,
    dyn_notch_min_hz: 50,
    dyn_notch_max_hz: 200,

    rpm_preset: 2,
    rpm_min_hz: 20,
  });

  // Motors
  FC.MOTOR_DATA = new Array(8);
  Object.assign(FC.MOTOR_CONFIG, {
    mincommand: 1000,
    minthrottle: 1070,
    maxthrottle: 2000,
    motor_count_blheli: 2, // lets ESC2 (motor 2) be exercised in virtual mode
    motor_pwm_protocol: 0,
    motor_pwm_rate: 250,
    motor_poles: [8, 8, 8, 8],
    motor_rpm_lpf: [0, 0, 0, 0],
    use_dshot_telemetry: false,
    use_unsynced_pwm: false,
    motor1_gear_ratio: [1, 9],
    motor2_gear_ratio: [1, 5],
  });

  FC.FEATURE_CONFIG.features.ESC_SENSOR = true;
  FC.FEATURE_CONFIG.features.FREQ_SENSOR = true;
  Object.assign(FC.ESC_SENSOR_CONFIG, {
    protocol: 1,
  });

  Object.assign(FC.MOTOR_TELEMETRY_DATA, {
    rpm: [10_000],
    voltage: [11_000],
    current: [15_000],
    temperature: [250],
    temperature2: [250],
    invalidPercent: [500],
  });

  // Blackbox
  Object.assign(FC.BLACKBOX, {
    blackboxDevice: 1,
    blackboxMode: 2,
    supported: true,
    blackboxGracePeriod: 5,
    blackboxDenom: 2,
    blackboxRollingErase: 1,
  });

  Object.assign(FC.DATAFLASH, {
    ready: true,
    supported: true,
    sectors: 1024,
    totalSize: 128 * 1024 * 1024,
    usedSize: 64 * 1024 * 1024,
  });

  Object.assign(FC.SDCARD, {
    supported: false,
    state: 1,
    freeSizeKB: 1024,
    totalSizeKB: 2048,
  });

  Object.assign(FC.DEBUG_CONFIG, {
    debugMode: 0,
    debugAxis: 0,
    debugModeCount: 83,
  });

  FC.BEEPER_CONFIG.beepers = new Beepers(FC.CONFIG);
  FC.BEEPER_CONFIG.dshotBeaconConditions = new Beepers(FC.CONFIG, [
    "RX_LOST",
    "RX_SET",
  ]);

  FC.SERVO_CONFIG = new Array(26);
  for (let i = 0; i < FC.SERVO_CONFIG.length; i++) {
    FC.SERVO_CONFIG[i] = {
      mid: 1500,
      min: -700,
      max: 700,
      rneg: 500,
      rpos: 500,
      rate: 333,
      speed: 0,
      flags: 0,
    };
  }

  FC.ADJUSTMENT_RANGES = new Array(42);
  for (let i = 0; i < FC.ADJUSTMENT_RANGES.length; i++) {
    FC.ADJUSTMENT_RANGES[i] = {
      adjFunction: 0,
      enaChannel: 0,
      enaRange: {
        start: 1500,
        end: 1500,
      },
      adjChannel: 0,
      adjRange1: {
        start: 1500,
        end: 1500,
      },
      adjRange2: {
        start: 1500,
        end: 1500,
      },
      adjMin: 0,
      adjMax: 100,
      adjStep: 1,
    };
  }

  FC.LED_STRIP = new Array(256);
  for (let i = 0; i < FC.LED_STRIP.length; i++) {
    FC.LED_STRIP[i] = {
      x: 0,
      y: 0,
      functions: ["c"],
      color: 0,
      directions: [],
      parameters: 0,
    };
  }

  Object.assign(FC.ANALOG, {
    voltage: 12,
    mAhdrawn: 1200,
    amperage: 3,
  });

  FC.SENSOR_CONFIG = {
    acc_hardware: 1,
    baro_hardware: 1,
    mag_hardware: 1,
  };

  FC.AUX_CONFIG = [
    // ARM flag
    "ARM",

    // Flight modes
    "ANGLE",
    "HORIZON",
    "TRAINER",
    "ALTHOLD",
    "RESCUE",
    "GPSRESCUE",
    "FAILSAFE",

    // RC modes
    "PREARM",
    "PARALYZE",
    "BEEPERON",
    "BEEPERMUTE",
    "LEDLOW",
    "CALIB",
    "TELEMETRY",
    "BEEPGPSCOUNT",
    "BLACKBOX",
    "BLACKBOXERASE",
    "CAMERA1",
    "CAMERA2",
    "CAMERA3",
    "VTXPITMODE",
    "VTXCONTROLDISABLE",
    "STICKCOMMANDDISABLE",
    "USER1",
    "USER2",
    "USER3",
    "USER4",
  ];
  FC.AUX_CONFIG_IDS = [
    0, 1, 2, 4, 5, 6, 7, 8, 12, 13, 15, 17, 19, 20, 24, 25, 26, 27, 28, 29, 30,
    31, 32, 33, 34, 35, 36, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  ];

  FC.MIXER_INPUTS = [
    { rate: 0, min: 0, max: 0 },
    { rate: 0, min: 0, max: 0 },
    { rate: 0, min: 0, max: 0 },
    { rate: 0, min: 0, max: 0 },
    { rate: 0, min: 0, max: 0 },
  ];

  // Firmware default fixed-wing mixer (pg/mixer.c): S1 left aileron, S2
  // right aileron (opposite sign), S3 elevator, S4 rudder, M1 throttle --
  // so the setup journey / airframe canvas have something to draw and the
  // derived checks can be exercised without hardware.
  const rule = (oper, src, dst, weight) => ({
    oper,
    src,
    dst,
    offset: 0,
    weight,
    weightNeg: weight,
    speed: 0,
    curve: 0,
    condition: 0,
  });
  FC.MIXER_CONFIG.model_type = 0; // REGULAR_AIRPLANE
  FC.MIXER_RULES = [
    rule(1, 1, 1, 1000),
    rule(1, 1, 2, -1000),
    rule(1, 2, 3, 1000),
    rule(1, 3, 4, 1000),
    rule(1, 4, 27, 1000),
  ];
  while (FC.MIXER_RULES.length < 32) {
    FC.MIXER_RULES.push(rule(0, 0, 0, 0));
  }

  // ARM bound to AUX1 (channel 5) high, ANGLE on AUX2 -- mode ranges are
  // stored as (value - 1500) / 5 steps on the wire, but the parsed form is
  // absolute microseconds.
  FC.MODE_RANGES = [
    { id: 0, auxChannelIndex: 0, range: { start: 1700, end: 2100 } },
    { id: 1, auxChannelIndex: 1, range: { start: 1300, end: 1700 } },
  ];
  FC.MODE_RANGES_EXTRA = [
    { id: 0, modeLogic: 0, linkedTo: 0 },
    { id: 1, modeLogic: 0, linkedTo: 0 },
  ];

  Object.assign(FC.FAILSAFE_CONFIG, {
    failsafe_delay: 10,
    failsafe_off_delay: 10,
    failsafe_throttle: 1000,
    failsafe_switch_mode: 0,
    failsafe_throttle_low_delay: 100,
    failsafe_procedure: 1,
  });

  Object.assign(FC.BOARD_ALIGNMENT_CONFIG, { roll: 0, pitch: 0, yaw: 0 });
  FC.VOLTAGE_METER_CONFIGS = [
    {
      id: 10,
      sensorType: 0,
      vbatscale: 110,
      vbatresdivval: 10,
      vbatresdivmultiplier: 1,
    },
  ];
  FC.CURRENT_METER_CONFIGS = [{ id: 10, sensorType: 1, scale: 400, offset: 0 }];
  FC.VOLTAGE_METERS = [{ id: 10, voltage: 12.4 }];
  FC.CURRENT_METERS = [{ id: 10, amperage: 1.2, mAhDrawn: 120 }];
  FC.SERVO_DATA = [1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500];

  FC.PID_PROFILE.pid_mode = 1;

  Object.assign(FC.RC_TUNING, {
    rates_type: 0,
  });
}

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (CONFIGURATOR.virtualMode) {
      newModule?.applyVirtualConfig();
    }
  });
}
