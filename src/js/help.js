
// default URL
const defaultHelpURL = 'https://www.wingflight.org/';

// tab specific URLs
const tabHelpURLs = {

    tabStatus:          'https://www.wingflight.org/docs/2.2.0/configurator/tabs/status',
    tabSetup:           'https://www.wingflight.org/docs/2.2.0/configurator/tabs/setup',
    tabConfiguration:   'https://www.wingflight.org/docs/2.2.0/configurator/tabs/configuration',
    tabPresets:         'https://www.wingflight.org/docs/2.2.0/configurator/tabs/presets',
    tabReceiver:        'https://www.wingflight.org/docs/2.2.0/configurator/tabs/receiver',
    tabFailsafe:        'https://www.wingflight.org/docs/2.2.0/configurator/tabs/failsafe',
    tabPower:           'https://www.wingflight.org/docs/2.2.0/configurator/tabs/power',
    tabMotors:          'https://www.wingflight.org/docs/2.2.0/configurator/tabs/motors',
    tabServos:          'https://www.wingflight.org/docs/2.2.0/configurator/tabs/servos',
    tabMixer:           'https://www.wingflight.org/docs/2.2.0/configurator/tabs/mixer',
    tabGyro:            'https://www.wingflight.org/docs/2.2.0/configurator/tabs/gyro',
    tabRates:           'https://www.wingflight.org/docs/2.2.0/configurator/tabs/rates',
    tabProfiles:        'https://www.wingflight.org/docs/2.2.0/configurator/tabs/profiles',
    tabAuxiliary:       'https://www.wingflight.org/docs/2.2.0/configurator/tabs/modes',
    tabAdjustments:     'https://www.wingflight.org/docs/2.2.0/configurator/tabs/adjustments',
    tabLedStrip:        'https://www.wingflight.org/docs/2.2.0/configurator/tabs/led-strip',
    tabBeepers:         'https://www.wingflight.org/docs/2.2.0/configurator/tabs/beepers',
    tabGPS:             'https://www.wingflight.org/docs/2.2.0/configurator/tabs/gps',
    tabSensors:         'https://www.wingflight.org/docs/2.2.0/configurator/tabs/sensors',
    tabBlackbox:        'https://www.wingflight.org/docs/2.2.0/configurator/tabs/blackbox',
    tabCli:             'https://www.wingflight.org/docs/2.2.0/configurator/tabs/cli',
};

export function getTabHelpURL(tabName)
{
    if (tabName && tabHelpURLs[tabName])
        return tabHelpURLs[tabName];

    return defaultHelpURL;
}
