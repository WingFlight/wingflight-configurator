import {
  ALWAYS_ON_CH,
  PRIMARY_CHANNEL_COUNT,
  calcAdjValue,
} from "@/tabs/adjustments/util.js";

import { FC } from "@/js/fc.svelte.js";

export const PID_ADJUSTMENT_FUNCTIONS = [
  [18, 19, 20, 21, 57], // Roll P/I/D/F/B
  [14, 15, 16, 17, 56], // Pitch P/I/D/F/B
  [22, 23, 24, 25, 58], // Yaw P/I/D/F/B
];

export const MASTER_GAIN_ADJUSTMENT_FUNCTIONS = [85, 84, 86]; // Roll/Pitch/Yaw

// Roll/Pitch/Yaw, same order as MASTER_GAIN_ADJUSTMENT_FUNCTIONS. Unlike the
// PID/MasterGain functions, these aren't tied to a fixed slot (motor/PID
// axis) - they trim whichever servo output(s) FC.MIXER_RULES currently mixes
// from the corresponding stabilized axis input, so callers need to resolve
// the affected servo(s) themselves (see Servos tab).
export const SERVO_TRIM_ADJUSTMENT_FUNCTIONS = [89, 90, 91]; // Roll/Pitch/Yaw

// Thrust Vector's own independent PID loop (FEATURE_THRUST_VECTOR) -- same
// shape as PID_ADJUSTMENT_FUNCTIONS/MASTER_GAIN_ADJUSTMENT_FUNCTIONS above,
// but a separate table since these tune FC.TV_PIDS/TV_PID_PROFILE, not the
// main loop's FC.PIDS/PID_PROFILE.
export const TV_PID_ADJUSTMENT_FUNCTIONS = [
  [95, 96, 97, 98, 99],    // TV Roll P/I/D/F/B
  [100, 101, 102, 103, 104], // TV Pitch P/I/D/F/B
  [105, 106, 107, 108, 109], // TV Yaw P/I/D/F/B
];

export const TV_MASTER_GAIN_ADJUSTMENT_FUNCTIONS = [92, 93, 94]; // Roll/Pitch/Yaw

// TV Hold's gain (flight/tv_hold.c) -- a single scalar, not per-axis like the
// tables above (the hold engine itself is a single 3-axis instance).
export const TV_HOLD_GAIN_ADJUSTMENT_FUNCTION = 110;

function auxChannelValue(channel) {
  return channel >= 0 && channel < ALWAYS_ON_CH
    ? FC.RC.channels[channel + PRIMARY_CHANNEL_COUNT]
    : null;
}

export function getAdjustmentState(adjFunction) {
  const matches = (FC.ADJUSTMENT_RANGES ?? [])
    .map((range, slotIndex) => ({ range, slotIndex }))
    .filter(({ range }) => range.adjFunction === adjFunction);

  if (matches.length === 0) {
    return null;
  }

  const states = matches.map(({ range, slotIndex }) => {
    const adjType = range.adjStep > 0 ? 2 : 1;
    const result = calcAdjValue(
      range,
      adjType,
      auxChannelValue(range.enaChannel),
      auxChannelValue(range.adjChannel),
      ALWAYS_ON_CH,
    );

    return {
      active: result.active,
      adjType,
      slotIndex,
      channel: range.adjChannel,
    };
  });

  return states.find((state) => state.active) ?? states[0];
}

// Mirrors the `AUX${n+1}` convention used by the channel dropdowns in the
// Adjustments tab (see adjChannelOptions in Adjustments.svelte) so the label
// shown here matches what the user picked there.
export function adjustmentChannelLabel(adjustment) {
  if (!adjustment || adjustment.channel == null) {
    return undefined;
  }

  return adjustment.channel === -1 ? "AUTO" : `AUX${adjustment.channel + 1}`;
}

export function adjustmentTitle(adjustment) {
  if (!adjustment) {
    return undefined;
  }

  const channelLabel = adjustmentChannelLabel(adjustment);
  const channelSuffix = channelLabel ? ` (${channelLabel})` : "";

  return `Adjustment slot ${adjustment.slotIndex + 1}${channelSuffix}${
    adjustment.active ? " is active" : " targets this value"
  }`;
}
