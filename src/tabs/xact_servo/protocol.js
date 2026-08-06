// Wire format for MSP_XACT_PARAMS / MSP_SET_XACT_PARAMS -- 14 bytes, shared by both the GET
// and SET directions so a round-trip (read, edit, write) needs no re-mapping:
//   u8 physicalId, u8 appIdOffset, u16 dataRate (LE), u8 range, u8 direction, u8 pulseType,
//   u8 channel, u8 center, u8 p1, u8 p2, u8 d1, u8 tb, u8 potGap
// Mirrors rotorflight-firmware_rework's xact_servo_gui.py, which is the reference
// implementation for this feature.

export const PAYLOAD_LENGTH = 14;

// physicalId 0 is never assigned to a real FBUS sensor -- the firmware returns an all-zero
// payload when no XACT servo has been discovered yet, so this is how the GUI (and the
// reference Python tool) tells "nothing found" apart from a legitimately all-zero servo.
export const NO_SERVO_PHYSICAL_ID = 0;

export function parseServoParams(data) {
    return {
        physicalId: data.getUint8(0),
        appIdOffset: data.getUint8(1),
        dataRate: data.getUint16(2, true),
        range: data.getUint8(4),
        direction: data.getUint8(5),
        pulseType: data.getUint8(6),
        channel: data.getUint8(7),
        center: data.getUint8(8),
        p1: data.getUint8(9),
        p2: data.getUint8(10),
        d1: data.getUint8(11),
        tb: data.getUint8(12),
        potGap: data.getUint8(13),
    };
}

export function buildServoParamsPayload(values) {
    const buf = new Uint8Array(PAYLOAD_LENGTH);
    buf[0] = values.physicalId;
    buf[1] = values.appIdOffset;
    buf[2] = values.dataRate & 0xff;
    buf[3] = (values.dataRate >> 8) & 0xff;
    buf[4] = values.range;
    buf[5] = values.direction;
    buf[6] = values.pulseType;
    buf[7] = values.channel;
    buf[8] = values.center;
    buf[9] = values.p1;
    buf[10] = values.p2;
    buf[11] = values.d1;
    buf[12] = values.tb;
    buf[13] = values.potGap;
    return buf;
}
