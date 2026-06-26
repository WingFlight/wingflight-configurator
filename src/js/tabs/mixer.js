import * as noUiSlider from 'nouislider';
import semver from 'semver';
import wNumb from 'wnumb';

import { MixerCurve } from '@/js/MixerCurve.js';

const tab = {
    tabName: 'mixer',
    isDirty: false,
    needSave: false,
    needReboot: false,
    customConfig: false,

    MIXER_CONFIG_dirty: false,
    MIXER_INPUT1_dirty: false,
    MIXER_INPUT2_dirty: false,
    MIXER_INPUT3_dirty: false,
    MIXER_INPUT4_dirty: false,
    MIXER_RULES_dirty: false,

    overrideMixer: [
        { class: 'mixerMainRotor',  axis: 1,  min:-18,   max:18,   step:0.1,  fixed:1,  scale:0.012,  sliderstep: 1,  pipstep: 1,  pipfix: 0,  pipval: [ -18, -15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15, 18, ], },
        { class: 'mixerMainRotor',  axis: 2,  min:-18,   max:18,   step:0.1,  fixed:1,  scale:0.012,  sliderstep: 1,  pipstep: 1,  pipfix: 0,  pipval: [ -18, -15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15, 18, ], },
        { class: 'mixerMainRotor',  axis: 4,  min:-18,   max:18,   step:0.1,  fixed:1,  scale:0.012,  sliderstep: 1,  pipstep: 1,  pipfix: 0,  pipval: [ -18, -15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15, 18, ], },
        { class: 'mixerTailRotor',  axis: 3,  min:-60,   max:60,   step:1,    fixed:0,  scale:0.024,  sliderstep: 1,  pipstep: 5,  pipfix: 0,  pipval: [ -60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, ], },
        { class: 'mixerTailMotor',  axis: 3,  min:-125,  max:125,  step:1,    fixed:0,  scale:0.100,  sliderstep: 1,  pipstep: 5,  pipfix: 0,  pipval: [ -125, -100, -75, -50, -25, 0, 25, 50, 75, 100, 125, ], },
    ],
};

tab.initialize = function (callback) {
    const self = this;

    function setDirty() {
        if (!self.isDirty) {
            self.isDirty = true;
            $('.tab-mixer').removeClass('toolbar_hidden');
        }

        $('.save_btn').toggle(!self.needReboot);
        $('.reboot_btn').toggle(!!self.needReboot);
    }

    load_data(load_html);

    function load_html() {
        $('#content').load("/src/tabs/mixer.html", process_html);
    }

    function load_data(callback) {
        MSP.promise(MSPCodes.MSP_STATUS)
            .then(() => MSP.promise(MSPCodes.MSP_FEATURE_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_MIXER_CONFIG))
            .then(() => MSP.promise(MSPCodes.MSP_MIXER_INPUTS))
            .then(() => MSP.promise(MSPCodes.MSP_MIXER_RULES))
            .then(() => MSP.promise(MSPCodes.MSP_MIXER_OVERRIDE))
            .then(callback);
    }

    function save_data(callback) {
        function send_mixer_config() {
            if (self.MIXER_CONFIG_dirty)
                MSP.send_message(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG), false, send_mixer_input1);
            else
                send_mixer_input1();
        }
        function send_mixer_input1() {
            if (self.MIXER_INPUT1_dirty)
                mspHelper.sendMixerInput(1, send_mixer_input2);
            else
                send_mixer_input2();
        }
        function send_mixer_input2() {
            if (self.MIXER_INPUT2_dirty)
                mspHelper.sendMixerInput(2, send_mixer_input3);
            else
                send_mixer_input3();
        }
        function send_mixer_input3() {
            if (self.MIXER_INPUT3_dirty)
                mspHelper.sendMixerInput(3, send_mixer_input4);
            else
                send_mixer_input4();
        }
        function send_mixer_input4() {
            if (self.MIXER_INPUT4_dirty)
                mspHelper.sendMixerInput(4, send_mixer_rules);
            else
                send_mixer_rules();
        }
        function send_mixer_rules() {
            if (self.MIXER_RULES_dirty)
                mspHelper.sendMixerRules(save_eeprom);
            else
                save_eeprom();
        }
        function save_eeprom() {
            if (self.needSave)
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, eeprom_saved);
            else
                save_done();
        }
        function eeprom_saved() {
            GUI.log(i18n.getMessage('eepromSaved'));
            self.needSave = false;
            save_done();
        }
        function save_done() {
            self.MIXER_CONFIG_dirty = false;
            self.MIXER_INPUT1_dirty = false;
            self.MIXER_INPUT2_dirty = false;
            self.MIXER_INPUT3_dirty = false;
            self.MIXER_INPUT4_dirty = false;
            self.MIXER_RULES_dirty = false;

            self.isDirty = self.needReboot || self.needSave;

            if (self.needReboot) {
                MSP.send_message(MSPCodes.MSP_SET_REBOOT);
                GUI.log(i18n.getMessage('deviceRebooting'));
                reinitialiseConnection(callback);
            }
            else {
                callback?.();
            }
        }

        send_mixer_config();
    }

    function add_override(axis) {

        const mixerOverride = $('#tab-mixer-templates .mixerOverrideTemplate tr').clone();
        const mixerSlider = mixerOverride.find('.mixerOverrideSlider').get(0);
        const mixerEnable = mixerOverride.find('.mixerOverrideEnable input');
        const mixerPassthrough = mixerOverride.find('.mixerPassthroughEnable input');
        const mixerInput  = mixerOverride.find('.mixerOverrideInput input');

        const inputIndex = axis.axis;

        mixerOverride.addClass(axis.class);
        mixerOverride.addClass('mixerOverrideActive');
        mixerOverride.find('.mixerOverrideName').text(i18n.getMessage(Mixer.inputNames[inputIndex]));

        const leftLabel = i18n.getMessage('mixerOverrideSliderLeftLabel' + inputIndex);
        const rightLabel = i18n.getMessage('mixerOverrideSliderRightLabel' + inputIndex);

        mixerOverride.find('.mixerOverrideSliderLeftLabel').text(leftLabel);
        mixerOverride.find('.mixerOverrideSliderRightLabel').text(rightLabel);

        mixerInput.attr('min', axis.min);
        mixerInput.attr('max', axis.max);
        mixerInput.attr('step', axis.step);

        noUiSlider.create(mixerSlider, {
            range: {
                'min': axis.min,
                'max': axis.max,
            },
            start: 0,
            step: axis.sliderstep,
            behaviour: 'snap-drag',
            pips: {
                mode: 'values',
                values: axis.pipval,
                density: 100 / ((axis.max - axis.min) / axis.pipstep),
                stepped: true,
                format: wNumb({ decimals: axis.pipfix }),
            },
        });

        function toggleMixerSlider(enable) {
            if (enable) mixerSlider.noUiSlider.enable();
            else mixerSlider.noUiSlider.disable();
        }

        mixerSlider.noUiSlider.on('slide', function (values) {
            mixerInput.val(parseFloat(values[0]).toFixed(axis.fixed));
        });

        mixerSlider.noUiSlider.on('change', function () {
            mixerInput.trigger('change');
        });

        function updateMixerOverride() {
            const override = mixerEnable.prop('checked');
            const passthrough = mixerPassthrough.prop('checked');
            let value = Mixer.OVERRIDE_OFF;

            if (override) {
                if (passthrough) {
                    value = Mixer.OVERRIDE_PASSTHROUGH;
                } else {
                    value = Math.round(parseFloat(getNumberInput(mixerInput)) / axis.scale);
                }
            }

            console.log("mixerOverride axis " + inputIndex + " value " + value);

            FC.MIXER_OVERRIDE[inputIndex] = value;
            mspHelper.sendMixerOverride(inputIndex);
        }

        mixerInput.on('change', function () {
            const value = parseFloat(getNumberInput($(this)));
            mixerSlider.noUiSlider.set(value, true, true);
            updateMixerOverride();
        });

        mixerEnable.on('change', function () {
            const override = $(this).prop('checked');
            const passthrough = mixerPassthrough.prop('checked');
            const mutable = override && !passthrough;

            mixerInput.val(0);
            mixerSlider.noUiSlider.set(0);

            mixerInput.prop('disabled', !mutable);
            toggleMixerSlider(mutable);

            if (!override && mixerPassthrough.prop('checked')) {
                mixerPassthrough.prop('checked', false).change();
            }

            updateMixerOverride();
        });

        mixerPassthrough.on('change', function () {
            const override = mixerEnable.prop('checked');
            const passthrough = $(this).prop('checked');
            const mutable = override && !passthrough;

            if (passthrough && !mixerEnable.prop('checked')) {
                mixerEnable.prop('checked', true).change();
            }

            mixerInput.prop('disabled', !mutable);
            toggleMixerSlider(mutable);

            updateMixerOverride();
        });

        let value = FC.MIXER_OVERRIDE[inputIndex];
        const override = Mixer.overrideEnabled(value);
        FC.CONFIG.mixerOverrideEnabled |= override;

        const passthrough = Mixer.passthroughEnabled(value);
        FC.CONFIG.mixerPassthroughEnabled |= passthrough;

        const mutable = override && !passthrough;

        value *= axis.scale;
        value = (mutable ? value : 0).toFixed(axis.fixed);

        mixerInput.val(value);
        mixerSlider.noUiSlider.set(value);

        mixerInput.prop('disabled', !mutable);
        mixerEnable.prop('checked', override);
        mixerPassthrough.prop('checked', passthrough);
        toggleMixerSlider(mutable);

        $('.mixerOverrideTable tbody').append(mixerOverride);
    }

    function data_to_form() {

        $('.tab-mixer .note').hide();
        $('.tab-mixer .mixerMotorisedTailCalibrationNote .note').show();
        $('.tab-mixer .mixerMotorisedTailCalibrationNote').hide();

        // Real hardware always reports MIXER_RULE_COUNT (32) rules; pad out the
        // simulator's empty default so the rule editor has slots to add into.
        while (FC.MIXER_RULES.length < Mixer.RULE_COUNT) {
            FC.MIXER_RULES.push(Mixer.nullRule());
        }

        self.origMixerConfig = Mixer.cloneConfig(FC.MIXER_CONFIG);
        self.origMixerInputs = Mixer.cloneInputs(FC.MIXER_INPUTS);
        self.origMixerRules  = Mixer.cloneRules(FC.MIXER_RULES);

        self.isDirty = false;
        self.needSave = false;
        self.needReboot = false;

        self.MIXER_CONFIG_dirty = false;
        self.MIXER_INPUT1_dirty = false;
        self.MIXER_INPUT2_dirty = false;
        self.MIXER_INPUT3_dirty = false;
        self.MIXER_INPUT4_dirty = false;
        self.MIXER_RULES_dirty = false;

        self.overrideMixer.forEach(function(axis) {
            add_override(axis);
        });

        const enableOverrideSwitch = $('#mixerOverrideEnableSwitch');
        enableOverrideSwitch.prop('checked', FC.CONFIG.mixerOverrideEnabled);

        const enablePassthroughSwitch = $('#mixerPassthroughEnableSwitch');
        enablePassthroughSwitch.prop('checked', FC.CONFIG.mixerPassthroughEnabled);

        // disable mixer passthrough option
        if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_12_8)) {
            $('.mixerPassthroughVisible').hide();
        }

        enableOverrideSwitch.change(function () {
            const checked = enableOverrideSwitch.prop('checked');
            FC.CONFIG.mixerOverrideEnabled = checked;

            if (!checked) {
                enablePassthroughSwitch.prop('checked', false).change();
            }

            $('.mixerOverrideAxis').toggle(!!checked);
            $('.mixerOverrideActive .mixerOverrideEnable input').prop('checked', checked).change();
        });

        $('.mixerOverrideAxis').toggle(!!FC.CONFIG.mixerOverrideEnabled);

        enablePassthroughSwitch.change(function () {
            const checked = enablePassthroughSwitch.prop('checked');
            FC.CONFIG.mixerPassthroughEnabled = checked;

            if (checked) {
                enableOverrideSwitch.prop('checked', true).change();
            }

            $('.mixerOverrideActive .mixerPassthroughEnable input').prop('checked', checked).change();
        });

        self.customConfig = false;

        self.customConfig |= (FC.MIXER_INPUTS[1].rate !=  FC.MIXER_INPUTS[2].rate &&
                              FC.MIXER_INPUTS[1].rate != -FC.MIXER_INPUTS[2].rate);

        self.customConfig |= (FC.MIXER_INPUTS[1].max !=  FC.MIXER_INPUTS[2].max);
        self.customConfig |= (FC.MIXER_INPUTS[1].min !=  FC.MIXER_INPUTS[2].min);

        self.customConfig |= (FC.MIXER_INPUTS[1].max != -FC.MIXER_INPUTS[1].min);
        self.customConfig |= (FC.MIXER_INPUTS[2].max != -FC.MIXER_INPUTS[2].min);
        self.customConfig |= (FC.MIXER_INPUTS[4].max != -FC.MIXER_INPUTS[4].min);

        if (self.customConfig) {
            $('.mixerCustomNote').show();
            $('.tab-mixer .configuration input,select').prop('disabled', true);
        }

        const ailDir = (FC.MIXER_INPUTS[1].rate < 0) ? -1 : 1;
        const elevDir = (FC.MIXER_INPUTS[2].rate < 0) ? -1 : 1;
        const collDir = (FC.MIXER_INPUTS[4].rate < 0) ? -1 : 1;

        const collectiveRate = Math.abs(FC.MIXER_INPUTS[4].rate) * 0.1;
        const cyclicRate = Math.abs(FC.MIXER_INPUTS[1].rate) * 0.1;

        const collectiveMax = FC.MIXER_INPUTS[4].max * 12/1000;
        const cyclicMax = FC.MIXER_INPUTS[2].max * 12/1000;
        const totalMax = FC.MIXER_CONFIG.blade_pitch_limit * 12/1000;

        const yawDir = (FC.MIXER_INPUTS[3].rate < 0) ? -1 : 1;
        const yawRate = Math.abs(FC.MIXER_INPUTS[3].rate) * 0.1;

        const mixerSwashType = $('#mixerSwashType');

        Mixer.swashTypes.forEach(function(name,index) {
            mixerSwashType.append($(`<option value="${index}">` + i18n.getMessage(name) + '</option>'));
        });

        mixerSwashType.val(FC.MIXER_CONFIG.swash_type);

        //$('#mixerSwashRing').val(FC.MIXER_CONFIG.swash_ring).change();
        $('#mixerAileronDirection').val(ailDir).change();
        $('#mixerElevatorDirection').val(elevDir).change();
        $('#mixerCollectiveDirection').val(collDir).change();
        $('#mixerMainRotorDirection').val(FC.MIXER_CONFIG.main_rotor_dir);

        $('#mixerSwashPhase').val(FC.MIXER_CONFIG.swash_phase * 0.1).change();

        $('#mixerSwashRollTrim').val(FC.MIXER_CONFIG.swash_trim[0] * 0.1).change();
        $('#mixerSwashPitchTrim').val(FC.MIXER_CONFIG.swash_trim[1] * 0.1).change();
        $('#mixerSwashCollectiveTrim').val(FC.MIXER_CONFIG.swash_trim[2] * 0.1).change();

        $('#mixerCyclicCalibration').val(cyclicRate).change();
        $('#mixerCollectiveCalibration').val(collectiveRate).change();
        $('#mixerCollectiveGeoCorrection').val(FC.MIXER_CONFIG.coll_geo_correction / 5).change();
        $('#mixerCollectiveLimit').val(collectiveMax).change();
        $('#mixerCyclicLimit').val(cyclicMax).change();
        $('#mixerTotalPitchLimit').val(totalMax).change();

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_12_8)) {
            $('#mixerCollectiveTiltCorrectionPos').val(FC.MIXER_CONFIG.coll_tilt_correction_pos).change();
            $('#mixerCollectiveTiltCorrectionNeg').val(FC.MIXER_CONFIG.coll_tilt_correction_neg).change();
        } else {
            $('.mixerCollectiveTiltCorrection').hide();
        }

        function setTailRotorMode(mode, change) {

            FC.MIXER_CONFIG.tail_rotor_mode = mode;

            $('#mixerTailRotorMode').val(mode);

            const motorised = (mode > 0);
            const enabled = Mixer.overrideEnabled(FC.MIXER_OVERRIDE[3]);

            $('.mixerTailMotor').toggle(motorised);
            $('.mixerTailRotor').toggle(!motorised);

            $('.mixerTailRotor .mixerOverrideEnable input').prop('checked', enabled && !motorised);
            $('.mixerTailMotor .mixerOverrideEnable input').prop('checked', enabled && motorised);

            if (motorised) {
                const yawMin = FC.MIXER_INPUTS[3].min * -0.1;
                const yawMax = FC.MIXER_INPUTS[3].max *  0.1;
                $('#mixerTailMotorMinYaw').val(yawMin.toFixed(1));
                $('#mixerTailMotorMaxYaw').val(yawMax.toFixed(1));
                $('#mixerTailMotorCenterTrim').val((FC.MIXER_CONFIG.tail_center_trim * 0.1).toFixed(1));
                $('.mixerOverrideAxis .mixerTailMotor').addClass('mixerOverrideActive');
                $('.mixerOverrideAxis .mixerTailRotor').removeClass('mixerOverrideActive');
                if (change) {
                    $('.mixerTailMotor .mixerOverrideEnable input').change();
                    $('#mixerTailRotorCalibration').val(100).change();
                }
            }
            else {
                const yawMin = FC.MIXER_INPUTS[3].min * -24/1000;
                const yawMax = FC.MIXER_INPUTS[3].max *  24/1000;
                $('#mixerTailRotorMinYaw').val(yawMin.toFixed(1));
                $('#mixerTailRotorMaxYaw').val(yawMax.toFixed(1));
                $('#mixerTailRotorCenterTrim').val((FC.MIXER_CONFIG.tail_center_trim * 24/1000).toFixed(1));
                $('.mixerOverrideAxis .mixerTailRotor').addClass('mixerOverrideActive');
                $('.mixerOverrideAxis .mixerTailMotor').removeClass('mixerOverrideActive');
                if (change) {
                    $('.mixerTailRotor .mixerOverrideEnable input').change();
                    $('#mixerTailRotorCalibration').val(25).change();
                }
            }

            $('.mixerBidirNote').toggle(mode == 2);
            updateYawCalibrationNote();
        }

        function updateYawCalibrationNote() {
            const motorised = FC.MIXER_CONFIG.tail_rotor_mode > 0;
            const showNote = motorised && getFloatValue('#mixerTailRotorCalibration') !== 100;
            $('.tab-mixer .mixerMotorisedTailCalibrationNote').toggle(showNote);
        }

        $('#mixerTailRotorMode').change(function () {
            const val = parseInt($(this).val());
            setTailRotorMode(val, true);
        });

        setTailRotorMode(FC.MIXER_CONFIG.tail_rotor_mode, false);

        $('#mixerTailRotorDirection').val(yawDir).change();
        $('#mixerTailRotorCalibration')
            .on('change', updateYawCalibrationNote)
            .val(yawRate)
            .change();
        $('#mixerTailMotorIdle').val(FC.MIXER_CONFIG.tail_motor_idle / 10).change();

        $('.tab-mixer .mixerReboot').change(function() {
            $('.tab-mixer .mixerRebootNote').show();
            $('select', this).addClass('attention');
            self.needReboot = true;
        });

        $('.tab-mixer .mixerConfig').change(function() {
            FC.MIXER_CONFIG.swash_type = getIntegerValue('#mixerSwashType');
            FC.MIXER_CONFIG.swash_phase = getIntegerValue('#mixerSwashPhase', 10);
            FC.MIXER_CONFIG.main_rotor_dir = parseInt($('#mixerMainRotorDirection').val());
            FC.MIXER_CONFIG.blade_pitch_limit = getIntegerValue('#mixerTotalPitchLimit', 1000/12);
            FC.MIXER_CONFIG.swash_trim[0] = getIntegerValue('#mixerSwashRollTrim', 10);
            FC.MIXER_CONFIG.swash_trim[1] = getIntegerValue('#mixerSwashPitchTrim', 10);
            FC.MIXER_CONFIG.swash_trim[2] = getIntegerValue('#mixerSwashCollectiveTrim', 10);
            FC.MIXER_CONFIG.tail_rotor_mode = getIntegerValue('#mixerTailRotorMode');
            FC.MIXER_CONFIG.tail_motor_idle = getIntegerValue('#mixerTailMotorIdle', 10);
            FC.MIXER_CONFIG.coll_geo_correction = getIntegerValue('#mixerCollectiveGeoCorrection', 5);
            FC.MIXER_CONFIG.coll_tilt_correction_pos = getIntegerValue('#mixerCollectiveTiltCorrectionPos');
            FC.MIXER_CONFIG.coll_tilt_correction_neg = getIntegerValue('#mixerCollectiveTiltCorrectionNeg');

            if (FC.MIXER_CONFIG.tail_rotor_mode > 0)
                FC.MIXER_CONFIG.tail_center_trim = getIntegerValue('#mixerTailMotorCenterTrim', 10);
            else
                FC.MIXER_CONFIG.tail_center_trim = getIntegerValue('#mixerTailRotorCenterTrim', 1000/24);

            self.MIXER_CONFIG_dirty = true;
            self.needSave = true;
            setDirty();

            MSP.send_message(MSPCodes.MSP_SET_MIXER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_MIXER_CONFIG));
        });

        $('.tab-mixer .mixerInput1').change(function() {
            const aileronDir = getIntegerValue('#mixerAileronDirection');
            const cyclicRate = getIntegerValue('#mixerCyclicCalibration', 10);
            const cyclicMax = getIntegerValue('#mixerCyclicLimit', 1000/12);
            FC.MIXER_INPUTS[1].rate = cyclicRate * aileronDir;
            FC.MIXER_INPUTS[1].min = -cyclicMax;
            FC.MIXER_INPUTS[1].max =  cyclicMax;

            self.MIXER_INPUT1_dirty = true;
            self.needSave = true;
            setDirty();

            mspHelper.sendMixerInput(1);
        });

        $('.tab-mixer .mixerInput2').change(function() {
            const elevatorDir = getIntegerValue('#mixerElevatorDirection');
            const cyclicRate = getIntegerValue('#mixerCyclicCalibration', 10);
            const cyclicMax = getIntegerValue('#mixerCyclicLimit', 1000/12);
            FC.MIXER_INPUTS[2].rate = cyclicRate * elevatorDir;
            FC.MIXER_INPUTS[2].min = -cyclicMax;
            FC.MIXER_INPUTS[2].max =  cyclicMax;

            self.MIXER_INPUT2_dirty = true;
            self.needSave = true;
            setDirty();

            mspHelper.sendMixerInput(2);
        });

        $('.tab-mixer .mixerInput3').change(function() {
            const yawDir = getIntegerValue('#mixerTailRotorDirection');
            const yawRate = getIntegerValue('#mixerTailRotorCalibration', 10);

            let yawMin, yawMax;

            if (FC.MIXER_CONFIG.tail_rotor_mode > 0) {
                yawMin = getIntegerValue('#mixerTailMotorMinYaw', -10);
                yawMax = getIntegerValue('#mixerTailMotorMaxYaw',  10);
            }
            else {
                yawMin = getIntegerValue('#mixerTailRotorMinYaw', -1000/24);
                yawMax = getIntegerValue('#mixerTailRotorMaxYaw',  1000/24);
            }

            FC.MIXER_INPUTS[3].rate = yawRate * yawDir;
            FC.MIXER_INPUTS[3].min = yawMin;
            FC.MIXER_INPUTS[3].max = yawMax;

            self.MIXER_INPUT3_dirty = true;
            self.needSave = true;
            setDirty();

            mspHelper.sendMixerInput(3);
        });

        $('.tab-mixer .mixerInput4').change(function() {
            const collectiveDir = getIntegerValue('#mixerCollectiveDirection');
            const collectiveRate = getIntegerValue('#mixerCollectiveCalibration', 10);
            const collectiveMax = getIntegerValue('#mixerCollectiveLimit', 1000/12);
            FC.MIXER_INPUTS[4].rate = collectiveRate * collectiveDir;
            FC.MIXER_INPUTS[4].min = -collectiveMax;
            FC.MIXER_INPUTS[4].max =  collectiveMax;

            self.MIXER_INPUT4_dirty = true;
            self.needSave = true;
            setDirty();

            mspHelper.sendMixerInput(4);
        });
    }

    // Full mixer rule editor: every used rule plus one trailing blank slot to add a new one.
    // Rules are evaluated by the FC in array order (SET overwrites an output, ADD/MUL stack
    // onto whatever an earlier rule already wrote there), so display order must match array
    // order, and add/delete/move operate on that same order.
    function renderMixerRuleTable(highlightIndex) {
        const tbody = $('#mixerRuleTableBody');
        if (!tbody.length) return;
        tbody.empty();

        const rules = FC.MIXER_RULES;

        const visibleIndexes = [];
        rules.forEach(function (rule, index) {
            if (!Mixer.isNullRule(rule)) visibleIndexes.push(index);
        });

        const freeIndex = Mixer.firstFreeRuleIndex(rules);
        const blankIndex = visibleIndexes.length;
        if (freeIndex !== -1) visibleIndexes.push(freeIndex);

        const outputsSeen = {};

        visibleIndexes.forEach(function (index, pos) {
            const rule = rules[index];
            const isBlank = (pos === blankIndex);

            const row = $('#tab-mixer-templates .mixerRuleTemplate tr').clone();
            if (index === highlightIndex) row.addClass('mixerRuleMoved');

            const outputSelect    = row.find('.ruleOutput');
            const operSelect      = row.find('.ruleOper');
            const inputSelect     = row.find('.ruleInput');
            const curveSelect     = row.find('.ruleCurve');
            const weightInput     = row.find('.ruleWeight');
            const weightNegInput  = row.find('.ruleWeightNeg');
            const offsetInput     = row.find('.ruleOffset');
            const speedInput      = row.find('.ruleSpeed');
            const reverseInput    = row.find('.ruleReverse');

            Mixer.outputNames.forEach(function (nameKey, i) {
                outputSelect.append($('<option></option>').attr('value', i).text(i18n.getMessage(nameKey)));
            });
            Mixer.operNames.slice(1).forEach(function (nameKey, i) {
                operSelect.append($('<option></option>').attr('value', i + 1).text(i18n.getMessage(nameKey)));
            });
            Mixer.inputNames.forEach(function (nameKey, i) {
                if (Mixer.heliOnlyInputs.includes(i)) return;
                inputSelect.append($('<option></option>').attr('value', i).text(i18n.getMessage(nameKey)));
            });
            curveSelect.append($('<option></option>').attr('value', 0).text(i18n.getMessage('mixerCurveNone')));
            for (let c = 0; c < MixerCurve.CURVE_COUNT; c++) {
                curveSelect.append($('<option></option>').attr('value', c + 1).text(i18n.getMessage('mixerCurveLabel', [c + 1])));
            }

            row.find('.ruleIndex').text(isBlank ? '' : (pos + 1));
            outputSelect.val(rule.dst);
            operSelect.val(rule.oper || Mixer.OP_SET);
            inputSelect.val(rule.src);
            curveSelect.val(rule.curve);
            weightInput.val(rule.weight);
            weightNegInput.val(rule.weightNeg);
            offsetInput.val(rule.offset);
            speedInput.val(rule.speed);
            reverseInput.prop('checked', !!rule.reverse);

            if (!isBlank && rule.dst !== 0) {
                const firstForOutput = !outputsSeen[rule.dst];
                let hint = '';

                if (firstForOutput && rule.oper !== Mixer.OP_SET) {
                    hint = i18n.getMessage('mixerRuleHintFirstShouldSet');
                } else if (!firstForOutput && rule.oper === Mixer.OP_SET) {
                    hint = i18n.getMessage('mixerRuleHintOverride');
                }

                row.find('.ruleHint').text(hint).attr('title', hint);

                outputsSeen[rule.dst] = true;
            }

            function commit() {
                FC.MIXER_RULES[index] = {
                    oper:      parseInt(operSelect.val(), 10),
                    src:       parseInt(inputSelect.val(), 10),
                    dst:       parseInt(outputSelect.val(), 10),
                    curve:     parseInt(curveSelect.val(), 10) || 0,
                    weight:    parseInt(weightInput.val(), 10) || 0,
                    weightNeg: parseInt(weightNegInput.val(), 10) || 0,
                    offset:    parseInt(offsetInput.val(), 10) || 0,
                    speed:     parseInt(speedInput.val(), 10) || 0,
                    reverse:   reverseInput.is(':checked') ? 1 : 0,
                };
                self.MIXER_RULES_dirty = true;
                self.needSave = true;
                setDirty();
                renderMixerRuleTable();
            }

            // While a rule is still symmetric (Weight === Weight-), changing
            // Weight keeps Weight- in lockstep. Once the user has deliberately
            // set them apart for differential, further Weight edits leave
            // Weight- alone.
            weightInput.on('change', function () {
                if (rule.weight === rule.weightNeg) {
                    weightNegInput.val(weightInput.val());
                }
                commit();
            });

            outputSelect.on('change', commit);
            operSelect.on('change', commit);
            inputSelect.on('change', commit);
            curveSelect.on('change', commit);
            weightNegInput.on('change', commit);
            offsetInput.on('change', commit);
            speedInput.on('change', commit);
            reverseInput.on('change', commit);

            if (isBlank) {
                row.find('.mixerRuleActions a').hide();
            } else {
                row.find('.ruleMoveUp').toggle(pos > 0).on('click', function (event) {
                    event.preventDefault();
                    const target = visibleIndexes[pos - 1];
                    Mixer.swapRules(FC.MIXER_RULES, index, target);
                    self.MIXER_RULES_dirty = true;
                    self.needSave = true;
                    setDirty();
                    renderMixerRuleTable(target);
                });

                row.find('.ruleMoveDown').toggle(pos < blankIndex - 1).on('click', function (event) {
                    event.preventDefault();
                    const target = visibleIndexes[pos + 1];
                    Mixer.swapRules(FC.MIXER_RULES, index, target);
                    self.MIXER_RULES_dirty = true;
                    self.needSave = true;
                    setDirty();
                    renderMixerRuleTable(target);
                });

                row.find('.ruleDelete').on('click', function (event) {
                    event.preventDefault();
                    FC.MIXER_RULES.splice(index, 1);
                    FC.MIXER_RULES.push(Mixer.nullRule());
                    self.MIXER_RULES_dirty = true;
                    self.needSave = true;
                    setDirty();
                    renderMixerRuleTable();
                });
            }

            tbody.append(row);
        });
    }

    function populatePresetSelect() {
        const select = $('#mixerPresetSelect');
        select.empty();

        Mixer.presets.forEach(function (preset) {
            select.append($('<option></option>').attr('value', preset.id).text(i18n.getMessage(preset.nameKey)));
        });
    }

    function applyPreset(presetId) {
        const preset = Mixer.getPresetById(presetId);
        if (!preset) return;

        const ruleCount = FC.MIXER_RULES.length || Mixer.RULE_COUNT;
        const nextRules = [];

        for (let i = 0; i < ruleCount; i++) {
            nextRules.push(Mixer.nullRule());
        }

        preset.rules.forEach(function (rule, index) {
            if (index < nextRules.length) {
                nextRules[index] = Mixer.cloneRule(rule);
            }
        });

        FC.MIXER_RULES = nextRules;
        self.MIXER_RULES_dirty = true;
        self.needSave = true;
        setDirty();

        renderMixerRuleTable();
    }

    function process_html() {

        // translate to user-selected language
        i18n.localizePage();

        // UI Hooks
        data_to_form();
        populatePresetSelect();
        renderMixerRuleTable();

        // Hide the buttons toolbar
        $('.tab-mixer').addClass('toolbar_hidden');

        self.save = function (callback) {
            save_data(callback);
        };

        self.revert = function (callback) {
            FC.MIXER_CONFIG = self.origMixerConfig;
            FC.MIXER_INPUTS = self.origMixerInputs;
            FC.MIXER_RULES = self.origMixerRules;

            self.needSave = false;
            self.needReboot = false;

            save_data(callback);
        };

        $('a.save').click(function () {
            self.save(() => GUI.tab_switch_reload());
        });

        $('a.mixerAddRule').click(function (event) {
            event.preventDefault();
            const index = Mixer.firstFreeRuleIndex(FC.MIXER_RULES);
            if (index === -1) return;

            FC.MIXER_RULES[index] = { oper: Mixer.OP_SET, src: 0, dst: 0, curve: 0, weight: 1000, weightNeg: 1000, offset: 0, speed: 0, reverse: 0 };
            self.MIXER_RULES_dirty = true;
            self.needSave = true;
            setDirty();
            renderMixerRuleTable();
        });

        $('a.mixerLoadPreset').click(function (event) {
            event.preventDefault();
            applyPreset(parseInt($('#mixerPresetSelect').val(), 10));
        });

        $('a.reboot').click(function () {
            self.save(() => GUI.tab_switch_reload());
        });

        $('a.revert').click(function () {
            self.revert(() => GUI.tab_switch_reload());
        });

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
