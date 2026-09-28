import { FC } from "@/js/fc.svelte.js";
import { GainCurve } from "@/js/GainCurve.js";
import { MixerCurve } from "@/js/MixerCurve.js";
import { ServoBalanceCurve } from "@/js/ServoBalanceCurve.js";
import { MSPCodes } from "@/js/msp/MSPCodes.js";
import { getManufacturer } from "@/tabs/esc_programming/manufacturers/index.js";

// MSP_SELECT_SETTING's index offset for "select rate profile N" (see Rates.svelte)
const RATE_PROFILE_MASK = 128;

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

// FC's $state proxies can't go through structuredClone, and the slot copies below must not
// alias the live FC objects a tab is editing.
const clone = (value) => JSON.parse(JSON.stringify(value));

// Mirrors the firmware's reset templates (pg/pid.c resetPidProfile(), pg/rates.c,
// pg/tv_pid.c) so a fresh virtual FC looks like a freshly flashed one.
const DEFAULT_PIDS = [
  [50, 16, 0, 100, 0], // roll  P I D F B
  [50, 16, 0, 100, 0], // pitch
  [80, 20, 0, 100, 0], // yaw
];

function defaultPidSlot() {
  return {
    pids: clone(DEFAULT_PIDS),
    profile: {
      pid_mode: 1,
      itermDecayTimeRoll: 60,
      itermDecayTimePitch: 60,
      itermDecayTimeYaw: 60,
      iterm_decay_limit: 35,
      itermRelaxLevelRoll: 22,
      itermRelaxLevelPitch: 22,
      itermRelaxLevelYaw: 22,
      bouncebackRoll: 5,
      bouncebackPitch: 5,
      bouncebackYaw: 5,
      errorLimitRoll: 45,
      errorLimitPitch: 45,
      errorLimitYaw: 60,
      gyroCutoffRoll: 50,
      gyroCutoffPitch: 50,
      gyroCutoffYaw: 100,
      dtermCutoffRoll: 15,
      dtermCutoffPitch: 15,
      dtermCutoffYaw: 20,
      btermCutoffRoll: 15,
      btermCutoffPitch: 15,
      btermCutoffYaw: 20,
      levelAngleStrength: 40,
      levelAngleLimit: 55,
      horizonLevelStrength: 40,
      acroTrainerGain: 75,
      acroTrainerLimit: 20,
      attHoldGain: 40,
      attHoldDeadband: 5,
      attHoldMaxRate: 300,
      fwTpaGain: 100,
      fwTpaCurve: 0,
      // API 22.10 GPS speed attenuation (curve 0 = off)
      hasFwSpa: true,
      fwSpaGain: 100,
      fwSpaCurve: 0,
      fwSpaSpeedMax: 150,
      masterGainRoll: 100,
      masterGainPitch: 100,
      masterGainYaw: 100,
      autoHoverGain: 50,
      autoHoverMaxAngle: 30,
      autoHoverMaxRate: 120,
      autoHoverRollDeadband: 5,
      autoHoverThrottleAssistGain: 0,
      autoHoverThrottleAssistMax: 15,
      autoHoverThrottleAssistTriggerMs: 300,
      crossAxisRelaxStrength: 0,
      crossAxisRelaxLevel: 100,
      crossAxisRelaxCutoff: 10,
      crossAxisRelaxPitchStrength: 0,
      gainCurveRoll: 0,
      gainCurvePitch: 0,
      gainCurveYaw: 0,
      // API 22.4 per-axis attitude limits: raw 0 = inherit the shared limit above
      hasAxisLimits: true,
      angleRollLimit: 55,
      anglePitchLimit: 55,
      trainerRollLimit: 20,
      trainerPitchLimit: 20,
      axisLimitsRaw: [0, 0, 0, 0],
      axisLimitsInitial: [55, 55, 20, 20],
    },
  };
}

function defaultRateSlot() {
  return {
    roll_rc_rate: 0.5,
    pitch_rc_rate: 0.5,
    yaw_rc_rate: 0.7,
    roll_rc_expo: 0.3,
    pitch_rc_expo: 0.3,
    yaw_rc_expo: 0.3,
    roll_srate: 0.05,
    pitch_srate: 0.05,
    yaw_srate: 0.05,
    roll_response_time: 0,
    pitch_response_time: 0,
    yaw_response_time: 0,
    roll_accel_limit: 0,
    pitch_accel_limit: 0,
    yaw_accel_limit: 0,
    roll_setpoint_boost_gain: 0,
    pitch_setpoint_boost_gain: 0,
    yaw_setpoint_boost_gain: 0,
    roll_setpoint_boost_cutoff: 15,
    pitch_setpoint_boost_cutoff: 15,
    yaw_setpoint_boost_cutoff: 90,
    yaw_dynamic_ceiling_gain: 0,
    yaw_dynamic_deadband_gain: 10,
    yaw_dynamic_deadband_filter: 60,
  };
}

function defaultTvSlot() {
  return {
    pids: clone(DEFAULT_PIDS),
    profile: {
      masterGainRoll: 100,
      masterGainPitch: 100,
      masterGainYaw: 100,
      gainCurveRoll: 0,
      gainCurvePitch: 0,
      gainCurveYaw: 0,
      itermDecayTimeRoll: 60,
      itermDecayTimePitch: 60,
      itermDecayTimeYaw: 60,
      iterm_decay_limit: 35,
      itermRelaxLevelRoll: 22,
      itermRelaxLevelPitch: 22,
      itermRelaxLevelYaw: 22,
      bouncebackRoll: 5,
      bouncebackPitch: 5,
      bouncebackYaw: 5,
      errorLimitRoll: 45,
      errorLimitPitch: 45,
      errorLimitYaw: 60,
      dtermCutoffRoll: 15,
      dtermCutoffPitch: 15,
      dtermCutoffYaw: 20,
      btermCutoffRoll: 15,
      btermCutoffPitch: 15,
      btermCutoffYaw: 20,
      gyroCutoffRoll: 50,
      gyroCutoffPitch: 50,
      gyroCutoffYaw: 100,
      tvHoldGain: 40,
      tvHoldDeadband: 5,
      tvHoldMaxRate: 300,
    },
  };
}

// The FC's per-profile "EEPROM": FC.PIDS/PID_PROFILE, FC.RC_TUNING and FC.TV_PIDS/
// TV_PID_PROFILE only ever hold the active profile (as on real hardware), so every
// profile's saved copy lives here. A save writes the active slot, a select loads one -
// saving on the SET rather than on the switch means edits discarded on the way out of
// a tab are never persisted.
let pidSlots = [];
let rateSlots = [];
let tvSlots = [];

function copyPids(target, pids) {
  pids.forEach((axis, i) => axis.forEach((value, j) => (target[i][j] = value)));
}

function loadPidSlot(index) {
  const slot = clone(pidSlots[index]);
  copyPids(FC.PIDS, slot.pids);
  copyPids(FC.PIDS_ACTIVE, slot.pids);
  Object.assign(FC.PID_PROFILE, slot.profile);
  FC.CONFIG.profile = index;
}

function storePidSlot() {
  pidSlots[FC.CONFIG.profile] = {
    pids: FC.PIDS.map((axis) => axis.slice(0, 5)),
    profile: clone(FC.PID_PROFILE),
  };
}

function loadRateSlot(index) {
  Object.assign(FC.RC_TUNING, clone(rateSlots[index]));
  FC.CONFIG.rateProfile = index;
}

function storeRateSlot() {
  rateSlots[FC.CONFIG.rateProfile] = clone(FC.RC_TUNING);
}

function loadTvSlot(index) {
  const slot = clone(tvSlots[index]);
  copyPids(FC.TV_PIDS, slot.pids);
  Object.assign(FC.TV_PID_PROFILE, slot.profile);
  FC.CONFIG.tvProfile = index;
}

function storeTvSlot() {
  tvSlots[FC.CONFIG.tvProfile] = {
    pids: clone(FC.TV_PIDS),
    profile: clone(FC.TV_PID_PROFILE),
  };
}

function resetProfileSlots() {
  const count = FC.CONFIG.numProfiles;
  pidSlots = Array.from({ length: count }, defaultPidSlot);
  rateSlots = Array.from({ length: count }, defaultRateSlot);
  tvSlots = Array.from({ length: count }, defaultTvSlot);
  loadPidSlot(0);
  loadRateSlot(0);
  loadTvSlot(0);
}

// Mirrors pidGetRuntimeGains() (flight/pid.c) for the active profile's *saved* values -
// like the real FC, effective gains don't move until a save. Sticks and throttle sit at
// rest in virtual mode, so curves are evaluated at zero deflection/throttle. There is
// no GPS fix, so GPS speed attenuation stays at 100%.
function encodeEffectivePidGains() {
  const { pids, profile } = pidSlots[FC.CONFIG.profile];
  const curveScale = (index, x) => {
    const curve = FC.GAIN_CURVES[index - 1];
    return index > 0 && curve ? GainCurve.evaluate(curve, x) / 100 : 1;
  };
  const centi = (value) => Math.round(Math.max(0, value) * 100);
  const fwTpa = (profile.fwTpaGain / 100) * curveScale(profile.fwTpaCurve, 0);

  const buffer = [];
  buffer.push8(3); // payload version
  buffer.push8(profile.pid_mode);
  buffer.push32(centi(fwTpa * 100));

  ["Roll", "Pitch", "Yaw"].forEach((axis, i) => {
    const [P, I, D, F, B] = pids[i];
    const masterGainRaw = profile[`masterGain${axis}`];
    const gainCurve = curveScale(profile[`gainCurve${axis}`], 0);
    const masterGain = (masterGainRaw / 100) * gainCurve;

    [P, I, D, F, B].forEach((value) => buffer.push16(value));
    buffer.push16(masterGainRaw);
    buffer.push32(centi(gainCurve * 100));
    buffer.push32(0); // gain curve position: stick centred
    buffer.push32(centi(P * masterGain * fwTpa));
    buffer.push32(centi(I * masterGain));
    buffer.push32(centi(D * masterGain * fwTpa));
    buffer.push32(centi(F));
    buffer.push32(centi(B));
  });

  buffer.push32(centi(100)); // SPA scale: no GPS fix
  buffer.push16(0); // SPA speed
  buffer.push8(profile.fwSpaCurve > 0 ? 1 : 0);

  return Uint8Array.from(buffer);
}

// Runs a virtual reply through the real decoder, so FC is updated exactly as it would
// be by hardware (and a payload that drifts from the wire format shows up here).
function decodeVirtualReply(code, payload) {
  globalThis.mspHelper.process_data({
    code,
    dataView: new DataView(payload.buffer),
    crcError: false,
    callbacks: [],
  });
  return payload;
}

// MSP.send_message's virtualMode branch calls this before falling back to its normal
// no-op ack. Most reads need nothing here - FC is seeded once by applyVirtualConfig() and
// a read in virtual mode simply leaves it alone - so this only covers requests whose
// effect on real hardware is more than "return what FC already holds". `requestData` is
// the outgoing write payload (a plain array of byte values) for write codes.
export function getVirtualResponse(code, requestData) {
  switch (code) {
    case MSPCodes.MSP_SELECT_SETTING: {
      const index = requestData[0];
      if (index & RATE_PROFILE_MASK) {
        loadRateSlot(index & ~RATE_PROFILE_MASK);
      } else {
        loadPidSlot(index);
      }
      return undefined;
    }
    case MSPCodes.MSP_SET_PID_TUNING:
    case MSPCodes.MSP_SET_PID_PROFILE:
      storePidSlot();
      return undefined;
    case MSPCodes.MSP_SET_RC_TUNING:
      storeRateSlot();
      return undefined;
    // Like the FC, copying onto the active profile reloads it
    case MSPCodes.MSP_COPY_PROFILE: {
      const [type, dst, src] = requestData;
      if (type === 0) {
        pidSlots[dst] = clone(pidSlots[src]);
        if (dst === FC.CONFIG.profile) {
          loadPidSlot(dst);
        }
      } else if (type === 1) {
        rateSlots[dst] = clone(rateSlots[src]);
        if (dst === FC.CONFIG.rateProfile) {
          loadRateSlot(dst);
        }
      }
      return undefined;
    }
    case MSPCodes.MSP_SET_RESET_CURR_PID:
      pidSlots[FC.CONFIG.profile] = defaultPidSlot();
      loadPidSlot(FC.CONFIG.profile);
      return undefined;
    case MSPCodes.MSP2_WING_SET_TV_PID_CONFIG:
      storeTvSlot();
      return undefined;
    case MSPCodes.MSP2_WING_SELECT_TV_PROFILE:
      loadTvSlot(requestData[0]);
      return undefined;
    case MSPCodes.MSP2_WING_COPY_TV_PID_PROFILE: {
      const [dst, src] = requestData;
      tvSlots[dst] = clone(tvSlots[src]);
      if (dst === FC.CONFIG.tvProfile) {
        loadTvSlot(dst);
      }
      return undefined;
    }
    case MSPCodes.MSP2_WING_EFFECTIVE_PID_GAINS:
      return decodeVirtualReply(code, encodeEffectivePidGains());
    default:
      return getVirtualEscResponse(code, requestData);
  }
}

function getVirtualEscResponse(code, requestData) {
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
    rc_roll_deadband: 5,
    rc_pitch_deadband: 5,
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
    vbatmincellvoltage: 1,
    vbatmaxcellvoltage: 4,
    vbatwarningcellvoltage: 3,
    capacity: 10000,
    voltageMeterSource: 1,
    currentMeterSource: 1,
    hasProfileCells: true,
    cellCounts: [3, 4, 0, 0, 0, 0],
    vbatmincellvoltages: [1, 1, 1, 1, 1, 1],
    vbatmaxcellvoltages: [4, 4, 4, 4, 4, 4],
    vbatfullcellvoltages: [3.9, 3.9, 3.9, 3.9, 3.9, 3.9],
    vbatwarningcellvoltages: [3, 3, 3, 3, 3, 3],
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

  // Modes: ARM on AUX1 high, ANGLE on AUX2 mid; the rest of the
  // MAX_MODE_ACTIVATION_CONDITION_COUNT slots unused, as the FC reports them.
  FC.MODE_RANGES = Array.from({ length: 20 }, () => ({
    id: 0,
    auxChannelIndex: 0,
    range: { start: 900, end: 900 },
  }));
  FC.MODE_RANGES_EXTRA = Array.from({ length: 20 }, () => ({
    id: 0,
    modeLogic: 0,
    linkedTo: 0,
  }));
  FC.MODE_RANGES[0] = {
    id: 0,
    auxChannelIndex: 0,
    range: { start: 1700, end: 2100 },
  };
  FC.MODE_RANGES[1] = {
    id: 1,
    auxChannelIndex: 1,
    range: { start: 1300, end: 1700 },
  };
  FC.MODE_RANGES_EXTRA[1].id = 1;

  // Profiles/Rates/Thrust Vector (also sets FC.PIDS, PID_PROFILE, RC_TUNING,
  // TV_PIDS and TV_PID_PROFILE from the active slots)
  resetProfileSlots();

  FC.GAIN_CURVES = Array.from({ length: GainCurve.CURVE_COUNT }, () =>
    GainCurve.nullCurve(),
  );

  // Mixer: pg/mixer.c defaults - regular airplane, 2 ailerons + elevator +
  // rudder on S1-S4 and throttle on M1
  FC.MIXER_CONFIG.model_type = 0;

  FC.MIXER_INPUTS = Array.from({ length: 35 }, (_, i) => {
    if (i === 0) return { rate: 0, min: 0, max: 0 }; // MIXER_IN_NONE
    if (i === 4) return { rate: 1000, min: 0, max: 1000 }; // stabilized throttle
    return { rate: 1000, min: -1000, max: 1000 };
  });

  const SERVO_OUTPUT = 1; // MIXER_SERVO_OFFSET
  const MOTOR_OUTPUT = 27; // MIXER_MOTOR_OFFSET
  const mixerRule = (src, dst, weight) => ({
    oper: 1, // MIXER_OP_SET
    src,
    dst,
    offset: 0,
    weight,
    weightNeg: weight,
    speed: 0,
    curve: 0,
    condition: 0,
    role: 0,
  });
  FC.MIXER_RULES = [
    mixerRule(1, SERVO_OUTPUT + 0, 1000), // left aileron
    mixerRule(1, SERVO_OUTPUT + 1, -1000), // right aileron
    mixerRule(2, SERVO_OUTPUT + 2, 1000), // elevator
    mixerRule(3, SERVO_OUTPUT + 3, 1000), // rudder
    mixerRule(4, MOTOR_OUTPUT + 0, 1000), // motor
  ];
  while (FC.MIXER_RULES.length < 32) {
    FC.MIXER_RULES.push({ ...mixerRule(0, 0, 0), oper: 0 });
  }

  FC.MIXER_CURVES = Array.from({ length: MixerCurve.CURVE_COUNT }, () =>
    MixerCurve.nullCurve(),
  );

  // One balance curve per servo, same count as MSP_SERVO_CONFIGURATIONS
  FC.SERVO_CURVES = FC.SERVO_CONFIG.map(() => ServoBalanceCurve.nullCurve());

  // Failsafe/arming: pg/failsafe.c and pg/arming.c defaults
  Object.assign(FC.FAILSAFE_CONFIG, {
    failsafe_delay: 15,
    failsafe_off_delay: 10,
    failsafe_throttle: 1000,
    failsafe_switch_mode: 0,
    failsafe_throttle_low_delay: 100,
    failsafe_procedure: 1, // drop
    failsafe_recovery_delay: 10,
  });
  FC.ARMING_CONFIG.auto_disarm_delay = 5;

  // Power: ADC battery + BEC voltage meters and the battery current meter,
  // with pg/voltage.c / pg/current.c calibration defaults
  FC.VOLTAGE_METERS = [
    { id: 10, voltage: 12 },
    { id: 20, voltage: 5.1 },
  ];
  FC.VOLTAGE_METER_CONFIGS = FC.VOLTAGE_METERS.map(({ id }) => ({
    id,
    sensorType: 1, // ADC
    vbatscale: 110,
    vbatresdivval: 10,
    vbatresdivmultiplier: 1,
  }));
  FC.CURRENT_METERS = [{ id: 10, amperage: 3, mAhDrawn: 1200 }];
  FC.CURRENT_METER_CONFIGS = [
    { id: 10, sensorType: 1, scale: 400, offset: 0 }, // ADC
  ];

  // LED strip: io/ledstrip.c's hsv[] palette (padded to
  // LED_CONFIGURABLE_COLOR_COUNT) and default mode/special colors, in
  // MSP_LED_STRIP_MODECOLOR order
  FC.LED_COLORS = [
    [0, 0, 0],
    [0, 255, 255],
    [0, 0, 255],
    [30, 0, 255],
    [60, 0, 255],
    [90, 0, 255],
    [120, 0, 255],
    [150, 0, 255],
    [180, 0, 255],
    [210, 0, 255],
    [240, 0, 255],
    [270, 0, 255],
    [300, 0, 255],
    [330, 0, 255],
    [0, 0, 0],
    [0, 0, 0],
  ].map(([h, s, v]) => ({ h, s, v }));

  const WHITE = 1,
    RED = 2,
    ORANGE = 3,
    YELLOW = 4,
    GREEN = 6,
    MINT = 7;
  const CYAN = 8,
    BLUE = 10,
    VIOLET = 11,
    PINK = 13;
  const modeColors = [
    [WHITE, VIOLET, RED, PINK, BLUE, ORANGE], // orientation
    [BLUE, VIOLET, YELLOW, PINK, BLUE, ORANGE], // horizon
    [CYAN, VIOLET, YELLOW, PINK, BLUE, ORANGE], // angle
    [MINT, VIOLET, ORANGE, PINK, BLUE, ORANGE], // rescue
  ];
  const specialColors = [GREEN, BLUE, WHITE, 0, 0, RED, ORANGE, GREEN, 0, 0, 0];
  FC.LED_MODE_COLORS = [
    ...modeColors.flatMap((colors, mode) =>
      colors.map((color, direction) => ({ mode, direction, color })),
    ),
    ...specialColors.map((color, direction) => ({ mode: 4, direction, color })),
    { mode: 5, direction: 0, color: 3 }, // LED_AUX_CHANNEL: throttle
  ];
}

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (CONFIGURATOR.virtualMode) {
      newModule?.applyVirtualConfig();
    }
  });
}
