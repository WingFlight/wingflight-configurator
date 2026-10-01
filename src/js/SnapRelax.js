// MSP_PID_PROFILE's snap relax tail: roll/pitch feedback relaxed against a fast
// three-axis stick input (pop top, pinwheel, snap). It follows the level damping
// byte, so it is only written when that was read too.
export function readSnapRelax(data, profile) {
    profile.hasSnapRelax = profile.hasLevelDamping && data.remaining() >= 6;
    if (!profile.hasSnapRelax) return;
    profile.snapRelaxStrength = data.readU8();
    profile.snapRelaxThreshold = data.readU8();
    profile.snapRelaxWindow = data.readU16();
    profile.snapRelaxHold = data.readU16();
}

export function writeSnapRelax(buffer, profile) {
    if (!profile.hasLevelDamping || !profile.hasSnapRelax) return;
    buffer.push8(profile.snapRelaxStrength)
        .push8(profile.snapRelaxThreshold)
        .push16(profile.snapRelaxWindow)
        .push16(profile.snapRelaxHold);
}
