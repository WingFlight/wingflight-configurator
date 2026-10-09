import * as config from "@/js/config.js";
import { CONFIGURATOR } from "@/js/configurator.svelte.js";

// How much of the Configurator the pilot sees:
// - beginner: the Setup Wizard is the main tool; the nav keeps only the
//   tabs the wizard doesn't cover, and connecting opens the wizard.
// - intermediate: every tab, with the detailed settings hidden.
// - advanced: every tab and every setting (what Expert Mode used to be).
// CONFIGURATOR.expertMode stays as the "advanced" flag the tabs read.
export const USER_LEVELS = ["beginner", "intermediate", "advanced"];

const BEGINNER_TABS = ["status", "setup_wizard", "receiver", "failsafe", "blackbox", "cli"];

export function loadUserLevel() {
    let level = config.get("userLevel");
    if (!USER_LEVELS.includes(level)) {
        // Before the levels, there was only the Expert Mode switch. A pilot
        // who never set it is new, so they start on Beginner.
        const expertMode = config.get("expertMode");
        if (expertMode === undefined) {
            level = "beginner";
        } else {
            level = expertMode ? "advanced" : "intermediate";
        }
        config.set({ userLevel: level });
    }
    applyUserLevel(level);
}

export function setUserLevel(level) {
    config.set({ userLevel: level });
    applyUserLevel(level);
}

function applyUserLevel(level) {
    CONFIGURATOR.userLevel = level;
    CONFIGURATOR.expertMode = level === "advanced";
}

export function isTabInUserLevel(tabName, level = CONFIGURATOR.userLevel) {
    return level !== "beginner" || BEGINNER_TABS.includes(tabName);
}

// The tab to open on connect when nothing else asks for one.
export function homeTab() {
    return CONFIGURATOR.userLevel === "beginner" ? "setup_wizard" : "status";
}
