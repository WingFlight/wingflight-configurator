// `id` must stay positionally aligned with the firmware's adjustmentFunc_e
// enum (fc/rc_adjustments.h) - this array is indexed directly by that value
// (FUNCTIONS[adjRange.adjFunction]), so entries are never reordered or
// deleted, only hidden. `hide: true` marks an id the firmware enum still
// defines but whose get/set is absent from rc_adjustments.c's
// adjustmentConfigs[] table (mostly heli-only concepts like cyclic/
// collective/governor/cross-coupling carried over from this firmware's
// Rotorflight lineage) - selecting one is silently inert, not dangerous,
// but does nothing on wingflight.
export function getFunctions() {
    return [
        { id: 0,    name: 'None',                       min: 0,     max: 100,    ticks: 10,   pips: [ 0, 20, 40, 60, 80, 100 ] },
        { id: 1,    name: 'RateProfile',                min: 1,     max: 6,      ticks: 0.25, pips: [ 1, 2, 3, 4, 5, 6 ] },
        { id: 2,    name: 'PIDProfile',                 min: 1,     max: 6,      ticks: 0.25, pips: [ 1, 2, 3, 4, 5, 6 ] },
        { id: 3,    name: 'LEDProfile',                 min: 1,     max: 4,      ticks: 0.25, pips: [ 1, 2, 3, 4 ] },
        { id: 4,    name: 'OSDProfile',                 min: 1,     max: 3,      ticks: 0.25, pips: [ 1, 2, 3 ] },
        { id: 5,    name: 'PitchRate',                  min: 0,     max: 100,    ticks: 10,   pips: [ 0, 20, 40, 60, 80, 100 ] },
        { id: 6,    name: 'RollRate',                   min: 0,     max: 100,    ticks: 10,   pips: [ 0, 20, 40, 60, 80, 100 ] },
        { id: 7,    name: 'YawRate',                    min: 0,     max: 100,    ticks: 10,   pips: [ 0, 20, 40, 60, 80, 100 ] },
        { id: 8,    name: 'PitchRCRate',                min: 1,     max: 200,    ticks: 10,   pips: [ 1, 50, 100, 150, 200 ] },
        { id: 9,    name: 'RollRCRate',                 min: 1,     max: 200,    ticks: 10,   pips: [ 1, 50, 100, 150, 200 ] },
        { id: 10,   name: 'YawRCRate',                  min: 1,     max: 200,    ticks: 10,   pips: [ 1, 50, 100, 150, 200 ] },
        { id: 11,   name: 'PitchRCExpo',                min: 0,     max: 100,    ticks: 5,    pips: [ 0, 20, 40, 60, 80, 100 ] },
        { id: 12,   name: 'RollRCExpo',                 min: 0,     max: 100,    ticks: 5,    pips: [ 0, 20, 40, 60, 80, 100 ] },
        { id: 13,   name: 'YawRCExpo',                  min: 0,     max: 100,    ticks: 5,    pips: [ 0, 20, 40, 60, 80, 100 ] },
        { id: 14,   name: 'PitchP',                     min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 15,   name: 'PitchI',                     min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 16,   name: 'PitchD',                     min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 17,   name: 'PitchF',                     min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 18,   name: 'RollP',                      min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 19,   name: 'RollI',                      min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 20,   name: 'RollD',                      min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 21,   name: 'RollF',                      min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 22,   name: 'YawP',                       min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 23,   name: 'YawI',                       min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 24,   name: 'YawD',                       min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 25,   name: 'YawF',                       min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 26,   name: 'YawCWStopGain',              min: 25,    max: 250,    ticks: 10,   pips: [ 50, 100, 150, 200, 250 ], hide: true },
        { id: 27,   name: 'YawCCWStopGain',             min: 25,    max: 250,    ticks: 10,   pips: [ 50, 100, 150, 200, 250 ], hide: true },
        { id: 28,   name: 'YawCyclicFF',                min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 29,   name: 'YawCollectiveFF',            min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 30,   name: 'YawCollectiveDyn',           min: -125,  max: 125,    ticks: 10,   pips: [ -100, -50, 0, 50, 100 ], hide: true },
        { id: 31,   name: 'YawCollectiveDecay',         min: 1,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 32,   name: 'PitchCollectiveFF',          min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 33,   name: 'PitchGyroCutoff',            min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 34,   name: 'RollGyroCutoff',             min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 35,   name: 'YawGyroCutoff',              min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 36,   name: 'PitchDtermCutoff',           min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 37,   name: 'RollDtermCutoff',            min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 38,   name: 'YawDtermCutoff',             min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 39,   name: 'RescueClimbCollective',      min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000 ], hide: true },
        { id: 40,   name: 'RescueHoverCollective',      min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000 ], hide: true },
        { id: 41,   name: 'RescueHoverAltitude',        min: 0,     max: 2500,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400 ], hide: true },
        { id: 42,   name: 'RescueAltP',                 min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 43,   name: 'RescueAltI',                 min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 44,   name: 'RescueAltD',                 min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 45,   name: 'AngleLevelGain',             min: 0,     max: 200,    ticks: 10,   pips: [ 0, 50, 100, 150, 200 ] },
        { id: 46,   name: 'HorizonLevelGain',           min: 0,     max: 200,    ticks: 10,   pips: [ 0, 50, 100, 150, 200 ] },
        { id: 47,   name: 'AcroTrainerGain',            min: 25,    max: 255,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 48,   name: 'GovernorGain',               min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 49,   name: 'GovernorP',                  min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 50,   name: 'GovernorI',                  min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 51,   name: 'GovernorD',                  min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 52,   name: 'GovernorF',                  min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 53,   name: 'GovernorTTA',                min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 54,   name: 'GovernorCyclicFF',           min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 55,   name: 'GovernorCollectiveFF',       min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 56,   name: 'PitchB',                     min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 57,   name: 'RollB',                      min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 58,   name: 'YawB',                       min: 0,     max: 1000,   ticks: 50,   pips: [ 0, 200, 400, 600, 800, 1000 ] },
        { id: 59,   name: 'PitchO',                     min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 60,   name: 'RollO',                      min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 61,   name: 'CrossCouplingGain',          min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 62,   name: 'CrossCouplingRatio',         min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 63,   name: 'CrossCouplingCutoff',        min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 64,   name: 'AccTrimPitch',               min: -300,  max: 300,    ticks: 10,   pips: [ -300, -200, -100, 0, 100, 200, 300 ] },
        { id: 65,   name: 'AccTrimRoll',                min: -300,  max: 300,    ticks: 10,   pips: [ -300, -200, -100, 0, 100, 200, 300 ] },
        { id: 66,   name: 'YawInertiaPrecompGain',      min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 67,   name: 'YawInertiaPrecompCutoff',    min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 68,   name: 'PitchSetpointBoostGain',     min: 0,     max: 255,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 69,   name: 'RollSetpointBoostGain',      min: 0,     max: 255,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 70,   name: 'YawSetpointBoostGain',       min: 0,     max: 255,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 71,   name: 'CollectiveSetpointBoostGain',min: 0,     max: 255,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 72,   name: 'YawDynCeilingGain',          min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 73,   name: 'YawDynDeadbandGain',         min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 74,   name: 'YawDynDeadbandFilter',       min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 75,   name: 'YawPrecompCutoff',           min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 76,   name: 'GovIdleThrottle',            min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 77,   name: 'GovAutoThrottle',            min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 78,   name: 'GovMaxThrottle',             min: 0,     max: 100,    ticks: 5,    pips: [ 0, 20, 40, 60, 80, 100 ], hide: true },
        { id: 79,   name: 'GovMinThrottle',             min: 0,     max: 100,    ticks: 5,    pips: [ 0, 20, 40, 60, 80, 100 ], hide: true },
        { id: 80,   name: 'GovHeadspeed',               min: 0,     max: 10000,  ticks: 200,   pips: [ 0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000 ], hide: true },
        { id: 81,   name: 'GovYawFF',                   min: 0,     max: 250,    ticks: 10,   pips: [ 0, 50, 100, 150, 200, 250 ], hide: true },
        { id: 82,   name: 'BatteryProfile',             min: 1,     max: 6,      ticks: 0.25, pips: [ 1, 2, 3, 4, 5, 6 ] },
        { id: 83,   name: 'Reserved',                   min: 0,     max: 100,    ticks: 10,   pips: [ 0, 20, 40, 60, 80, 100 ], hide: true },
        { id: 84,   name: 'MasterGainPitch',            min: 25,    max: 1000,   ticks: 50,   pips: [ 25, 200, 400, 600, 800, 1000 ] },
        { id: 85,   name: 'MasterGainRoll',             min: 25,    max: 1000,   ticks: 50,   pips: [ 25, 200, 400, 600, 800, 1000 ] },
        { id: 86,   name: 'MasterGainYaw',              min: 25,    max: 1000,   ticks: 50,   pips: [ 25, 200, 400, 600, 800, 1000 ] },
        { id: 87,   name: 'AutoHoverGain',              min: 0,     max: 250,    ticks: 25,   pips: [ 0, 50, 100, 150, 200, 250 ] },
        { id: 88,   name: 'AttHoldGain',                min: 0,     max: 250,    ticks: 25,   pips: [ 0, 50, 100, 150, 200, 250 ] },
    ];
}

// Curates how the "Function" dropdown presents the FUNCTIONS entries: grouped
// by what they tune, rather than flat firmware-enum order. This is purely a
// display concern - `ids` reference FUNCTIONS[id] and each id's <option
// value> stays equal to that id, so FUNCTIONS itself is never reordered.
// Order within a group is curated by hand (not alphabetized) so related
// terms - e.g. all P-gains, then all I-gains - stay together.
//
// A group is only rendered if at least one of its ids has `hide` falsy
// (see AdjustmentRow.svelte). Cross Coupling/Rescue/Governor/Yaw Precomp are
// heli-only concepts (see the FUNCTIONS comment above) whose every id is
// permanently hidden, so they disappear entirely rather than showing an
// empty heading.
export const FUNCTION_GROUPS = [
    { label: 'adjustmentsGroupProfiles', ids: [82, 3, 4, 2, 1] },
    { label: 'adjustmentsGroupRates', ids: [5, 6, 7] },
    { label: 'adjustmentsGroupRcRates', ids: [8, 9, 10] },
    { label: 'adjustmentsGroupRcExpo', ids: [11, 12, 13] },
    { label: 'adjustmentsGroupPidGains', ids: [14, 18, 22, 15, 19, 23, 16, 20, 24, 17, 21, 25, 56, 57, 58, 59, 60] },
    { label: 'adjustmentsGroupFilters', ids: [33, 34, 35, 36, 37, 38] },
    { label: 'adjustmentsGroupYawDynamics', ids: [72, 74, 73] },
    { label: 'adjustmentsGroupStability', ids: [47, 45, 46, 87, 88] },
    { label: 'adjustmentsGroupMasterGains', ids: [84, 85, 86] },
    { label: 'adjustmentsGroupAccTrim', ids: [64, 65] },
    { label: 'adjustmentsGroupSetpointBoost', ids: [71, 68, 69, 70] },
    { label: 'adjustmentsGroupCrossCoupling', ids: [63, 61, 62] },
    { label: 'adjustmentsGroupYawPrecomp', ids: [32, 27, 26, 30, 31, 29, 28, 67, 66, 75] },
    { label: 'adjustmentsGroupRescue', ids: [44, 43, 42, 39, 41, 40] },
    { label: 'adjustmentsGroupGovernor', ids: [77, 55, 54, 51, 52, 80, 50, 76, 78, 79, 49, 48, 53, 81] },
];
