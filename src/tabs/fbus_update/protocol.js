// Wire format and firmware files for updating an FBUS device through the FC's
// FBUS master (firmware: drivers/fbus_ota.c, MSP2_WING_FBUS_OTA_*).
//
// The FC sends the image to the device with the OTA frames of the FrSky FBUS
// protocol. The Configurator streams the image into a 1 KiB buffer on the FC:
//   MSP2_WING_FBUS_OTA_START   U8 physical ID, U32 image size
//   MSP2_WING_FBUS_OTA_DATA    U32 offset, then up to 128 image bytes
//   MSP2_WING_FBUS_OTA_STATUS  see parseStatus()
//   MSP2_WING_FBUS_OTA_ABORT   no payload

export const MAX_DATA_LENGTH = 128;
export const MAX_IMAGE_SIZE = 1024 * 1024;
// Physical IDs the FC accepts: sensors 0x00-0x1B, 0x1E is the flight controller ID
export const PHYSICAL_IDS = [...Array(0x1c).keys(), 0x1e];

export const OtaState = {
    IDLE: 0,
    STARTING: 1,
    TRANSFER: 2,
    ENDING: 3,
    DONE: 4,
    FAILED: 5,
};

export const OtaError = {
    NONE: 0,
    NO_RESPONSE: 1,
    TIMEOUT: 2,
    REJECTED: 3,
    STALLED: 4,
    ABORTED: 5,
};

// MSP2_WING_FBUS_OTA_STATUS. `data` is the MSPHelper DataView with read helpers.
export function parseStatus(data) {
    return {
        state: data.readU8(),
        error: data.readU8(),
        physicalId: data.readU8(),
        size: data.readU32(),
        acked: data.readU32(),
        received: data.readU32(),
        bufferFree: data.readU16(),
        retries: data.readU16(),
    };
}

function pushU32(buffer, value) {
    buffer.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

export function buildStartPayload(physicalId, size) {
    const buffer = [physicalId];
    pushU32(buffer, size);
    return buffer;
}

export function buildDataPayload(offset, bytes) {
    const buffer = [];
    pushU32(buffer, offset);
    buffer.push(...bytes);
    return buffer;
}

// FrSky's firmware information header in front of .frsk files (EdgeTX
// FrSkyFirmwareInformation). EdgeTX removes it before sending the image, so do
// the same; .frk and .bin files are sent as they are.
const FRSK_FOURCC = 0x4b535246; // "FRSK"
const FRSK_HEADER_SIZE = 16;
const FRSK_FAMILIES = ["internal module", "external module", "receiver", "sensor", "Bluetooth", "power management", "flight controller"];

export function parseFirmwareFile(name, bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const info = { name, container: "raw", version: null, family: null };
    let payload = bytes;
    const hasHeader = bytes.byteLength >= FRSK_HEADER_SIZE && view.getUint32(0, true) === FRSK_FOURCC;

    // A .frsk file without its header is damaged: don't send it as a raw image
    if (name.toLowerCase().endsWith(".frsk") && !hasHeader) {
        throw new Error("fbusUpdateFileInvalid");
    }
    if (hasHeader) {
        const size = view.getUint32(8, true);
        if (bytes.byteLength !== FRSK_HEADER_SIZE + size) {
            throw new Error("fbusUpdateFileInvalid");
        }
        info.container = "frsk";
        info.version = `${view.getUint8(5)}.${view.getUint8(6)}.${view.getUint8(7)}`;
        info.family = FRSK_FAMILIES[view.getUint8(12)] ?? `#${view.getUint8(12)}`;
        payload = bytes.subarray(FRSK_HEADER_SIZE);
    }

    if (payload.byteLength === 0 || payload.byteLength > MAX_IMAGE_SIZE) {
        throw new Error("fbusUpdateFileInvalid");
    }
    return { info, payload };
}
