// Geometry manifests for the aircraft shape artwork in
// src/images/aircraft_shapes/. The SVGs are drawn top-down, nose up, and all
// files of one layout share a viewBox, so a polygon authored here overlays
// the artwork exactly when both are placed in the same SVG coordinate space.
//
// Per surface: a hit polygon (viewBox units), a hinge line and a deflection
// mode. `foreshorten` is a surface hinged on a horizontal line seen from
// above -- it rotates out of the image plane, so we scale it towards the
// hinge by cos(angle). `inPlane` is a vertical surface (rudder) whose
// deflection is a rotation in the image plane about the hinge point.
// `sign` says which direction a positive servo deviation is drawn as
// (+1 = trailing edge up / right); the guided direction check asks the user
// whether the real surface agrees.
//
// Coordinates were measured from the visible paths of each SVG (see
// scratch tooling in the P2 work) and are exact to two decimals.

const CONV = { w: 103.99402, h: 68.333511 };
const WING = { w: 103.58047, h: 48.517796 };

function rect(x0, y0, x1, y1) {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

export const GEOMETRY = {
  conventional: {
    viewBox: CONV,
    // Layer files by feature; composed per profile in layersFor().
    layers: {
      shape: "conventional_shape",
      aileron: "conventional_aileron",
      flaps: "conventional_flaps",
      tailElevatorRudder: "conventional_normal_tail",
      tailElevatorOnly: "conventional_normal_tail_no_rudder",
      tailVtail: "conventional_v_tail",
      oneMotor: "conventional_one_motor",
      twoMotors: "conventional_dual_motor",
    },
    surfaces: {
      "aileron.left": { layer: "aileron", polygon: rect(3.98, 25.64, 22.32, 30.65), hinge: [[3.98, 25.64], [22.32, 25.64]], mode: "foreshorten", sign: 1 },
      "aileron.right": { layer: "aileron", polygon: rect(81.68, 25.64, 100.02, 30.65), hinge: [[81.68, 25.64], [100.02, 25.64]], mode: "foreshorten", sign: 1 },
      "flap.left": { layer: "flaps", polygon: rect(24.56, 25.17, 42.67, 30.15), hinge: [[24.56, 25.17], [42.67, 25.17]], mode: "foreshorten", sign: -1 },
      "flap.right": { layer: "flaps", polygon: rect(61.33, 25.17, 79.43, 30.15), hinge: [[61.33, 25.17], [79.43, 25.17]], mode: "foreshorten", sign: -1 },
      "elevator.left": { layer: "tailElevator", polygon: rect(35.65, 60.95, 48.97, 65.92), hinge: [[35.65, 60.95], [48.97, 60.95]], mode: "foreshorten", sign: 1 },
      "elevator.right": { layer: "tailElevator", polygon: rect(55.02, 60.95, 68.35, 65.92), hinge: [[55.02, 60.95], [68.35, 60.95]], mode: "foreshorten", sign: 1 },
      rudder: { layer: "tailElevatorRudder", polygon: rect(50.51, 53.37, 53.48, 65.88), hinge: [[52.0, 53.37], [52.0, 53.37]], mode: "inPlane", sign: 1 },
      "ruddervator.left": { layer: "tailVtail", polygon: rect(33.39, 58.88, 46.14, 67.66), hinge: [[33.39, 58.88], [46.14, 58.88]], mode: "foreshorten", sign: 1 },
      "ruddervator.right": { layer: "tailVtail", polygon: rect(57.86, 58.88, 70.6, 67.66), hinge: [[57.86, 58.88], [70.6, 58.88]], mode: "foreshorten", sign: 1 },
    },
    motors: {
      1: [{ x: 52.0, y: 1.6 }],
      2: [
        { x: 25.5, y: 10.8 },
        { x: 78.5, y: 10.8 },
      ],
    },
  },
  flyingWing: {
    viewBox: WING,
    layers: {
      shape: "flying_wing_shape",
      aileron: "flying_wing_aileron",
      flaps: "flying_wing_flaps",
      rudder: "flying_wing_rudder",
      oneMotor: "flying_wing_one_motor",
      twoMotors: "flying_wing_two_motor",
    },
    surfaces: {
      "elevon.left": { layer: "aileron", polygon: rect(3.55, 37.17, 19.19, 42.41), hinge: [[3.55, 37.17], [19.19, 37.17]], mode: "foreshorten", sign: 1 },
      "elevon.right": { layer: "aileron", polygon: rect(84.39, 37.17, 100.03, 42.41), hinge: [[84.39, 37.17], [100.03, 37.17]], mode: "foreshorten", sign: 1 },
      // A flying wing drawn with plain ailerons (no pitch mix) reuses the
      // elevon polygons.
      "aileron.left": { layer: "aileron", polygon: rect(3.55, 37.17, 19.19, 42.41), hinge: [[3.55, 37.17], [19.19, 37.17]], mode: "foreshorten", sign: 1 },
      "aileron.right": { layer: "aileron", polygon: rect(84.39, 37.17, 100.03, 42.41), hinge: [[84.39, 37.17], [100.03, 37.17]], mode: "foreshorten", sign: 1 },
      "flap.left": { layer: "flaps", polygon: rect(24.32, 36.24, 39.73, 41.4), hinge: [[24.32, 36.24], [39.73, 36.24]], mode: "foreshorten", sign: -1 },
      "flap.right": { layer: "flaps", polygon: rect(63.85, 36.24, 79.26, 41.4), hinge: [[63.85, 36.24], [79.26, 36.24]], mode: "foreshorten", sign: -1 },
      rudder: { layer: "rudder", polygon: rect(50.3, 24.07, 53.28, 39.59), hinge: [[51.79, 24.07], [51.79, 24.07]], mode: "inPlane", sign: 1 },
    },
    motors: {
      1: [{ x: 51.79, y: 47.0 }],
      2: [
        { x: 25.9, y: 18.7 },
        { x: 77.7, y: 18.7 },
      ],
    },
  },
};

// Which artwork layers to stack for a profile, in z-order.
export function layersFor(profile) {
  const layout = profile?.layout === "flyingWing" ? "flyingWing" : "conventional";
  const g = GEOMETRY[layout];
  const files = [g.layers.shape];
  const has = (role) => profile?.surfaces?.some((s) => s.role === role);

  if (layout === "flyingWing") {
    files.push(g.layers.aileron);
    if (has("rudder")) files.push(g.layers.rudder);
    if (has("flap")) files.push(g.layers.flaps);
  } else {
    if (has("aileron")) files.push(g.layers.aileron);
    if (has("ruddervator")) files.push(g.layers.tailVtail);
    else if (has("rudder")) files.push(g.layers.tailElevatorRudder);
    else files.push(g.layers.tailElevatorOnly);
    if (has("flap")) files.push(g.layers.flaps);
  }

  const motors = profile?.motorCount ?? 0;
  if (motors === 1) files.push(g.layers.oneMotor);
  else if (motors >= 2) files.push(g.layers.twoMotors);

  return { layout, viewBox: g.viewBox, files };
}

// Map the profile's surfaces onto polygons. A surface that spans both sides
// (a single aileron servo, a single flap servo) claims both polygons; the
// elevator is one surface drawn as two halves.
export function placedSurfaces(profile) {
  const layout = profile?.layout === "flyingWing" ? "flyingWing" : "conventional";
  const g = GEOMETRY[layout];
  const placed = [];
  const unplaced = [];

  for (const surface of profile?.surfaces ?? []) {
    let keys;
    if (surface.role === "elevator") keys = ["elevator.left", "elevator.right"];
    else if (surface.side === "both" || surface.side === "center") {
      keys = Object.keys(g.surfaces).filter((k) => k.startsWith(`${surface.role}.`));
      if (keys.length === 0 && g.surfaces[surface.role]) keys = [surface.role];
    } else {
      keys = [g.surfaces[surface.id] ? surface.id : null].filter(Boolean);
    }
    if (!keys || keys.length === 0) {
      unplaced.push(surface);
      continue;
    }
    for (const key of keys) {
      placed.push({ key, surface, geometry: g.surfaces[key] });
    }
  }

  // Polygons that exist in the drawn layers but no surface drives them.
  const drawn = new Set();
  const has = (role) => profile?.surfaces?.some((s) => s.role === role);
  if (layout === "flyingWing") {
    ["elevon.left", "elevon.right"].forEach((k) => drawn.add(k));
    if (has("rudder")) drawn.add("rudder");
    if (has("flap")) ["flap.left", "flap.right"].forEach((k) => drawn.add(k));
  } else {
    if (has("aileron")) ["aileron.left", "aileron.right"].forEach((k) => drawn.add(k));
    if (has("ruddervator")) ["ruddervator.left", "ruddervator.right"].forEach((k) => drawn.add(k));
    else {
      ["elevator.left", "elevator.right"].forEach((k) => drawn.add(k));
      if (has("rudder")) drawn.add("rudder");
    }
    if (has("flap")) ["flap.left", "flap.right"].forEach((k) => drawn.add(k));
  }
  const claimed = new Set(placed.map((p) => p.key));
  const unassigned = [...drawn].filter((k) => !claimed.has(k)).map((key) => ({ key, geometry: g.surfaces[key] }));

  return { layout, placed, unassigned, unplaced, motors: g.motors[Math.min(profile?.motorCount ?? 0, 2)] ?? [] };
}

export const MAX_DEFLECTION_DEG = 35;

// Servo pulse -> normalised deviation in [-1, 1] and display angle.
export function deflectionFor(pulse, servoConfig) {
  const mid = servoConfig?.mid ?? 1500;
  if (!Number.isFinite(pulse) || pulse <= 0) return { deviation: 0, angle: 0 };
  const deviation = Math.max(-1, Math.min(1, (pulse - mid) / 500));
  return { deviation, angle: deviation * MAX_DEFLECTION_DEG };
}

// SVG transform string for a surface at a given angle.
export function surfaceTransform(geometry, angleDeg) {
  const [[x0, y0], [x1, y1]] = geometry.hinge;
  if (geometry.mode === "inPlane") {
    return `rotate(${angleDeg.toFixed(2)} ${x0} ${y0})`;
  }
  // Foreshorten towards the (horizontal) hinge line.
  const cos = Math.max(0.12, Math.cos((angleDeg * Math.PI) / 180));
  const hy = (y0 + y1) / 2;
  const hx = (x0 + x1) / 2;
  return `translate(${hx} ${hy}) scale(1 ${cos.toFixed(3)}) translate(${-hx} ${-hy})`;
}

export function polygonPoints(polygon) {
  return polygon.map(([x, y]) => `${x},${y}`).join(" ");
}
