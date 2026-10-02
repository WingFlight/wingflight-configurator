// MSP_PID_PROFILE's API 22.4 tail. Keep raw zeroes on an unchanged save so
// upgraded profiles continue to inherit their existing shared limits.
export const ATTITUDE_LIMIT_FIELDS = [
    ['angleRollLimit', 'levelAngleLimit', 90],
    ['anglePitchLimit', 'levelAngleLimit', 75],
    ['trainerRollLimit', 'acroTrainerLimit', 90],
    ['trainerPitchLimit', 'acroTrainerLimit', 75],
];

export function readAttitudeLimits(data, profile) {
    profile.hasAxisLimits = data.remaining() >= 4;
    profile.axisLimitsRaw = [];
    profile.axisLimitsInitial = [];
    ATTITUDE_LIMIT_FIELDS.forEach(([key, fallback, maximum], index) => {
        const raw = profile.hasAxisLimits ? data.readU8() : 0;
        const value = raw ? Math.max(10, Math.min(maximum, raw)) : profile[fallback];
        profile[key] = value;
        profile.axisLimitsRaw[index] = raw;
        profile.axisLimitsInitial[index] = value;
    });
}

export function writeAttitudeLimits(buffer, profile) {
    if (!profile.hasAxisLimits) return;
    ATTITUDE_LIMIT_FIELDS.forEach(([key], index) => {
        buffer.push8(profile[key] === profile.axisLimitsInitial[index]
            ? profile.axisLimitsRaw[index] : profile[key]);
    });
}
