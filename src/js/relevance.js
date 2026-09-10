// Field visibility = tier x relevance.
//
// Every field carries a disclosure tier and a relevance predicate over the
// Aircraft Profile. A field is shown when its tier is at or below the current
// disclosure level AND its predicate passes. Nothing is ever removed -- only
// folded away; settings search (P7) ignores both and finds anything.

export const TIERS = ["essential", "standard", "expert"];

export const TIER_RANK = {
  essential: 0,
  standard: 1,
  expert: 2,
};

export const DEFAULT_TIER = "standard";
export const DEFAULT_LEVEL = "standard";

export function normaliseLevel(level) {
  return TIERS.includes(level) ? level : DEFAULT_LEVEL;
}

export function tierVisible(tier, level) {
  const t = TIER_RANK[tier ?? DEFAULT_TIER] ?? TIER_RANK[DEFAULT_TIER];
  const l = TIER_RANK[normaliseLevel(level)];
  return t <= l;
}

export function predicatePasses(when, profile) {
  if (when === undefined || when === null || when === true) return true;
  if (when === false) return false;
  if (typeof when === "function") {
    try {
      return !!when(profile);
    } catch {
      // A broken predicate must never hide a field.
      return true;
    }
  }
  return true;
}

// Resolve a field definition { tier, when } against a profile and level.
export function isVisible(def, profile, level) {
  if (!def) return true;
  return tierVisible(def.tier, level) && predicatePasses(def.when, profile);
}

// ---- Field registry -------------------------------------------------------
//
// A single map of field id -> { tier, when, tab?, labelKey? }. Starts empty;
// the disclosure sweep (P7) fills it tab by tab. Ids are dotted paths of the
// form "<tab>.<section>.<field>" and are what <Tier id="..."> looks up.

const registry = new Map();

export function registerField(id, def) {
  registry.set(id, { tier: DEFAULT_TIER, ...def });
}

export function registerFields(fields) {
  for (const [id, def] of Object.entries(fields)) registerField(id, def);
}

export function getField(id) {
  return registry.get(id) ?? null;
}

export function allFields() {
  return [...registry.entries()].map(([id, def]) => ({ id, ...def }));
}

export function clearRegistry() {
  registry.clear();
}

// Resolve visibility for a registered field id. Unregistered ids are always
// visible so forgetting to tag a field can never make it disappear.
export function visible(fieldId, profile, level) {
  return isVisible(getField(fieldId), profile, level);
}

// ---- Reusable predicates ----------------------------------------------------

export const when = {
  always: () => true,
  hasServos: (p) => !!p?.hasServos,
  hasMotors: (p) => !!p?.hasMotors,
  isGlider: (p) => !!p?.isGlider,
  twoMotors: (p) => (p?.motorCount ?? 0) >= 2,
  oneMotor: (p) => (p?.motorCount ?? 0) === 1,
  differentialThrust: (p) => !!p?.differentialThrust,
  isFlyingWing: (p) => p?.layout === "flyingWing",
  isConventional: (p) => p?.layout === "conventional",
  isCustomMixer: (p) => !!p?.isCustom,
  hasRudder: (p) => !!p?.hasRudder,
  hasFlaps: (p) => !!p?.hasFlaps,
  hasAilerons: (p) => (p?.ailerons ?? 0) > 0,
  hasVtail: (p) => p?.tail === "vtail",
  hasThrustVector: (p) => !!p?.peripherals?.thrustVector || (p?.thrustVectorAxes?.length ?? 0) > 0,
  hasGps: (p) => !!p?.peripherals?.gps,
  hasLedStrip: (p) => !!p?.peripherals?.ledStrip,
  hasTelemetry: (p) => !!p?.peripherals?.telemetry,
  hasEscSensor: (p) => !!p?.peripherals?.escSensor,
  hasBlackbox: (p) => !!p?.peripherals?.blackbox,
  hasCurrentSensor: (p) => !!p?.peripherals?.currentSensor,
  hasVoltageSensor: (p) => !!p?.peripherals?.voltageSensor,
  hasMagnetometer: (p) => !!p?.peripherals?.magnetometer,
  hasBarometer: (p) => !!p?.peripherals?.barometer,
  hasBusServos: (p) => !!p?.peripherals?.busServos,
  serialLink: (p) => p?.link?.type === "serial",
  ppmOrPwmLink: (p) => p?.link?.type === "ppm" || p?.link?.type === "pwm",
  armSwitchBound: (p) => !!p?.armSwitch?.bound,
  drivesYaw: (p) => !!p?.axesDriven?.yaw,
  drivesThrottle: (p) => !!p?.axesDriven?.throttle,
  not:
    (pred) =>
    (p) =>
      !pred(p),
  all:
    (...preds) =>
    (p) =>
      preds.every((f) => f(p)),
  any:
    (...preds) =>
    (p) =>
      preds.some((f) => f(p)),
};
