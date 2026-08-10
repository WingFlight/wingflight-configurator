// The HTML min/max attributes on the rule inputs are display hints only --
// they don't stop a typed-in value from reaching FC.MIXER_RULES, and the FC
// only range-checks weight (not weightNeg/offset) on its own reboot, not over
// MSP. So out-of-range input has to be clamped here before it's committed.
export function clampInt(value, min, max) {
  const n = parseInt(value, 10) || 0;
  return Math.min(max, Math.max(min, n));
}

// weight/weightNeg are signed on the wire -- their sign is a rule's only
// notion of polarity. The GUI instead shows a single non-negative Weight, a
// Reverse checkbox (purely local; there's no separate wire field for it any
// more), and a Differential % expressing weightNeg as a fraction of weight:
// 0% is the common symmetric case, 100% fully suppresses the negative-input
// side, negative values boost it instead. Rules with mismatched weight/
// weightNeg signs, or |weightNeg| more than 2x |weight| (e.g. hand-edited via
// CLI), fall outside what this representation can express losslessly and get
// normalized the next time the rule is edited.
export const DIFFERENTIAL_MIN = -100;
export const DIFFERENTIAL_MAX = 100;

export function ruleToDisplay(rule) {
  let weight = rule.weight;
  let weightNeg = rule.weightNeg;
  // Firmware picks weight for input >= 0 and weightNeg for input < 0
  // (flight/mixer.c). Reverse flips which physical direction each branch
  // drives, so a reversed rule's "full" magnitude lives in weightNeg and its
  // differential-reduced magnitude lives in weight -- both negated. A
  // canonical (non-reversed) encoding never has either field negative
  // (weight is always >= 0 here and weightNeg's factor never goes below 0
  // per DIFFERENTIAL_MAX), so either field being negative is the reverse
  // signal; checking only weight missed the case where it's exactly 0 (100%
  // differential) but weightNeg still carries the reversed sign.
  const reverse = weight < 0 || weightNeg < 0;
  if (reverse) {
    [weight, weightNeg] = [-weightNeg, -weight];
  }
  const differential =
    weight === 0 ? 0 : Math.round((1 - weightNeg / weight) * 100);
  return {
    weight,
    differential: clampInt(differential, DIFFERENTIAL_MIN, DIFFERENTIAL_MAX),
    reverse,
  };
}

export function displayToRule(weight, differential, reverse, weightMin, weightMax) {
  const weightNeg = clampInt(
    Math.round(weight * (1 - differential / 100)),
    weightMin,
    weightMax,
  );
  // See ruleToDisplay: reversing swaps which branch (weight vs weightNeg)
  // gets the full magnitude, it doesn't just flip signs in place -- otherwise
  // the differential-reduced side stays pinned to whichever input sign it
  // was on before reversing, instead of following the surface it belongs to.
  if (reverse) {
    return { weight: -weightNeg, weightNeg: -weight };
  }
  return { weight, weightNeg };
}

// mixerInputs[].rate is a fixed-point multiplier on the wire (1000 = unity);
// the GUI shows its magnitude as a plain percentage, with a separate Invert
// checkbox controlling the sign -- inverting here flips every rule reading
// the axis at once, without having to touch each rule's own Reverse checkbox.
export const AXIS_GAIN_MIN = 0;
export const AXIS_GAIN_MAX = 200;

export function rateToPercent(rate) {
  return Math.round(Math.abs(rate) / 10);
}

export function percentToRate(percent, invert) {
  const magnitude = clampInt(percent, AXIS_GAIN_MIN, AXIS_GAIN_MAX) * 10;
  return invert ? -magnitude : magnitude;
}

export const OVERRIDE_PERCENT_MIN = -100;
export const OVERRIDE_PERCENT_MAX = 100;

// FC.MIXER_OVERRIDE shares the mixer input's own raw scale (1000 = 100%,
// see mixerSetInput() dividing by 1000.0f in flight/mixer.c) -- the same
// x10 convention rateToPercent/percentToRate already use for axis gain.
export function overridePercentToRaw(percent) {
  return clampInt(percent, OVERRIDE_PERCENT_MIN, OVERRIDE_PERCENT_MAX) * 10;
}

export function overrideRawToPercent(raw) {
  return Math.round(raw / 10);
}
