import * as noUiSlider from 'nouislider';
import semver from 'semver';
import wNumb from 'wnumb';

import { MixerCurve } from '@/js/MixerCurve.js';
import { LogicCondition } from '@/js/LogicCondition.js';
import MixerWizardDialog from '@/js/MixerWizardDialog.js';

const tab = {
    tabName: 'mixer',
    isDirty: false,
    needSave: false,
    needReboot: false,

    MIXER_RULES_dirty: false,

    // Override sliders for the 3 stabilized axes that still mean something on
    // a fixed-wing airframe (roll/pitch/yaw -> aileron/elevator/rudder).
    // Collective has no equivalent and is intentionally omitted.
    overrideMixer: [
        { axis: 1, min: -100, max: 100, step: 1, fixed: 0, scale: 25, sliderstep: 1, pipstep: 25, pipfix: 0, pipval: [ -100, -75, -50, -25, 0, 25, 50, 75, 100 ] },
        { axis: 2, min: -100, max: 100, step: 1, fixed: 0, scale: 25, sliderstep: 1, pipstep: 25, pipfix: 0, pipval: [ -100, -75, -50, -25, 0, 25, 50, 75, 100 ] },
        { axis: 3, min: -100, max: 100, step: 1, fixed: 0, scale: 25, sliderstep: 1, pipstep: 25, pipfix: 0, pipval: [ -100, -75, -50, -25, 0, 25, 50, 75, 100 ] },
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

        send_mixer_rules();
    }

    function add_override(axis) {

        const mixerOverride = $('#tab-mixer-templates .mixerOverrideTemplate tr').clone();
        const mixerSlider = mixerOverride.find('.mixerOverrideSlider').get(0);
        const mixerEnable = mixerOverride.find('.mixerOverrideEnable input');
        const mixerPassthrough = mixerOverride.find('.mixerPassthroughEnable input');
        const mixerInput  = mixerOverride.find('.mixerOverrideInput input');

        const inputIndex = axis.axis;

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
            const conditionSelect = row.find('.ruleCondition');

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
            conditionSelect.append($('<option></option>').attr('value', 0).text(i18n.getMessage('mixerConditionNone')));
            for (let c = 0; c < LogicCondition.CONDITION_COUNT; c++) {
                conditionSelect.append($('<option></option>').attr('value', c + 1).text(i18n.getMessage('logicConditionLabel', [c + 1])));
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
            conditionSelect.val(rule.condition);

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
                    condition: parseInt(conditionSelect.val(), 10) || 0,
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
            conditionSelect.on('change', commit);

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

    function applyWizardRules(options) {
        const generatedRules = Mixer.buildWizardRules(options);
        const ruleCount = FC.MIXER_RULES.length || Mixer.RULE_COUNT;
        const nextRules = [];

        for (let i = 0; i < ruleCount; i++) {
            nextRules.push(Mixer.nullRule());
        }

        generatedRules.forEach(function (rule, index) {
            if (index < nextRules.length) {
                nextRules[index] = rule;
            }
        });

        FC.MIXER_RULES = nextRules;
        self.MIXER_RULES_dirty = true;
        self.needSave = true;
        setDirty();

        renderMixerRuleTable();
    }

    // Dims any rule row whose assigned condition is currently false, so it's
    // obvious at a glance which rules are actually contributing right now
    // versus just configured but gated off.
    function update_condition_status() {
        MSP.send_message(MSPCodes.MSP_LOGIC_CONDITIONS_STATUS, false, false, render_condition_status);
    }

    function render_condition_status() {
        $('#mixerRuleTableBody tr.mixerRule').each(function () {
            const row = $(this);
            const condition = parseInt(row.find('.ruleCondition').val(), 10);
            const gatedOff = condition > 0 && !FC.LOGIC_CONDITIONS_STATUS[condition - 1];
            row.toggleClass('mixerRuleGatedOff', gatedOff);
        });
    }

    function process_html() {

        // translate to user-selected language
        i18n.localizePage();

        // UI Hooks
        data_to_form();
        renderMixerRuleTable();

        self.mixerWizardDialog = new MixerWizardDialog($('#mixerWizardDialog'), applyWizardRules);
        self.mixerWizardDialog.initialize();

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

            FC.MIXER_RULES[index] = { oper: Mixer.OP_SET, src: 0, dst: 0, curve: 0, weight: 1000, weightNeg: 1000, offset: 0, speed: 0, reverse: 0, condition: 0 };
            self.MIXER_RULES_dirty = true;
            self.needSave = true;
            setDirty();
            renderMixerRuleTable();
        });

        $('a.mixerOpenWizard').click(function (event) {
            event.preventDefault();
            self.mixerWizardDialog.open();
        });

        $('a.reboot').click(function () {
            self.save(() => GUI.tab_switch_reload());
        });

        $('a.revert').click(function () {
            self.revert(() => GUI.tab_switch_reload());
        });

        GUI.interval_add('mixer_condition_status_pull', update_condition_status, 200, true);

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
