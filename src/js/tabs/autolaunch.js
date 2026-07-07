import { getIntegerValue } from '@/js/main.js';

const tab = {
    tabName: 'autolaunch',
    isDirty: false,
};

tab.initialize = function (callback) {
    const self = this;

    load_data(load_html);

    function load_data(callback) {
        Promise.resolve(true)
            .then(() => MSP.promise(MSPCodes.MSP2_WING_AUTOLAUNCH_CONFIG))
            .then(callback);
    }

    function load_html() {
        $('#content').load('/src/tabs/autolaunch.html', process_html);
    }

    function setDirty() {
        if (!self.isDirty) {
            self.isDirty = true;
            $('.tab-autolaunch').removeClass('toolbar_hidden');
        }
    }

    function writeFields() {
        $('#autolaunch-auto-throttle').prop('checked', !!FC.AUTOLAUNCH_CONFIG.auto_throttle);
        $('#autolaunch-throttle').val(FC.AUTOLAUNCH_CONFIG.launch_throttle);
        $('#autolaunch-climb-angle').val(FC.AUTOLAUNCH_CONFIG.climb_angle);
        $('#autolaunch-stick-threshold').val(FC.AUTOLAUNCH_CONFIG.stick_threshold);
        $('#autolaunch-accel-threshold').val(FC.AUTOLAUNCH_CONFIG.accel_threshold);
        $('#autolaunch-detect-time').val(FC.AUTOLAUNCH_CONFIG.detect_time);
        $('#autolaunch-motor-delay').val(FC.AUTOLAUNCH_CONFIG.motor_delay);
        $('#autolaunch-timeout').val(FC.AUTOLAUNCH_CONFIG.timeout);
    }

    function readFields() {
        FC.AUTOLAUNCH_CONFIG.auto_throttle = $('#autolaunch-auto-throttle').is(':checked') ? 1 : 0;
        FC.AUTOLAUNCH_CONFIG.launch_throttle = getIntegerValue('#autolaunch-throttle');
        FC.AUTOLAUNCH_CONFIG.climb_angle = getIntegerValue('#autolaunch-climb-angle');
        FC.AUTOLAUNCH_CONFIG.stick_threshold = getIntegerValue('#autolaunch-stick-threshold');
        FC.AUTOLAUNCH_CONFIG.accel_threshold = getIntegerValue('#autolaunch-accel-threshold');
        FC.AUTOLAUNCH_CONFIG.detect_time = getIntegerValue('#autolaunch-detect-time');
        FC.AUTOLAUNCH_CONFIG.motor_delay = getIntegerValue('#autolaunch-motor-delay');
        FC.AUTOLAUNCH_CONFIG.timeout = getIntegerValue('#autolaunch-timeout');
    }

    function save_data(callback) {
        readFields();
        MSP.promise(MSPCodes.MSP2_WING_SET_AUTOLAUNCH_CONFIG, mspHelper.crunch(MSPCodes.MSP2_WING_SET_AUTOLAUNCH_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_EEPROM_WRITE))
            .then(() => {
                GUI.log(i18n.getMessage('eepromSaved'));
                callback?.();
            });
    }

    function process_html() {
        $('.tab-autolaunch').addClass('toolbar_hidden');
        writeFields();

        $('.tab-autolaunch input').on('change input', setDirty);
        $('.tab-autolaunch .save').on('click', (event) => {
            event.preventDefault();
            self.save(() => GUI.tab_switch_reload());
        });
        $('.tab-autolaunch .revert').on('click', (event) => {
            event.preventDefault();
            self.revert(() => GUI.tab_switch_reload());
        });

        i18n.localizePage();
        GUI.content_ready(callback);
    }

    this.save = save_data;
    this.revert = load_data;
};

tab.cleanup = function (callback) {
    callback?.();
};

TABS[tab.tabName] = tab;

if (import.meta.hot) {
    import.meta.hot.accept((newModule) => {
        if (newModule && GUI.active_tab === tab.tabName) {
            TABS[tab.tabName].initialize();
        }
    });

    import.meta.hot.dispose(() => {
        tab.cleanup();
    });
}
