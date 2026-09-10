// The eight stages, in the order a plane is actually built.
//
// A stage never re-implements a tab: it embeds existing components and links
// out to the tabs it owns. `tabs` lists the tabs a stage deep-links into;
// TAB_OWNER maps each tab back to the single stage whose breadcrumb it shows.

export const STAGE_IDS = [
  "board",
  "airframe",
  "wiring",
  "link",
  "outputs",
  "safety",
  "power",
  "preflight",
];

export const STAGES = [
  {
    id: "board",
    number: 1,
    tabs: ["setup", "configuration", "status"],
    checks: ["board.firmwareSupported", "board.accCalibrated", "board.level", "board.orientationConfirmed"],
  },
  {
    id: "airframe",
    number: 2,
    tabs: ["mixer"],
    checks: ["airframe.modelTypeSet", "airframe.axesReachOutputs"],
  },
  {
    id: "wiring",
    number: 3,
    tabs: ["configuration", "servos", "motors"],
    checks: ["wiring.outputsHavePads", "wiring.rxPortConfigured", "wiring.noConflicts"],
  },
  {
    id: "link",
    number: 4,
    tabs: ["receiver", "auxiliary"],
    checks: ["link.primariesMoving", "link.channelMapSet", "link.endpointsInWindow", "link.armSwitchBound"],
  },
  {
    id: "outputs",
    number: 5,
    tabs: ["servos", "motors", "curves"],
    // Per-surface direction checks are generated from the profile; see
    // checks.js checksForStage().
    checks: ["outputs.servoLimitsSane", "outputs.throttleCalibrated"],
    dynamicChecks: "outputs.direction",
  },
  {
    id: "safety",
    number: 6,
    tabs: ["auxiliary", "failsafe"],
    checks: ["link.armSwitchBound", "safety.failsafeProcedureSet", "safety.failsafeVerified"],
  },
  {
    id: "power",
    number: 7,
    tabs: ["power"],
    checks: ["power.voltageCalibrated", "power.currentCalibrated", "power.warningThresholdsSet"],
  },
  {
    id: "preflight",
    number: 8,
    tabs: [],
    checks: [
      "preflight.surfaceDirections",
      "preflight.stabilisationDirection",
      "preflight.centreOfGravity",
      "preflight.controlThrows",
      "preflight.rangeCheck",
    ],
  },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));

// Which stage a tab belongs to for the breadcrumb. Tuning tabs point at the
// tuning board rather than a stage.
export const TAB_OWNER = {
  status: "board",
  setup: "board",
  configuration: "board",
  mixer: "airframe",
  servos: "outputs",
  motors: "outputs",
  curves: "outputs",
  receiver: "link",
  auxiliary: "safety",
  failsafe: "safety",
  power: "power",
  profiles: "tuning",
  rates: "tuning",
  gyro: "tuning",
  thrust_vector: "tuning",
  blackbox: "tuning",
  adjustments: "tuning",
};

export function stageForTab(tabName) {
  const owner = TAB_OWNER[tabName];
  return owner ? owner : null;
}

export function stageTitleKey(stageId) {
  return `journeyStage.${stageId}.title`;
}

export function stageQuestionKey(stageId) {
  return `journeyStage.${stageId}.question`;
}

// Badge vocabulary. There is deliberately no plain "done".
export const BADGE = {
  NOT_STARTED: "notStarted",
  IN_PROGRESS: "inProgress",
  NEEDS_ATTENTION: "needsAttention",
  VERIFIED: "verified",
  NOT_APPLICABLE: "notApplicable",
};
