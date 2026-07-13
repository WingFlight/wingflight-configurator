import * as noUiSlider from 'nouislider';
import wNumb from 'wnumb';

import { MixerCurve } from '@/js/MixerCurve.js';
import { LogicCondition } from '@/js/LogicCondition.js';
import MixerWizardDialog from '@/js/MixerWizardDialog.js';

// The HTML min/max attributes on the rule inputs are display hints only --
// they don't stop a typed-in value from reaching FC.MIXER_RULES, and the FC
// only range-checks weight (not weightNeg/offset) on its own reboot, not over
// MSP. So out-of-range input has to be clamped here before it's committed.
function clampInt(value, min, max) {
    const n = parseInt(value, 10) || 0;
    return Math.min(max, Math.max(min, n));
}

// weight/weightNeg are signed on the wire -- their sign is a rule's only
// notion of polarity. The GUI instead shows a single non-negative Weight, a
// Reverse checkbox (purely local; there's no separate wire field for it any
// more), and a Differential % expressing weightNeg as a fraction of weight:
// 0% is the common symmetric case, 100% fully suppresses the negative-input
// side, negative values boost it instead. Rules with mismatched weight/
// weightNeg signs, or |weightNeg| more than 2x |weight| (e.g. hand-edited via
// CLI), fall outside what this representation can express losslessly and get
// normalized the next time the rule is edited.
const DIFFERENTIAL_MIN = -100;
const DIFFERENTIAL_MAX = 100;

function ruleToDisplay(rule) {
    let weight = rule.weight;
    let weightNeg = rule.weightNeg;
    const reverse = weight < 0;
    if (reverse) {
        weight = -weight;
        weightNeg = -weightNeg;
    }
    const differential = weight === 0 ? 0 : Math.round((1 - weightNeg / weight) * 100);
    return { weight, differential: clampInt(differential, DIFFERENTIAL_MIN, DIFFERENTIAL_MAX), reverse };
}

function displayToRule(weight, differential, reverse) {
    const weightNeg = clampInt(Math.round(weight * (1 - differential / 100)), Mixer.WEIGHT_MIN, Mixer.WEIGHT_MAX);
    const sign = reverse ? -1 : 1;
    return { weight: sign * weight, weightNeg: sign * weightNeg };
}

// Indices into FC.MIXER_INPUTS for the three stabilized axes -- matches the
// firmware's MIXER_IN_STABILIZED_ROLL/PITCH/YAW wire order (see Mixer.inputNames).
const AXIS_GAIN_INPUTS = { roll: 1, pitch: 2, yaw: 3 };

const AXIS_GAIN_MIN = 0;
const AXIS_GAIN_MAX = 200;

// mixerInputs[].rate is a fixed-point multiplier on the wire (1000 = unity);
// the GUI shows its magnitude as a plain percentage, with a separate Invert
// checkbox controlling the sign -- inverting here flips every rule reading
// the axis at once, without having to touch each rule's own Reverse checkbox.
function rateToPercent(rate) {
    return Math.round(Math.abs(rate) / 10);
}

function percentToRate(percent, invert) {
    const magnitude = clampInt(percent, AXIS_GAIN_MIN, AXIS_GAIN_MAX) * 10;
    return invert ? -magnitude : magnitude;
}

// Same three stabilized axes as AXIS_GAIN_INPUTS -- these are the only
// mixer inputs that drive control surfaces, so they're the only ones
// exposed for override.
const OVERRIDE_AXES = [
    { index: 1, className: 'overrideRoll' },
    { index: 2, className: 'overridePitch' },
    { index: 3, className: 'overrideYaw' },
];

const OVERRIDE_PERCENT_MIN = -100;
const OVERRIDE_PERCENT_MAX = 100;

// FC.MIXER_OVERRIDE shares the mixer input's own raw scale (1000 = 100%,
// see mixerSetInput() dividing by 1000.0f in flight/mixer.c) -- the same
// x10 convention rateToPercent/percentToRate already use for axis gain.
function overridePercentToRaw(percent) {
    return clampInt(percent, OVERRIDE_PERCENT_MIN, OVERRIDE_PERCENT_MAX) * 10;
}

function overrideRawToPercent(raw) {
    return Math.round(raw / 10);
}

const tab = {
    tabName: 'mixer',
    isDirty: false,
    needSave: false,
    needReboot: false,

    MIXER_RULES_dirty: false,
    MIXER_INPUTS_dirty: false,
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
        function send_mixer_inputs() {
            if (self.MIXER_INPUTS_dirty)
                mspHelper.sendMixerInputs(send_mixer_rules);
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
            self.MIXER_RULES_dirty = false;
            self.MIXER_INPUTS_dirty = false;

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

        send_mixer_inputs();
    }

    function data_to_form() {

        $('.tab-mixer .note').hide();
        $('.mixerAxisGainNote').show();

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
        self.MIXER_INPUTS_dirty = false;
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
            const differentialInput = row.find('.ruleDifferential');
            const offsetInput     = row.find('.ruleOffset');
            const speedInput      = row.find('.ruleSpeed');
            const reverseInput    = row.find('.ruleReverse');
            const conditionSelect = row.find('.ruleCondition');

            Mixer.outputNames.forEach(function (_nameKey, i) {
                outputSelect.append($('<option></option>').attr('value', i).text(Mixer.outputLabel(i, i18n)));
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
            const display = ruleToDisplay(rule);
            weightInput.val(display.weight);
            differentialInput.val(display.differential);
            offsetInput.val(rule.offset);
            speedInput.val(rule.speed);
            reverseInput.prop('checked', display.reverse);
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
                const { weight, weightNeg } = displayToRule(
                    clampInt(weightInput.val(), Mixer.WEIGHT_MIN, Mixer.WEIGHT_MAX),
                    clampInt(differentialInput.val(), DIFFERENTIAL_MIN, DIFFERENTIAL_MAX),
                    reverseInput.is(':checked'),
                );
                FC.MIXER_RULES[index] = {
                    oper:      parseInt(operSelect.val(), 10),
                    src:       parseInt(inputSelect.val(), 10),
                    dst:       parseInt(outputSelect.val(), 10),
                    curve:     parseInt(curveSelect.val(), 10) || 0,
                    weight,
                    weightNeg,
                    offset:    clampInt(offsetInput.val(), Mixer.OFFSET_MIN, Mixer.OFFSET_MAX),
                    speed:     clampInt(speedInput.val(), Mixer.SPEED_MIN, Mixer.SPEED_MAX),
                    condition: parseInt(conditionSelect.val(), 10) || 0,
                };
                self.MIXER_RULES_dirty = true;
                self.needSave = true;
                setDirty();
                renderMixerRuleTable();
            }

            outputSelect.on('change', commit);
            operSelect.on('change', commit);
            inputSelect.on('change', commit);
            curveSelect.on('change', commit);
            weightInput.on('change', commit);
            differentialInput.on('change', commit);
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

    function renderAxisGain() {
        const fields = {
            roll:  { gain: $('.axisGainRoll'),  invert: $('.axisInvertRoll') },
            pitch: { gain: $('.axisGainPitch'), invert: $('.axisInvertPitch') },
            yaw:   { gain: $('.axisGainYaw'),   invert: $('.axisInvertYaw') },
        };

        Object.keys(AXIS_GAIN_INPUTS).forEach(function (axis) {
            const input = FC.MIXER_INPUTS[AXIS_GAIN_INPUTS[axis]];
            if (!input) return;

            const { gain, invert } = fields[axis];
            gain.val(rateToPercent(input.rate));
            invert.val(input.rate < 0 ? '1' : '0');

            function commit() {
                input.rate = percentToRate(gain.val(), invert.val() === '1');
                gain.val(rateToPercent(input.rate));
                self.MIXER_INPUTS_dirty = true;
                self.needSave = true;
                setDirty();
            }

            gain.on('change', commit);
            invert.on('change', commit);
        });
    }

    // Forces a fixed value into a stabilized axis's mixer input, while the
    // aircraft is disarmed (the FC ignores MIXER_OVERRIDE while armed, see
    // mixerSetInput() in flight/mixer.c). Meant to be paired with the Axis
    // Gain box above: enable an axis, command a known %, measure the
    // resulting surface throw, then adjust that axis's gain to match.
    function renderOverride() {
        const table = $('.mixerOverrideTable tbody');
        table.empty();

        let anyEnabled = false;

        OVERRIDE_AXES.forEach(function (axis) {
            const row = $('#tab-mixer-templates .mixerOverrideTemplate tr').clone();
            row.addClass(axis.className);

            const enable = row.find('.mixerOverrideEnable input');
            const valueInput = row.find('.mixerOverrideInput input');
            const sliderEl = row.find('.mixerOverrideSlider').get(0);

            row.find('.mixerOverrideAxisName').text(i18n.getMessage(Mixer.inputNames[axis.index]));

            const slider = noUiSlider.create(sliderEl, {
                range: { min: OVERRIDE_PERCENT_MIN, max: OVERRIDE_PERCENT_MAX },
                start: 0,
                step: 1,
                behaviour: 'snap-drag',
                pips: {
                    mode: 'values',
                    values: [-100, -50, 0, 50, 100],
                    density: 100 / ((OVERRIDE_PERCENT_MAX - OVERRIDE_PERCENT_MIN) / 25),
                    stepped: true,
                    format: wNumb({ decimals: 0 }),
                },
            });

            function toggleSlider(enabled) {
                if (enabled) slider.enable();
                else slider.disable();
            }

            slider.on('slide', function (values) {
                valueInput.val(parseInt(values[0], 10));
            });

            slider.on('change', function () {
                valueInput.trigger('change');
            });

            function commit() {
                const enabled = enable.is(':checked');
                const percent = clampInt(valueInput.val(), OVERRIDE_PERCENT_MIN, OVERRIDE_PERCENT_MAX);

                FC.MIXER_OVERRIDE[axis.index] = enabled ? overridePercentToRaw(percent) : Mixer.OVERRIDE_OFF;
                mspHelper.sendMixerOverride(axis.index);
            }

            valueInput.on('change', function () {
                const value = clampInt($(this).val(), OVERRIDE_PERCENT_MIN, OVERRIDE_PERCENT_MAX);
                valueInput.val(value);
                slider.set(value, true, true);
                commit();
            });

            enable.on('change', function () {
                const enabled = enable.is(':checked');
                valueInput.val(0).prop('disabled', !enabled);
                slider.set(0);
                toggleSlider(enabled);
                commit();
            });

            const rawValue = FC.MIXER_OVERRIDE[axis.index];
            const enabled = Mixer.overrideEnabled(rawValue);
            const percent = enabled ? overrideRawToPercent(rawValue) : 0;
            anyEnabled = anyEnabled || enabled;

            enable.prop('checked', enabled);
            valueInput.val(percent).prop('disabled', !enabled);
            slider.set(percent);
            toggleSlider(enabled);

            table.append(row);
        });

        const masterSwitch = $('#mixerOverrideEnableSwitch');
        masterSwitch.prop('checked', anyEnabled);
        $('.mixerOverrideRows').toggle(anyEnabled);

        masterSwitch.off('change').on('change', function () {
            const checked = masterSwitch.is(':checked');
            $('.mixerOverrideRows').toggle(checked);
            $('.mixerOverrideTable .mixerOverrideEnable input').prop('checked', checked).change();
        });
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
        renderOverride();
        renderAxisGain();

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

            FC.MIXER_RULES[index] = { oper: Mixer.OP_SET, src: 0, dst: 0, curve: 0, weight: 1000, weightNeg: 1000, offset: 0, speed: 0, condition: 0 };
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
