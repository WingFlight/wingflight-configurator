export const DEBUG_AXIS = [
  "0 / ROLL",
  "1 / PITCH",
  "2 / YAW",
  "3 / THROTTLE",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
];

export const LOG_RATES = {
  8000: [8, 16, 32, 80, 160, 320, 800],
  4000: [4, 8, 16, 40, 80, 160, 400],
  2000: [2, 4, 8, 20, 40, 80, 200],
  1000: [1, 2, 4, 10, 20, 40, 100],
  3200: [3, 6, 12, 32, 64, 128, 320],
  1600: [2, 4, 8, 16, 32, 64, 160],
  1067: [1, 2, 4, 10, 21, 42, 106],
  800: [1, 2, 4, 8, 16, 32, 80],
  0: [1, 2, 4, 8, 16, 32, 64, 128, 256],
};

export function getDebugModes() {
  // Index = debugType_e value in wingflight-firmware src/main/build/debug.h.
  // Keep in the same order; UNUSED_n are reserved slots with no data.
  return [
    "NONE",
    "CYCLETIME",
    "BATTERY",
    "GYRO_FILTERED",
    "ACCELEROMETER",
    "PIDLOOP",
    "GYRO_SCALED",
    "RC_COMMAND",
    "UNUSED_8",
    "ESC_SENSOR",
    "SCHEDULER",
    "STACK",
    "ESC_SENSOR_DATA",
    "ESC_SENSOR_FRAME",
    "ALTITUDE",
    "DYN_NOTCH",
    "DYN_NOTCH_TIME",
    "DYN_NOTCH_FREQ",
    "RX_FRSKY_SPI",
    "RX_SFHSS_SPI",
    "GYRO_RAW",
    "DUAL_GYRO_RAW",
    "DUAL_GYRO_DIFF",
    "SBUS",
    "FPORT",
    "UNUSED_25",
    "UNUSED_26",
    "UNUSED_27",
    "ADC_INTERNAL",
    "UNUSED_29",
    "UNUSED_30",
    "CURRENT_SENSOR",
    "USB",
    "UNUSED_33",
    "RTH",
    "ITERM_RELAX",
    "ACRO_TRAINER",
    "SETPOINT",
    "RX_SIGNAL_LOSS",
    "RC_RAW",
    "RC_DATA",
    "DYN_LPF",
    "RX_SPEKTRUM_SPI",
    "DSHOT_RPM_TELEMETRY",
    "RPM_FILTER",
    "RPM_SOURCE",
    "UNUSED_46",
    "AIRBORNE",
    "DUAL_GYRO_SCALED",
    "DSHOT_RPM_ERRORS",
    "CRSF_LINK_STATISTICS_UPLINK",
    "CRSF_LINK_STATISTICS_PWR",
    "CRSF_LINK_STATISTICS_DOWN",
    "BARO",
    "GPS_RESCUE_THROTTLE_PID",
    "FREQ_SENSOR",
    "UNUSED_56",
    "UNUSED_57",
    "BLACKBOX_OUTPUT",
    "GYRO_SAMPLE",
    "RX_TIMING",
    "UNUSED_61",
    "UNUSED_62",
    "GHST",
    "SCHEDULER_DETERMINISM",
    "TIMING_ACCURACY",
    "RX_EXPRESSLRS_SPI",
    "RX_EXPRESSLRS_PHASELOCK",
    "RX_STATE_TIME",
    "UNUSED_69",
    "UNUSED_70",
    "UNUSED_71",
    "UNUSED_72",
    "UNUSED_73",
    "UNUSED_74",
    "UNUSED_75",
    "UNUSED_76",
    "UNUSED_77",
    "GYRO_CALIBRATION",
    "AUTOHOVER",
    "ATTHOLD",
    "TVHOLD",
  ];
}

export function getLogFields() {
  return [
    "command",
    "setpoint",
    "mixer",
    "pid",
    "attitude",
    "gyroraw",
    "gyro",
    "acc",
    "mag",
    "alt",
    "battery",
    "rssi",
    "gps",
    "rpm",
    "motors",
    "servos",
    "vbec",
    "vbus",
    "temps",
    "esc",
    "bec",
    "esc2",
  ];
}

export function formatFilesizeKilobytes(kilobytes) {
  if (kilobytes < 1024) {
    return `${Math.round(kilobytes)}kB`;
  }

  const megabytes = kilobytes / 1024;
  if (megabytes < 900) {
    return `${megabytes.toFixed(1)}MB`;
  }

  return `${(megabytes / 1024).toFixed(1)}GB`;
}

export function formatFilesizeBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  return formatFilesizeKilobytes(bytes / 1024);
}
