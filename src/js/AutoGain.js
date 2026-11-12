// MSP_PID_PROFILE's auto gain tail: P and D of an axis turned down while that
// axis oscillates, then eased back up. It follows the prop-hang tail, so it is
// only written when that was read too.
const AXIS_FIELDS = ["autoGainRoll", "autoGainPitch", "autoGainYaw"];

export function readAutoGain(data, profile) {
    profile.hasAutoGain = profile.hasPropHang && data.remaining() >= 6;
    if (!profile.hasAutoGain) return;
    for (const field of AXIS_FIELDS) profile[field] = data.readU8();
    profile.autoGainMin = data.readU8();
    profile.autoGainThreshold = data.readU8();
    profile.autoGainRecovery = data.readU8();
}

export function writeAutoGain(buffer, profile) {
    if (!profile.hasPropHang || !profile.hasAutoGain) return;
    for (const field of AXIS_FIELDS) buffer.push8(profile[field]);
    buffer.push8(profile.autoGainMin)
        .push8(profile.autoGainThreshold)
        .push8(profile.autoGainRecovery);
}

// On when any axis has it.
export function autoGainOn(profile) {
    return AXIS_FIELDS.some((field) => profile[field] > 0);
}

// All three axes together.
export function setAutoGain(profile, on) {
    for (const field of AXIS_FIELDS) profile[field] = on ? 1 : 0;
}
