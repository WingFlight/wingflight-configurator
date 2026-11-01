// Backup receivers - see wingflight-firmware's drivers/rx_input_backup.h.
//
// The firmware supports RX_INPUT_BACKUP_COUNT independent backup RX ports.
// Failover is a fixed priority chain: the primary RX, then backup 1, then
// backup 2. Each backup has its own serial port function (the port
// assignment is the enablement - there is no feature bit, same as the
// primary's RX_SERIAL) and its own protocol/wiring config.

export const RX_INPUT_BACKUP_COUNT = 2;

// FUNCTION_RX_INPUT_BACKUP (1 << 23) and FUNCTION_RX_INPUT_BACKUP2 (1 << 24),
// in priority order. Index into this with the backup number minus one.
export const RX_INPUT_BACKUP_FUNCTIONS = [8388608, 16777216];

// Keep in sync with wingflight-firmware's cli/settings.c
// lookupTableRxInputBackupProvider[] (same order, NONE=0 first) - this
// array's index must match the firmware enum. Display text matches
// RX_PROTOCOLS' own naming (tabs/receiver/protocols.js) for the same
// protocols, so the two dropdowns read consistently rather than one using
// full names and the other short codes.
export const RX_INPUT_BACKUP_PROVIDER_NAMES = [
  "None",
  "Futaba S.BUS",
  "FrSky FBUS",
  "FrSky F.PORT",
  "FrSky FBUS",
  "Jeti EXBUS",
  "TBS CRSF",
];

// Index 4 (old FPORT2) also detects the speed; it shows only if stored.
export const RX_INPUT_BACKUP_PROVIDER_FPORT2 = 4;

export function defaultRxInputBackupPortConfig() {
  return { provider: 0, inverted: false, halfDuplex: false, pinSwap: false };
}

export function defaultRxInputBackupPortStatus() {
  return { enabled: false, provider: 0, linkUp: false, channels: [] };
}

// True when a serial port carries backup `index`'s function.
export function hasRxInputBackupPort(ports, index) {
  const mask = RX_INPUT_BACKUP_FUNCTIONS[index];
  return !!mask && (ports ?? []).some((port) => port.functionMask & mask);
}

// Decoder for MSP2_WING_RX_INPUT_BACKUP_STATUS. Wire layout (firmware msp.c):
//   U8 payloadVersion
//   U8 enabled (backup 1)
//   [v3+] U8 mainLinkUp
//   [v2+] U8 provider (backup 1)
//   U8 linkUp (backup 1)
//   U8 activeSource: 0 = primary RX, n = backup n in control (v1-3: 1 = backup)
//   U8 channelCount, channelCount x U16 (backup 1)
//   [v4+] U8 portCount, then for each further backup:
//         U8 enabled, U8 provider, U8 linkUp, U8 channelCount, channelCount x U16
export function readRxInputBackupStatus(data) {
  const payloadVersion = data.readU8();

  function readChannels() {
    const count = data.readU8();
    const channels = [];
    for (let i = 0; i < count; i++) {
      channels.push(data.readU16());
    }
    return channels;
  }

  const first = defaultRxInputBackupPortStatus();
  first.enabled = data.readU8() !== 0;
  // null on older firmware (genuinely unknown) rather than guessing
  // true/false, so the UI can simply not render a main-link badge.
  const mainLinkUp = payloadVersion >= 3 ? data.readU8() !== 0 : null;
  first.provider = payloadVersion >= 2 ? data.readU8() : 0; // v1: always SBUS
  first.linkUp = data.readU8() !== 0;
  const activeSource = data.readU8();
  first.channels = readChannels();

  const ports = [first];
  if (payloadVersion >= 4) {
    const portCount = data.readU8();
    for (let i = 1; i < portCount; i++) {
      const port = defaultRxInputBackupPortStatus();
      port.enabled = data.readU8() !== 0;
      port.provider = data.readU8();
      port.linkUp = data.readU8() !== 0;
      port.channels = readChannels();
      ports.push(port);
    }
  }
  while (ports.length < RX_INPUT_BACKUP_COUNT) {
    ports.push(defaultRxInputBackupPortStatus());
  }

  const activeIndex = activeSource > 0 ? activeSource - 1 : -1;

  return {
    mainLinkUp,
    activeIndex, // -1 = primary RX in control, else the backup in control
    ports,
  };
}

// Decoder for MSP2_WING_RX_INPUT_BACKUP_CONFIG:
//   U8 payloadVersion, 4 x U8 (provider, inverted, halfDuplex, pinSwap) for
//   backup 1, [v2+] U8 portCount then the same 4 bytes per further backup.
export function readRxInputBackupConfig(data) {
  const payloadVersion = data.readU8();

  function readPort() {
    return {
      provider: data.readU8(),
      inverted: data.readU8() !== 0,
      halfDuplex: data.readU8() !== 0,
      pinSwap: data.readU8() !== 0,
    };
  }

  const ports = [readPort()];
  if (payloadVersion >= 2) {
    const portCount = data.readU8();
    for (let i = 1; i < portCount; i++) {
      ports.push(readPort());
    }
  }
  while (ports.length < RX_INPUT_BACKUP_COUNT) {
    ports.push(defaultRxInputBackupPortConfig());
  }

  return { ports };
}

// Encoder for MSP2_WING_SET_RX_INPUT_BACKUP_CONFIG (payload version 2). A
// version-1 firmware reads the first five bytes and ignores the rest.
export function writeRxInputBackupConfig(buffer, config) {
  const ports = config.ports;
  buffer.push8(2);
  ports.forEach((port, index) => {
    buffer
      .push8(port.provider)
      .push8(Number(port.inverted))
      .push8(Number(port.halfDuplex))
      .push8(Number(port.pinSwap));
    if (index === 0) {
      buffer.push8(ports.length);
    }
  });
}
