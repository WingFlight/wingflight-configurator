// MSP_PID_PROFILE's API 22.10 tail: GPS speed attenuation (SPA), mirroring
// fwTpaGain/fwTpaCurve with GPS speed in place of throttle. It follows the
// API 22.4 attitude limits, so it is only written when those were read too.
export function readFwSpa(data, profile) {
    profile.hasFwSpa = profile.hasAxisLimits && data.remaining() >= 4;
    profile.fwSpaGain = profile.hasFwSpa ? data.readU8() : 100;
    profile.fwSpaCurve = profile.hasFwSpa ? data.readU8() : 0;
    profile.fwSpaSpeedMax = profile.hasFwSpa ? data.readU16() : 150;
}

export function writeFwSpa(buffer, profile) {
    if (!profile.hasAxisLimits || !profile.hasFwSpa) return;
    buffer.push8(profile.fwSpaGain)
        .push8(profile.fwSpaCurve)
        .push16(profile.fwSpaSpeedMax);
}
