// MSP_PID_PROFILE's prop-hang relax tail: roll I held back in a prop hang so the
// prop torque can roll the airframe. It follows the snap relax tail, so it is only
// written when that was read too.
export function readPropHang(data, profile) {
    profile.hasPropHang = profile.hasSnapRelax && data.remaining() >= 4;
    if (!profile.hasPropHang) return;
    profile.propHangStrength = data.readU8();
    profile.propHangAngle = data.readU8();
    profile.propHangFade = data.readU16();
}

export function writePropHang(buffer, profile) {
    if (!profile.hasSnapRelax || !profile.hasPropHang) return;
    buffer.push8(profile.propHangStrength)
        .push8(profile.propHangAngle)
        .push16(profile.propHangFade);
}
