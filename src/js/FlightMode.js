import { i18n } from '@/js/localization.js';

// Shared between the Modes (auxiliary) and Conditions (logic) tabs so both
// list the same set of flight modes, hidden the same way, and labeled the
// same way.

// These boxes are either heli-specific (collective/governor recovery), not
// used on this platform, or intentionally hidden from users. GPS Rescue
// (RTH) is unrelated and stays.
export const UNUSED_MODES = ['RESCUE', 'GOVERNOR SUSPEND', 'GOVERNOR FALLBACK', 'GOVERNOR BYPASS', 'OSD DISABLE', 'PARALYZE'];

export function getModeDisplayName(modeName) {
    return i18n.existsMessage('mode ' + modeName) ?
        i18n.getMessage('mode ' + modeName) : modeName;
}
