import semver from "semver";

import {
    API_VERSION_12_9,
} from "@/js/configurator.svelte.js";

const tab = {
    tabName: 'profiles',
    isDirty: false,
    isChanged: false,
    activeSubtab: null,
    savedProfile: null,
    currentProfile: null,
    isPIDDefault: false,
    tabNames: [
        'profile1',
        'profile2',
        'profile3',
        'profile4',
        'profile5',
        'profile6',
    ],
    axisNames: [
        'ROLL',
        'PITCH',
        'YAW',
    ],
    gainNames: [
        'P',
        'I',
        'D',
        'F',
        'B',
    ],
    defaultGains: [
        [ 10, 50, 0, 50, 0 ],
        [ 10, 50, 0, 50, 0 ],
        [ 50, 50, 0,  0, 0 ],
    ],
};

tab.initialize = function (callback) {
    const self = this;

    load_data(load_html);

    function load_html() {
        $('#content').load("/src/tabs/profiles.html", process_html);
    }

    function load_data(callback) {
        Promise.resolve(true)
            .then(() => MSP.promise(MSPCodes.MSP_STATUS))
            .then(() => MSP.promise(MSPCodes.MSP_FEATURE_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_PID_TUNING))
            .then(() => MSP.promise(MSPCodes.MSP_PID_PROFILE))
            .then(() => MSP.promise(MSPCodes.MSP_RESCUE_PROFILE))
            .then(() => MSP.promise(MSPCodes.MSP_GOVERNOR_PROFILE))
            .then(() => MSP.promise(MSPCodes.MSP_GOVERNOR_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_SENSOR_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_BATTERY_CONFIG))
            .then(callback);
    }

    function save_data(callback) {
        Promise.resolve(true)
            .then(() => MSP.promise(MSPCodes.MSP_SET_PID_TUNING, mspHelper.crunch(MSPCodes.MSP_SET_PID_TUNING)))
            .then(() => MSP.promise(MSPCodes.MSP_SET_PID_PROFILE, mspHelper.crunch(MSPCodes.MSP_SET_PID_PROFILE)))
            .then(() => MSP.promise(MSPCodes.MSP_SET_RESCUE_PROFILE, mspHelper.crunch(MSPCodes.MSP_SET_RESCUE_PROFILE)))
            .then(() => MSP.promise(MSPCodes.MSP_SET_GOVERNOR_PROFILE, mspHelper.crunch(MSPCodes.MSP_SET_GOVERNOR_PROFILE)))
            .then(() => MSP.promise(MSPCodes.MSP_SET_GOVERNOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_GOVERNOR_CONFIG)))
            .then(() => MSP.promise(MSPCodes.MSP_EEPROM_WRITE))
            .then(() => {
                self.savedProfile = self.currentProfile;
                GUI.log(i18n.getMessage('eepromSaved'));
                callback?.();
            });
    }

    function revert_data(callback) {
        MSP.promise(MSPCodes.MSP_SELECT_SETTING, [self.savedProfile])
            .then(() => {
                GUI.log(i18n.getMessage('profilesActivateProfile', [self.savedProfile + 1]));
                callback?.();
            });
    }

    function show_warning(name) {
        $('.tab-profiles .profilesPIDWarningText').html(i18n.getMessage(name));
        $('.tab-profiles .profilesPIDWarning').show();
    }

    function data_to_form() {

        self.currentProfile = FC.CONFIG.profile;

        if (self.savedProfile == undefined)
            self.savedProfile = self.currentProfile;

        self.activeSubtab = self.tabNames[self.currentProfile];

        $('.tab-profiles .tab-container .tab').removeClass('active');
        $('.tab-profiles .tab-container .' + self.activeSubtab).addClass('active');

        $('.tab-profiles .note').hide();

        self.isPIDDefault = true;
        self.axisNames.forEach(function(axis, indexAxis) {
            self.gainNames.forEach(function(gain, indexGain) {
                const input = $(`.tab-profiles .${axis} input[name="${gain}"]`);
                const value = FC.PIDS[indexAxis][indexGain];
                self.isPIDDefault &= (value == self.defaultGains[indexAxis][indexGain]);
                input.val(value);
            });
        });

        if (FC.PID_PROFILE.pid_mode == 0) {
            show_warning('profilesPIDModeZeroWarning');
            $('.tab-profiles .pid_config').hide();
        }
        else if (FC.PID_PROFILE.pid_mode == 1) {
            show_warning('profilesPIDModeOneWarning');
        }
        else if (FC.PID_PROFILE.pid_mode == 2) {
            show_warning('profilesPIDModeTwoWarning');
        }
        else if (FC.PID_PROFILE.pid_mode == 3) {
            //show_warning('profilesPIDModeThreeWarning');
        }
        else if (FC.PID_PROFILE.pid_mode == 4) {
            show_warning('profilesPIDModeFourWarning');
        }
        else if (FC.PID_PROFILE.pid_mode > 4) {
            show_warning('profilesPIDModeCustomWarning');
            $('.tab-profiles .pid_config').hide();
        }

        $('.tab-profiles .HSI').toggle(FC.PID_PROFILE.pid_mode >= 3);

        $('.tab-profiles input[id="gyroCutoffRoll"]').val(FC.PID_PROFILE.gyroCutoffRoll).change();
        $('.tab-profiles input[id="gyroCutoffPitch"]').val(FC.PID_PROFILE.gyroCutoffPitch).change();
        $('.tab-profiles input[id="gyroCutoffYaw"]').val(FC.PID_PROFILE.gyroCutoffYaw).change();

        $('.tab-profiles input[id="dtermCutoffRoll"]').val(FC.PID_PROFILE.dtermCutoffRoll).change();
        $('.tab-profiles input[id="dtermCutoffPitch"]').val(FC.PID_PROFILE.dtermCutoffPitch).change();
        $('.tab-profiles input[id="dtermCutoffYaw"]').val(FC.PID_PROFILE.dtermCutoffYaw).change();

        $('.tab-profiles input[id="btermCutoffRoll"]').val(FC.PID_PROFILE.btermCutoffRoll).change();
        $('.tab-profiles input[id="btermCutoffPitch"]').val(FC.PID_PROFILE.btermCutoffPitch).change();
        $('.tab-profiles input[id="btermCutoffYaw"]').val(FC.PID_PROFILE.btermCutoffYaw).change();

        // Cumulative Error limits
        $('.tab-profiles input[id="errorLimitRoll"]').val(FC.PID_PROFILE.errorLimitRoll).change();
        $('.tab-profiles input[id="errorLimitPitch"]').val(FC.PID_PROFILE.errorLimitPitch).change();
        $('.tab-profiles input[id="errorLimitYaw"]').val(FC.PID_PROFILE.errorLimitYaw).change();

        // Offset limits
        $('.tab-profiles input[id="offsetLimitRoll"]').val(FC.PID_PROFILE.offsetLimitRoll).change();
        $('.tab-profiles input[id="offsetLimitPitch"]').val(FC.PID_PROFILE.offsetLimitPitch).change();

        // Offset gains
        $('.tab-profiles input[id="offsetGainRoll"]').val(FC.PIDS[0][5]).change();
        $('.tab-profiles input[id="offsetGainPitch"]').val(FC.PIDS[1][5]).change();

        // Error rotation
        $('.tab-profiles input[id="errorRotation"]')
            .prop('checked', FC.PID_PROFILE.error_rotation !== 0)
            .closest('tr')
            .toggle(semver.lt(FC.CONFIG.apiVersion, API_VERSION_12_9));

        // Error decays
        $('.tab-profiles input[id="errorDecayTimeGround"]').val(FC.PID_PROFILE.error_decay_time_ground / 10);
        $('.tab-profiles input[id="errorDecayTimeCyclic"]').val(FC.PID_PROFILE.error_decay_time_cyclic / 10);
        $('.tab-profiles input[id="errorDecayLimitCyclic"]').val(FC.PID_PROFILE.error_decay_limit_cyclic);
        //$('.tab-profiles input[id="errorDecayTimeYaw"]').val(FC.PID_PROFILE.error_decay_time_yaw / 10);
        //$('.tab-profiles input[id="errorDecayLimitYaw"]').val(FC.PID_PROFILE.error_decay_limit_yaw);

        const errorDecayCheck = $('.tab-profiles input[id="errorDecayGround"]');
        errorDecayCheck.change(function() {
            const checked = $(this).is(':checked');
            $('.tab-profiles .errorDecayGround .suboption').toggle(checked);
        });
        errorDecayCheck.prop('checked', FC.PID_PROFILE.error_decay_time_ground > 0).change();

        // I-term relax
        $('.tab-profiles input[id="itermRelaxCutoffRoll"]').val(FC.PID_PROFILE.itermRelaxCutoffRoll);
        $('.tab-profiles input[id="itermRelaxCutoffPitch"]').val(FC.PID_PROFILE.itermRelaxCutoffPitch);
        $('.tab-profiles input[id="itermRelaxCutoffYaw"]').val(FC.PID_PROFILE.itermRelaxCutoffYaw);

        const itermRelaxCheck = $('.tab-profiles input[id="itermRelax"]');
        const itermRelaxType = $('.tab-profiles select[id="itermRelaxType"]');

        itermRelaxCheck.change(function() {
            const checked = itermRelaxCheck.is(':checked');
            $('.tab-profiles .itermRelax .suboption').toggle(checked);
            $('.tab-profiles .itermRelax .subhelp').toggle(checked);
            itermRelaxType.change();
        });
        itermRelaxCheck.prop('checked', FC.PID_PROFILE.itermRelaxType > 0).change();

        itermRelaxType.change(function() {
            const checked = itermRelaxCheck.is(':checked');
            const value = (checked) ? itermRelaxType.val() : 0;
            $('.tab-profiles .itermRelaxYawOption').toggle(value > 1);
        });
        itermRelaxType.val(FC.PID_PROFILE.itermRelaxType < 2 ? 1 : 2).change();

        // Acro Trainer
        $('.tab-profiles input[id="acroTrainerGain"]').val(FC.PID_PROFILE.acroTrainerGain).trigger('input');
        $('.tab-profiles input[id="acroTrainerLimit"]').val(FC.PID_PROFILE.acroTrainerLimit).trigger('input');

        // Angle mode
        $('.tab-profiles input[id="angleModeGain"]').val(FC.PID_PROFILE.levelAngleStrength);
        $('.tab-profiles input[id="angleModeLimit"]').val(FC.PID_PROFILE.levelAngleLimit);

        // Horizon mode
        $('.tab-profiles input[id="horizonModeGain"]').val(FC.PID_PROFILE.horizonLevelStrength);

        // Governor settings are not used on this platform
        $('.tab-profiles #svelte-gov-settings').hide();
    }

    function form_to_data() {

        self.axisNames.forEach(function(axis, indexAxis) {
            self.gainNames.forEach(function(gain, indexGain) {
                const input = $(`.tab-profiles .${axis} input[name="${gain}"]`);
                const value = parseInt(input.val());
                FC.PIDS[indexAxis][indexGain] = value;
            });
        });

        FC.PID_PROFILE.gyroCutoffRoll = $('.tab-profiles input[id="gyroCutoffRoll"]').val();
        FC.PID_PROFILE.gyroCutoffPitch = $('.tab-profiles input[id="gyroCutoffPitch"]').val();
        FC.PID_PROFILE.gyroCutoffYaw = $('.tab-profiles input[id="gyroCutoffYaw"]').val();

        FC.PID_PROFILE.dtermCutoffRoll = $('.tab-profiles input[id="dtermCutoffRoll"]').val();
        FC.PID_PROFILE.dtermCutoffPitch = $('.tab-profiles input[id="dtermCutoffPitch"]').val();
        FC.PID_PROFILE.dtermCutoffYaw = $('.tab-profiles input[id="dtermCutoffYaw"]').val();

        FC.PID_PROFILE.btermCutoffRoll = $('.tab-profiles input[id="btermCutoffRoll"]').val();
        FC.PID_PROFILE.btermCutoffPitch = $('.tab-profiles input[id="btermCutoffPitch"]').val();
        FC.PID_PROFILE.btermCutoffYaw = $('.tab-profiles input[id="btermCutoffYaw"]').val();

        FC.PID_PROFILE.errorLimitRoll = $('.tab-profiles input[id="errorLimitRoll"]').val();
        FC.PID_PROFILE.errorLimitPitch = $('.tab-profiles input[id="errorLimitPitch"]').val();
        FC.PID_PROFILE.errorLimitYaw = $('.tab-profiles input[id="errorLimitYaw"]').val();

        FC.PID_PROFILE.offsetLimitRoll = $('.tab-profiles input[id="offsetLimitRoll"]').val();
        FC.PID_PROFILE.offsetLimitPitch = $('.tab-profiles input[id="offsetLimitPitch"]').val();

        FC.PIDS[0][5] = $('.tab-profiles input[id="offsetGainRoll"]').val();
        FC.PIDS[1][5] = $('.tab-profiles input[id="offsetGainPitch"]').val();

        FC.PID_PROFILE.error_decay_time_ground = $('.tab-profiles input[id="errorDecayGround"]').is(':checked') ?
            $('.tab-profiles input[id="errorDecayTimeGround"]').val() * 10 : 0;

        FC.PID_PROFILE.error_decay_time_cyclic = $('.tab-profiles input[id="errorDecayTimeCyclic"]').val() * 10;
        FC.PID_PROFILE.error_decay_limit_cyclic = $('.tab-profiles input[id="errorDecayLimitCyclic"]').val();

        //FC.PID_PROFILE.error_decay_time_yaw = $('.tab-profiles input[id="errorDecayTimeYaw"]').val() * 10;
        //FC.PID_PROFILE.error_decay_limit_yaw = $('.tab-profiles input[id="errorDecayLimitYaw"]').val();

        FC.PID_PROFILE.error_rotation = $('.tab-profiles input[id="errorRotation"]').is(':checked') ? 1 : 0;
        FC.PID_PROFILE.itermRelaxType = $('.tab-profiles input[id="itermRelax"]').is(':checked') ?
            $('.tab-profiles select[id="itermRelaxType"]').val() : 0;
        FC.PID_PROFILE.itermRelaxCutoffRoll = parseInt($('.tab-profiles input[id="itermRelaxCutoffRoll"]').val());
        FC.PID_PROFILE.itermRelaxCutoffPitch = parseInt($('.tab-profiles input[id="itermRelaxCutoffPitch"]').val());
        FC.PID_PROFILE.itermRelaxCutoffYaw = parseInt($('.tab-profiles input[id="itermRelaxCutoffYaw"]').val());

        // Swashplate cyclic/collective coupling and tail-rotor torque-reaction
        // compensation are not used on this platform; keep them neutralized.
        FC.PID_PROFILE.yawStopGainCW = 100;
        FC.PID_PROFILE.yawStopGainCCW = 100;
        FC.PID_PROFILE.yawFFCyclicGain = 0;
        FC.PID_PROFILE.yawFFCollectiveGain = 0;
        FC.PID_PROFILE.yaw_inertia_precomp_gain = 0;
        FC.PID_PROFILE.pitchFFCollectiveGain = 0;
        FC.PID_PROFILE.cyclicCrossCouplingGain = 0;

        // Leveling modes
        FC.PID_PROFILE.acroTrainerGain = parseInt($('.tab-profiles input[id="acroTrainerGain"]').val());
        FC.PID_PROFILE.acroTrainerLimit = parseInt($('.tab-profiles input[id="acroTrainerLimit"]').val());
        FC.PID_PROFILE.levelAngleStrength = parseInt($('.tab-profiles input[id="angleModeGain"]').val());
        FC.PID_PROFILE.levelAngleLimit = parseInt($('.tab-profiles input[id="angleModeLimit"]').val());
        FC.PID_PROFILE.horizonLevelStrength = parseInt($('.tab-profiles input[id="horizonModeGain"]').val());
    }

    function process_html() {
        // translate to user-selected language
        i18n.localizePage();

        // UI Hooks
        data_to_form();

        // Hide the buttons toolbar
        $('.tab-profiles').addClass('toolbar_hidden');

        self.isDirty = false;
        self.isChanged = false;

        function setChanged() {
            if (!self.isChanged) {
                self.isDirty = true;
                self.isChanged = true;
                $('.tab-profiles').removeClass('toolbar_hidden');
                $('#copyProfile').addClass('disabled');
            }
        }

        function setDirty() {
            if (!self.isDirty) {
                self.isDirty = true;
                $('.tab-profiles').removeClass('toolbar_hidden');
            }
        }

        function activateProfile(profile) {
            FC.CONFIG.profile = profile;
            MSP.promise(MSPCodes.MSP_SELECT_SETTING, [profile])
                .then(function () {
                    GUI.log(i18n.getMessage('profilesActivateProfile', [profile + 1]));
                    GUI.tab_switch_reload(() => setDirty());
                });
        }

        self.tabNames.forEach(function(element, index) {
            $('.tab-profiles .tab-container .' + element).on('click', function () {
                if (index != self.currentProfile) {
                    self.isDirty = self.isChanged;
                    GUI.tab_switch_allowed(() => activateProfile(index));
                }
            });
            $('.tab-profiles .tab-container .' + element).toggle(index < FC.CONFIG.numProfiles);
        });

        const dialogResetProfile = $('.dialogResetProfile')[0];

        $('#resetProfile').click(function() {
            dialogResetProfile.showModal();
        });

        $('.dialogResetProfile-cancelbtn').click(function() {
            dialogResetProfile.close();
        });

        $('.dialogResetProfile-confirmbtn').click(function() {
            MSP.send_message(MSPCodes.MSP_SET_RESET_CURR_PID, false, false, function () {
                GUI.log(i18n.getMessage('profilesResetProfile'));
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function () {
                    GUI.log(i18n.getMessage('eepromSaved'));
                    dialogResetProfile.close();
                    GUI.tab_switch_reload();
                });
            });
        });

        const dialogCopyProfile = $('.dialogCopyProfile')[0];
        const selectProfile = $('.selectProfile');

        $.each(self.tabNames, function(key) {
            if (key != FC.CONFIG.profile) {
                const tabIndex = key + 1;
                selectProfile.append(new Option(i18n.getMessage(`profilesSubTab${tabIndex}`), key));
            }
        });

        $('#copyProfile').click(function() {
            if (!self.isChanged) {
                dialogCopyProfile.showModal();
            }
        });

        $('.dialogCopyProfile-cancelbtn').click(function() {
            dialogCopyProfile.close();
        });

        $('.dialogCopyProfile-confirmbtn').click(function() {
            FC.COPY_PROFILE.type = 0;
            FC.COPY_PROFILE.dstProfile = parseInt(selectProfile.val());
            FC.COPY_PROFILE.srcProfile = FC.CONFIG.profile;

            MSP.send_message(MSPCodes.MSP_COPY_PROFILE, mspHelper.crunch(MSPCodes.MSP_COPY_PROFILE), false, function () {
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function () {
                    GUI.log(i18n.getMessage('eepromSaved'));
                    dialogCopyProfile.close();
                });
            });
        });

        const dialogProfileChange = $('.dialogProfileChange')[0];

        $('.dialogProfileChangeConfirmBtn').click(function() {
            dialogProfileChange.close();
            GUI.tab_switch_reload();
            GUI.log(i18n.getMessage('profilesActivateProfile', [FC.CONFIG.profile + 1]));
        });

        self.save = function (callback) {
            form_to_data();
            save_data(callback);
        };

        self.revert = function (callback) {
            if (self.currentProfile != self.savedProfile)
                revert_data(callback);
            else
                callback?.();
        };

        $('a.save').click(function () {
            self.save(() => GUI.tab_switch_reload());
        });

        $('a.revert').click(function () {
            self.revert(() => GUI.tab_switch_reload());
        });

        $('.tab-area').change(function () {
            setChanged();
        });

        function get_status() {
            MSP.send_message(MSPCodes.MSP_STATUS, false, false, function() {
                if (self.currentProfile != FC.CONFIG.profile && !dialogProfileChange.hasAttribute('open')) {
                    if (self.isChanged) {
                        dialogProfileChange.showModal();
                    } else {
                        GUI.tab_switch_reload();
                        GUI.log(i18n.getMessage('profilesActivateProfile', [FC.CONFIG.profile + 1]));
                    }
                }
            });
        }

        GUI.interval_add('status_pull', get_status, 250, true);

        GUI.content_ready(callback);
    }
};


tab.cleanup = function (callback) {
    this.isDirty = false;

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
