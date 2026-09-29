// MSP_PID_PROFILE's API 22.13 tail: ANGLE mode rate damping, percent of the
// measured roll/pitch rate subtracted from the level rate command. It follows
// the API 22.10 SPA tail, so it is only written when that was read too.
export function readLevelDamping(data, profile) {
    profile.hasLevelDamping = profile.hasFwSpa && data.remaining() >= 1;
    profile.levelDamping = profile.hasLevelDamping ? data.readU8() : 0;
}

export function writeLevelDamping(buffer, profile) {
    if (!profile.hasFwSpa || !profile.hasLevelDamping) return;
    buffer.push8(profile.levelDamping);
}
