
// Base URL for the published WingFlight docs site (built from the
// wingflight-docs repo via MkDocs) -- directory-style URLs, no .md/.html
// extension, trailing slash (e.g. https://doc.wingflight.org/flight-modes/auto-trim/).
const docsBaseURL = 'https://doc.wingflight.org';

// default URL - used when a tab has no specific docs page mapped below
const defaultHelpURL = `${docsBaseURL}/`;

// tab specific URLs - keys match the i18n tab-title key for each tab (see
// TABS registration / each Svelte tab's `tabXxx` title), not the tab's
// internal id, so this stays correct even if a tab is renamed internally.
const tabHelpURLs = {

    tabStatus:          `${docsBaseURL}/configurator/tabs/status/`,
    tabSetup:           `${docsBaseURL}/configurator/tabs/setup/`,
    tabConfiguration:   `${docsBaseURL}/configurator/tabs/configuration/`,
    tabPower:           `${docsBaseURL}/configurator/tabs/power/`,
    tabReceiver:        `${docsBaseURL}/configurator/tabs/receiver/`,
    tabFailsafe:        `${docsBaseURL}/configurator/tabs/failsafe/`,
    tabMixer:           `${docsBaseURL}/configurator/tabs/mixer/`,
    tabServos:          `${docsBaseURL}/configurator/tabs/servos/`,
    tabMotors:          `${docsBaseURL}/configurator/tabs/motors/`,
    tabCurves:          `${docsBaseURL}/configurator/tabs/curves/`,
    tabProfiles:        `${docsBaseURL}/configurator/tabs/profiles/`,
    tabRates:           `${docsBaseURL}/configurator/tabs/rates/`,
    tabGyro:            `${docsBaseURL}/configurator/tabs/gyro/`,
    tabAuxiliary:       `${docsBaseURL}/configurator/tabs/auxiliary/`,
    tabAdjustments:     `${docsBaseURL}/configurator/tabs/adjustments/`,
    tabLogic:           `${docsBaseURL}/configurator/tabs/logic/`,
    tabGPS:             `${docsBaseURL}/configurator/tabs/gps/`,
    tabLedStrip:        `${docsBaseURL}/configurator/tabs/led-strip/`,
    tabBeepers:         `${docsBaseURL}/configurator/tabs/beepers/`,
    tabSensors:         `${docsBaseURL}/configurator/tabs/sensors/`,
    tabEscProgramming:  `${docsBaseURL}/configurator/tabs/esc-programming/`,
    tabXactServoProgramming: `${docsBaseURL}/configurator/tabs/xact-servo-programming/`,
    tabBlackbox:        `${docsBaseURL}/configurator/tabs/blackbox/`,
    tabCli:             `${docsBaseURL}/configurator/tabs/cli/`,
};

export function getTabHelpURL(tabName)
{
    if (tabName && tabHelpURLs[tabName])
        return tabHelpURLs[tabName];

    return defaultHelpURL;
}
