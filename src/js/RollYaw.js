// MSP_PID_PROFILE's roll-yaw coupling tail: the share of the roll rate the airframe
// yaws by itself, which the yaw loop then does not fight. One signed byte, percent,
// positive for yaw against the roll. It follows the prop-hang relax tail, so it is
// only written when that was read too.
export function readRollYaw(data, profile) {
    profile.hasRollYaw = profile.hasPropHang && data.remaining() >= 1;
    if (!profile.hasRollYaw) return;
    const raw = data.readU8();
    profile.rollYawCoupling = raw > 127 ? raw - 256 : raw;
}

export function writeRollYaw(buffer, profile) {
    if (!profile.hasPropHang || !profile.hasRollYaw) return;
    buffer.push8(profile.rollYawCoupling);
}
