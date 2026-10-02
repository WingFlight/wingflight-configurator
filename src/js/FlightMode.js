import { i18n } from '@/js/localization.js';

// Shared between the Modes (auxiliary) and Conditions (logic) tabs so both
// list the same set of flight modes, hidden the same way, and labeled the
// same way.

// These boxes are either heli-specific (collective/governor recovery), not
// used on this platform, or intentionally hidden from users.
export const UNUSED_MODES = ['RESCUE', 'GOVERNOR SUSPEND', 'GOVERNOR FALLBACK', 'GOVERNOR BYPASS', 'OSD DISABLE', 'PARALYZE', 'STICK COMMANDS DISABLE'];

// Lower-level/diagnostic boxes that are only worth showing to users who've
// opted into Expert Mode - kept out of the way of a normal setup.
export const EXPERT_MODES = ['BLACKBOX', 'BLACKBOX ERASE', 'BEEPER', 'BEEPER MUTE', 'FAILSAFE', 'GPS BEEP SATELLITE COUNT', 'PREARM'];

export function getModeDisplayName(modeName) {
    return i18n.existsMessage('mode ' + modeName) ?
        i18n.getMessage('mode ' + modeName) : modeName;
}

export function getModeDescription(modeName) {
    return i18n.existsMessage('modeHelp ' + modeName) ?
        i18n.getMessage('modeHelp ' + modeName) : '';
}

// Categories for the Modes tab's "Add mode" picker, in display order. Modes
// within a group are listed in this order too; anything the FC reports that
// isn't named here falls into a trailing "other" group so it stays reachable.
export const MODE_GROUPS = [
    { key: 'Arming', modes: ['ARM', 'PREARM', 'FAILSAFE'] },
    { key: 'Flight', modes: ['ANGLE', 'ATT HOLD', 'GYRO OFF', 'MANUAL', 'TRADITIONAL', 'SETUP', 'PASSTHROUGH', 'AUTO TRIM', 'TRAINER'] },
    { key: 'ThrustVector', modes: ['THRUST VECTOR', 'THRUST VECTOR ATTITUDE HOLD'] },
    { key: 'Gps', modes: ['GPS LOITER', 'GPS RTH', 'GPS BEEP SATELLITE COUNT'] },
    { key: 'Power', modes: ['GOVERNOR'] },
    { key: 'Alerts', modes: ['BEEPER', 'BEEPER MUTE', 'LEDLOW'] },
    { key: 'Logging', modes: ['BLACKBOX', 'BLACKBOX ERASE', 'TELEMETRY'] },
    { key: 'Camera', modes: ['CAMERA CONTROL 1', 'CAMERA CONTROL 2', 'CAMERA CONTROL 3'] },
    { key: 'User', modes: ['USER1', 'USER2', 'USER3', 'USER4'] },
];

export const MODE_GROUP_OTHER = 'Other';

// Sort key placing a mode by its group, then its position within the group.
export function getModeOrder(modeName) {
    for (let g = 0; g < MODE_GROUPS.length; g++) {
        const m = MODE_GROUPS[g].modes.indexOf(modeName);
        if (m !== -1) return { group: g, index: m };
    }
    return { group: MODE_GROUPS.length, index: 0 };
}
