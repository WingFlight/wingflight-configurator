// What each servo output drives (MSP2_WING_SERVO_ROLES, the firmware's
// servoRoles PG in pg/servo_role.h). Descriptive only: the FC never reads
// it. It names servos everywhere they are listed and tells tools which
// servos share a surface.
//
// One byte per servo: the role in the upper 5 bits, and which servo of that
// role it is (1-8, stored as 0-7) in the lower 3. The numbers are part of the
// MSP interface and match servoRole_e: never renumber.
//
// Pure helpers, no FC import: scripts/tests/servo-roles.test.mjs loads this
// file in plain Node.

export const SERVO_ROLE = {
  NONE: 0,
  AILERON: 1,
  AILERON_LEFT: 2,
  AILERON_RIGHT: 3,
  ELEVATOR: 4,
  ELEVATOR_LEFT: 5,
  ELEVATOR_RIGHT: 6,
  RUDDER: 7,
  VTAIL_LEFT: 8,
  VTAIL_RIGHT: 9,
  ELEVON_LEFT: 10,
  ELEVON_RIGHT: 11,
  FLAP: 12,
  FLAP_LEFT: 13,
  FLAP_RIGHT: 14,
  SPOILER: 15,
  SPOILER_LEFT: 16,
  SPOILER_RIGHT: 17,
  THROTTLE: 18,
  THRUST_VECTOR_PITCH: 19,
  THRUST_VECTOR_YAW: 20,
  THRUST_VECTOR_ROLL: 21,
  STEERING: 22,
  GEAR: 23,
  WHEEL_BRAKE: 24,
  TOW_RELEASE: 25,
  PAYLOAD_RELEASE: 26,
  SMOKE: 27,
  CHOKE: 28,
  // 29-30 reserved for new roles
  OTHER: 31,
};

// In the order the role list offers them, with the i18n key of each
// (servoRole_<key>).
export const SERVO_ROLES = [
  { value: SERVO_ROLE.NONE, key: "none" },
  { value: SERVO_ROLE.AILERON_LEFT, key: "aileronLeft" },
  { value: SERVO_ROLE.AILERON_RIGHT, key: "aileronRight" },
  { value: SERVO_ROLE.AILERON, key: "aileron" },
  { value: SERVO_ROLE.ELEVATOR, key: "elevator" },
  { value: SERVO_ROLE.ELEVATOR_LEFT, key: "elevatorLeft" },
  { value: SERVO_ROLE.ELEVATOR_RIGHT, key: "elevatorRight" },
  { value: SERVO_ROLE.RUDDER, key: "rudder" },
  { value: SERVO_ROLE.VTAIL_LEFT, key: "vtailLeft" },
  { value: SERVO_ROLE.VTAIL_RIGHT, key: "vtailRight" },
  { value: SERVO_ROLE.ELEVON_LEFT, key: "elevonLeft" },
  { value: SERVO_ROLE.ELEVON_RIGHT, key: "elevonRight" },
  { value: SERVO_ROLE.FLAP_LEFT, key: "flapLeft" },
  { value: SERVO_ROLE.FLAP_RIGHT, key: "flapRight" },
  { value: SERVO_ROLE.FLAP, key: "flap" },
  { value: SERVO_ROLE.SPOILER_LEFT, key: "spoilerLeft" },
  { value: SERVO_ROLE.SPOILER_RIGHT, key: "spoilerRight" },
  { value: SERVO_ROLE.SPOILER, key: "spoiler" },
  { value: SERVO_ROLE.THROTTLE, key: "throttle" },
  { value: SERVO_ROLE.THRUST_VECTOR_PITCH, key: "thrustVectorPitch" },
  { value: SERVO_ROLE.THRUST_VECTOR_YAW, key: "thrustVectorYaw" },
  { value: SERVO_ROLE.THRUST_VECTOR_ROLL, key: "thrustVectorRoll" },
  { value: SERVO_ROLE.STEERING, key: "steering" },
  { value: SERVO_ROLE.GEAR, key: "gear" },
  { value: SERVO_ROLE.WHEEL_BRAKE, key: "wheelBrake" },
  { value: SERVO_ROLE.TOW_RELEASE, key: "towRelease" },
  { value: SERVO_ROLE.PAYLOAD_RELEASE, key: "payloadRelease" },
  { value: SERVO_ROLE.SMOKE, key: "smoke" },
  { value: SERVO_ROLE.CHOKE, key: "choke" },
  { value: SERVO_ROLE.OTHER, key: "other" },
];

// Roles of the control surfaces and thrust vectoring: the ones a model setup
// in the Mixer lays out, and so replaces. The rest (throttle servo, gear,
// smoke, ...) are left as they are.
const SURFACE_ROLES = new Set([
  SERVO_ROLE.AILERON,
  SERVO_ROLE.AILERON_LEFT,
  SERVO_ROLE.AILERON_RIGHT,
  SERVO_ROLE.ELEVATOR,
  SERVO_ROLE.ELEVATOR_LEFT,
  SERVO_ROLE.ELEVATOR_RIGHT,
  SERVO_ROLE.RUDDER,
  SERVO_ROLE.VTAIL_LEFT,
  SERVO_ROLE.VTAIL_RIGHT,
  SERVO_ROLE.ELEVON_LEFT,
  SERVO_ROLE.ELEVON_RIGHT,
  SERVO_ROLE.FLAP,
  SERVO_ROLE.FLAP_LEFT,
  SERVO_ROLE.FLAP_RIGHT,
  SERVO_ROLE.THRUST_VECTOR_PITCH,
  SERVO_ROLE.THRUST_VECTOR_YAW,
  SERVO_ROLE.THRUST_VECTOR_ROLL,
]);

export const ROLE_NUMBER_MAX = 8;

export function packRole(role, number = 1) {
  const n = Math.min(Math.max(number, 1), ROLE_NUMBER_MAX);
  return ((role & 0x1f) << 3) | (n - 1);
}

export function roleOf(value) {
  return (value ?? 0) >> 3;
}

// Which servo of its role this is, 1-8.
export function roleNumberOf(value) {
  return ((value ?? 0) & 0x07) + 1;
}

// i18n key of a role; a role this configurator doesn't know (added in newer
// firmware) is shown as such rather than hidden.
export function roleKey(role) {
  const entry = SERVO_ROLES.find((r) => r.value === role);
  return entry ? `servoRole_${entry.key}` : "servoRole_unknown";
}

// The servos (0-based) with the same role as `servo`, itself included, in
// servo order. Empty for a servo with no role.
export function servosWithRole(values, servo) {
  const role = roleOf(values?.[servo]);
  if (!role) return [];
  return (values ?? [])
    .map((value, i) => (roleOf(value) === role ? i : -1))
    .filter((i) => i >= 0);
}

// The role table with every role's servos numbered 1, 2, ... in servo order,
// so the numbers follow the outputs the servos are on. Returns a new array.
export function renumberRoles(values) {
  const next = {};
  return (values ?? []).map((value) => {
    const role = roleOf(value);
    if (!role) return 0;
    next[role] = (next[role] ?? 0) + 1;
    return packRole(role, next[role]);
  });
}

// Sets `servo`'s role and renumbers. Returns a new array.
export function setRole(values, servo, role) {
  const copy = [...(values ?? [])];
  copy[servo] = packRole(role, 1);
  return renumberRoles(copy);
}

// The role table after a model setup in the Mixer: `layout` holds the role
// of each servo the setup uses (0-based servo -> role). Servos it doesn't
// use keep their role, unless it was a surface role, which the new setup
// replaces. Numbered in servo order.
export function applyLayoutRoles(values, layout) {
  const out = (values ?? []).map((value, servo) => {
    if (servo in layout) return packRole(layout[servo], 1);
    return SURFACE_ROLES.has(roleOf(value)) ? 0 : value;
  });
  return renumberRoles(out);
}

// Text for a servo's role, e.g. "Left aileron" or, with another servo on
// the same role, "Left aileron 2". `t` is the i18n lookup. Empty for none.
export function roleText(values, servo, t) {
  const value = values?.[servo];
  const role = roleOf(value);
  if (!role) return "";
  const name = t(roleKey(role));
  const shared = servosWithRole(values, servo).length > 1;
  return shared ? `${name} ${roleNumberOf(value)}` : name;
}
