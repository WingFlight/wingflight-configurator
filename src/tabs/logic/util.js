import { LogicCondition } from "@/js/LogicCondition.js";

// A VALUE operand being compared against a Sensor or Profile sibling is
// entered/shown in that sibling's real-world unit (volts, m/s, 1-based
// profile number...) rather than the raw wire integer -- wire = (display -
// offset) * scale. `count`, when set, is how many valid values the sibling
// has (e.g. 6 battery profiles) -- used to clamp the number field's range
// instead of falling back to the generic int16 bounds.
export function transformFor(siblingType, siblingRawValue) {
  if (siblingType === LogicCondition.OPERAND_TYPE_SENSOR) {
    return { scale: LogicCondition.sensorScale(siblingRawValue), offset: 0, count: null };
  }
  if (siblingType === LogicCondition.OPERAND_TYPE_PROFILE) {
    return { scale: 1, offset: 1, count: LogicCondition.profileCount(siblingRawValue) };
  }
  return { scale: 1, offset: 0, count: null };
}

export function toDisplay(rawValue, type, transform) {
  if (type !== LogicCondition.OPERAND_TYPE_VALUE) return rawValue;
  const { scale, offset } = transform;
  const decimals = scale > 1 ? Math.round(Math.log10(scale)) : 0;
  return Number((rawValue / scale + offset).toFixed(decimals));
}

export function toRaw(displayValue, type, transform) {
  if (type !== LogicCondition.OPERAND_TYPE_VALUE) {
    return Math.round(displayValue) || 0;
  }
  const { scale, offset } = transform;
  return Math.round((displayValue - offset) * scale);
}

export function numberBounds(transform) {
  const { scale, offset, count } = transform;
  const step = scale > 1 ? 1 / scale : 1;
  if (count != null) {
    return { min: offset, max: offset + count - 1, step };
  }
  return { min: -32000 / scale + offset, max: 32000 / scale + offset, step };
}

// RC channel choices for the RC_CHANNEL operand type -- mirrors the order
// the firmware's rcInput[] array uses (Roll, Pitch, Yaw, Throttle, then AUX1..).
export const PRIMARY_CHANNEL_COUNT = 4;
