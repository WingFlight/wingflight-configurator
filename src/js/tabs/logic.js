import { LogicCondition } from '@/js/LogicCondition.js';
import { getModeDisplayName, isModeVisible } from '@/js/FlightMode.js';

const tab = {
    tabName: 'logic',
    isDirty: false,
    needSave: false,
    CONDITIONS_dirty: false,
    PRIMARY_CHANNEL_COUNT: 4,
};

tab.initialize = function (callback) {
    const self = this;

    function setDirty() {
        if (!self.isDirty) {
            self.isDirty = true;
            $('.tab-logic').removeClass('toolbar_hidden');
        }
    }

    load_data(load_html);

    function load_html() {
        $('#content').load("/src/tabs/logic.html", process_html);
    }

    function load_data(callback) {
        MSP.promise(MSPCodes.MSP_RC)
            .then(() => MSP.promise(MSPCodes.MSP_BOXIDS))
            .then(() => MSP.promise(MSPCodes.MSP_BOXNAMES))
            .then(() => MSP.promise(MSPCodes.MSP_LOGIC_CONDITIONS))
            .then(callback);
    }

    function save_data(callback) {
        function send_conditions() {
            if (self.CONDITIONS_dirty)
                mspHelper.sendLogicConditions(save_eeprom);
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
            self.CONDITIONS_dirty = false;
            self.isDirty = false;
            callback?.();
        }

        send_conditions();
    }

    // RC channel choices for the RC_CHANNEL operand type - mirrors the order
    // the firmware's rcInput[] array uses (Roll, Pitch, Yaw, Throttle, then AUX1..).
    function channelChoices() {
        const choices = [
            { value: 0, label: i18n.getMessage('logicChannelRoll') },
            { value: 1, label: i18n.getMessage('logicChannelPitch') },
            { value: 2, label: i18n.getMessage('logicChannelYaw') },
            { value: 3, label: i18n.getMessage('logicChannelThrottle') },
        ];

        const auxChannelCount = Math.max(0, (FC.RC.active_channels || 0) - self.PRIMARY_CHANNEL_COUNT);
        for (let i = 0; i < auxChannelCount; i++) {
            choices.push({ value: self.PRIMARY_CHANNEL_COUNT + i, label: 'AUX' + (i + 1) });
        }

        return choices;
    }

    // Flight mode (box) choices for the FLIGHT_MODE operand type - same
    // source, heli-only filter, and display names as the Modes tab.
    function modeChoices() {
        const choices = [];

        for (let i = 0; i < FC.AUX_CONFIG.length; i++) {
            if (!isModeVisible(FC.AUX_CONFIG[i])) continue;
            choices.push({ value: FC.AUX_CONFIG_IDS[i], label: getModeDisplayName(FC.AUX_CONFIG[i]) });
        }

        return choices;
    }

    // Sensor choices for the SENSOR operand type - fixed list, mirrors
    // LogicCondition.sensorNames (matches firmware's logicSensor_e).
    function sensorChoices() {
        return LogicCondition.sensorNames.map(function (nameKey, i) {
            return { value: i, label: i18n.getMessage(nameKey) };
        });
    }

    // Profile choices for the PROFILE operand type - fixed list, mirrors
    // LogicCondition.profileNames (matches firmware's logicProfile_e).
    function profileChoices() {
        return LogicCondition.profileNames.map(function (nameKey, i) {
            return { value: i, label: i18n.getMessage(nameKey) };
        });
    }

    function populateSelect(select, choices) {
        select.empty();
        choices.forEach(function (choice) {
            select.append($('<option></option>').attr('value', choice.value).text(choice.label));
        });
    }

    // Only elements inside a currently-visible channel group are ever
    // queried here, so there's no need to blank out anything for operands
    // that aren't a Channel right now - they're hidden, not just empty.
    function update_channel_values() {
        $('.condOperandAValueChannelGroup:visible .condOperandAValueChannel, .condOperandBValueChannelGroup:visible .condOperandBValueChannel').each(function () {
            const select = $(this);
            const value = FC.RC.channels[parseInt(select.val(), 10)];
            select.siblings('.condOperandALiveValue, .condOperandBLiveValue').text(value !== undefined ? value : '');
        });
    }

    // Each operand cell holds four overlapping widgets (plain value, channel,
    // mode, condition reference) - only the one matching the operand's
    // current type is shown, the rest stay in the DOM so the table's column
    // widths never shift as types are switched. The number and channel
    // widgets are each a group (value+"Set Value" button, select+live
    // readout sitting inline beside it), toggled as one.
    function showOperandWidget(widgets, type) {
        widgets.numberGroup.toggle(type === LogicCondition.OPERAND_TYPE_VALUE);
        widgets.channelGroup.toggle(type === LogicCondition.OPERAND_TYPE_RC_CHANNEL);
        widgets.mode.toggle(type === LogicCondition.OPERAND_TYPE_FLIGHT_MODE);
        widgets.condition.toggle(type === LogicCondition.OPERAND_TYPE_CONDITION);
        widgets.sensor.toggle(type === LogicCondition.OPERAND_TYPE_SENSOR);
        widgets.profile.toggle(type === LogicCondition.OPERAND_TYPE_PROFILE);
    }

    function widgetForType(valueWidgets, type) {
        switch (type) {
            case LogicCondition.OPERAND_TYPE_RC_CHANNEL:  return valueWidgets.channel;
            case LogicCondition.OPERAND_TYPE_FLIGHT_MODE: return valueWidgets.mode;
            case LogicCondition.OPERAND_TYPE_CONDITION:   return valueWidgets.condition;
            case LogicCondition.OPERAND_TYPE_SENSOR:      return valueWidgets.sensor;
            case LogicCondition.OPERAND_TYPE_PROFILE:     return valueWidgets.profile;
            default:                                       return valueWidgets.number;
        }
    }

    // A VALUE operand being compared against a Sensor or Profile sibling is
    // shown/entered in that sibling's real-world unit (volts, m/s, 1-based
    // profile number...) rather than the raw wire integer - wire = (display -
    // offset) * scale. `count`, when set, is how many valid values the
    // sibling has (e.g. 6 battery profiles) - used to clamp the number
    // widget's range instead of falling back to the generic int16 bounds.
    function pairedTransform(siblingTypeSelect, siblingWidgets) {
        const siblingType = parseInt(siblingTypeSelect.val(), 10);
        if (siblingType === LogicCondition.OPERAND_TYPE_SENSOR) {
            const sensorIndex = parseInt(siblingWidgets.sensor.val(), 10);
            return { scale: LogicCondition.sensorScale(sensorIndex), offset: 0, count: null };
        }
        if (siblingType === LogicCondition.OPERAND_TYPE_PROFILE) {
            const profileIndex = parseInt(siblingWidgets.profile.val(), 10);
            return { scale: 1, offset: 1, count: LogicCondition.profileCount(profileIndex) };
        }
        return { scale: 1, offset: 0, count: null };
    }

    // Applies a transform's step/range to a VALUE number widget without
    // touching its currently displayed value.
    function applyNumberBounds(widgets, transform) {
        const { scale, offset, count } = transform;
        widgets.number.attr('step', scale > 1 ? 1 / scale : 1);
        if (count != null) {
            widgets.number.attr('min', offset);
            widgets.number.attr('max', offset + count - 1);
        } else {
            widgets.number.attr('min', -32000 / scale + offset);
            widgets.number.attr('max', 32000 / scale + offset);
        }
        widgets.number.data('scale', scale);
        widgets.number.data('offset', offset);
        widgets.number.data('count', count ?? null);
    }

    // Hard-sets a VALUE number widget's step/range/display from a raw wire
    // value and transform - used on first render and whenever an operand
    // switches to being a VALUE (no prior on-screen value to preserve).
    function initNumberWidget(widgets, rawValue, transform) {
        const { scale, offset } = transform;
        const decimals = scale > 1 ? Math.round(Math.log10(scale)) : 0;
        widgets.number.val((rawValue / scale + offset).toFixed(decimals));
        applyNumberBounds(widgets, transform);
    }

    // Re-scales a VALUE number widget already on screen - e.g. its sibling
    // just changed from Altitude to PID Profile - by converting the currently
    // displayed value back to its raw wire integer using the previous
    // transform, then redisplaying it at the new one. If only the range
    // changed (e.g. switching between two profile sensors, both 1-based),
    // the displayed value is left alone and just the bounds are refreshed.
    function setNumberScale(widgets, transform) {
        const prevScale = widgets.number.data('scale') || 1;
        const prevOffset = widgets.number.data('offset') || 0;
        if (prevScale === transform.scale && prevOffset === transform.offset) {
            applyNumberBounds(widgets, transform);
            return;
        }
        const displayValue = parseFloat(widgets.number.val());
        const rawValue = Math.round(((isNaN(displayValue) ? prevOffset : displayValue) - prevOffset) * prevScale);
        initNumberWidget(widgets, rawValue, transform);
    }

    // Reads an operand's current widget value back into a raw wire integer -
    // a VALUE operand is entered in real units and needs unscaling/unoffsetting
    // by its paired sensor's transform; every other operand type is already a
    // plain index.
    function operandRawValue(widgets, type) {
        const widget = widgetForType(widgets, type);
        if (type === LogicCondition.OPERAND_TYPE_VALUE) {
            const scale = widget.data('scale') || 1;
            const offset = widget.data('offset') || 0;
            const displayValue = parseFloat(widget.val());
            return Math.round(((isNaN(displayValue) ? offset : displayValue) - offset) * scale);
        }
        return parseInt(widget.val(), 10) || 0;
    }

    function renderConditionTable() {
        const tbody = $('#logicConditionTableBody');
        if (!tbody.length) return;
        tbody.empty();

        const channels = channelChoices();
        const modes = modeChoices();
        const sensors = sensorChoices();
        const profiles = profileChoices();

        FC.LOGIC_CONDITIONS.forEach(function (condition, index) {
            const row = $('#tab-logic-templates .logicConditionTemplate tr').clone();

            const enableInput = row.find('.condEnable');
            const operatorSelect = row.find('.condOperator');

            const operandATypeSelect = row.find('.condOperandAType');
            const operandAWidgets = {
                numberGroup:  row.find('.condOperandAValueNumberGroup'),
                number:       row.find('.condOperandAValueNumber'),
                setValue:     row.find('.condOperandASetValue'),
                channelGroup: row.find('.condOperandAValueChannelGroup'),
                channel:      row.find('.condOperandAValueChannel'),
                mode:         row.find('.condOperandAValueMode'),
                condition:    row.find('.condOperandAValueCondition'),
                sensor:       row.find('.condOperandAValueSensor'),
                profile:      row.find('.condOperandAValueProfile'),
            };

            const operandBTypeSelect = row.find('.condOperandBType');
            const operandBWidgets = {
                numberGroup:  row.find('.condOperandBValueNumberGroup'),
                number:       row.find('.condOperandBValueNumber'),
                setValue:     row.find('.condOperandBSetValue'),
                channelGroup: row.find('.condOperandBValueChannelGroup'),
                channel:      row.find('.condOperandBValueChannel'),
                mode:         row.find('.condOperandBValueMode'),
                condition:    row.find('.condOperandBValueCondition'),
                sensor:       row.find('.condOperandBValueSensor'),
                profile:      row.find('.condOperandBValueProfile'),
            };

            LogicCondition.operationNames.forEach(function (nameKey, i) {
                operatorSelect.append($('<option></option>').attr('value', i).text(i18n.getMessage(nameKey)));
            });

            LogicCondition.operandTypeNames.forEach(function (nameKey, i) {
                operandATypeSelect.append($('<option></option>').attr('value', i).text(i18n.getMessage(nameKey)));
                operandBTypeSelect.append($('<option></option>').attr('value', i).text(i18n.getMessage(nameKey)));
            });

            populateSelect(operandAWidgets.channel, channels);
            populateSelect(operandBWidgets.channel, channels);
            populateSelect(operandAWidgets.mode, modes);
            populateSelect(operandBWidgets.mode, modes);
            populateSelect(operandAWidgets.sensor, sensors);
            populateSelect(operandBWidgets.sensor, sensors);
            populateSelect(operandAWidgets.profile, profiles);
            populateSelect(operandBWidgets.profile, profiles);

            for (let c = 0; c < LogicCondition.CONDITION_COUNT; c++) {
                operandAWidgets.condition.append($('<option></option>').attr('value', c).text(i18n.getMessage('logicConditionLabel', [c + 1])));
                operandBWidgets.condition.append($('<option></option>').attr('value', c).text(i18n.getMessage('logicConditionLabel', [c + 1])));
            }

            row.find('.condIndex').text(index + 1);
            enableInput.prop('checked', !!condition.enabled);
            operatorSelect.val(condition.operation);

            operandATypeSelect.val(condition.operandAType);
            widgetForType(operandAWidgets, condition.operandAType).val(condition.operandAValue);
            showOperandWidget(operandAWidgets, condition.operandAType);

            operandBTypeSelect.val(condition.operandBType);
            widgetForType(operandBWidgets, condition.operandBType).val(condition.operandBValue);
            showOperandWidget(operandBWidgets, condition.operandBType);

            if (condition.operandAType === LogicCondition.OPERAND_TYPE_VALUE) {
                initNumberWidget(operandAWidgets, condition.operandAValue, pairedTransform(operandBTypeSelect, operandBWidgets));
            }
            if (condition.operandBType === LogicCondition.OPERAND_TYPE_VALUE) {
                initNumberWidget(operandBWidgets, condition.operandBValue, pairedTransform(operandATypeSelect, operandAWidgets));
            }

            function updateOperandVisibility() {
                const operation = parseInt(operatorSelect.val(), 10);
                const usesA = LogicCondition.usesOperandA(operation);
                const usesB = LogicCondition.usesOperandB(operation);

                row.find('.condOperandAType, .condOperandAValueNumber, .condOperandAValueChannel, .condOperandAValueMode, .condOperandAValueCondition, .condOperandAValueSensor, .condOperandAValueProfile')
                    .prop('disabled', !usesA);
                row.find('.condOperandBType, .condOperandBValueNumber, .condOperandBValueChannel, .condOperandBValueMode, .condOperandBValueCondition, .condOperandBValueSensor, .condOperandBValueProfile')
                    .prop('disabled', !usesB);

                updateSetValueAvailability();
            }

            // "Set Value" on operand A copies operand B's current channel
            // reading (and vice versa) - only makes sense when the operand
            // itself is in use and its sibling is currently a Channel.
            function updateSetValueAvailability() {
                const operation = parseInt(operatorSelect.val(), 10);
                const aType = parseInt(operandATypeSelect.val(), 10);
                const bType = parseInt(operandBTypeSelect.val(), 10);

                // <a> links ignore the disabled attribute - toggle the class
                // .regular-button.disabled actually styles/blocks instead.
                operandAWidgets.setValue.toggleClass('disabled',
                    !LogicCondition.usesOperandA(operation) || bType !== LogicCondition.OPERAND_TYPE_RC_CHANNEL);
                operandBWidgets.setValue.toggleClass('disabled',
                    !LogicCondition.usesOperandB(operation) || aType !== LogicCondition.OPERAND_TYPE_RC_CHANNEL);
            }

            function setValueFromSibling(targetWidgets, siblingWidgets) {
                const value = FC.RC.channels[parseInt(siblingWidgets.channel.val(), 10)];
                if (value === undefined) return;
                targetWidgets.number.val(value).trigger('change');
            }

            function commit() {
                FC.LOGIC_CONDITIONS[index] = {
                    enabled:        enableInput.is(':checked') ? 1 : 0,
                    operation:      parseInt(operatorSelect.val(), 10),
                    operandAType:   parseInt(operandATypeSelect.val(), 10),
                    operandAValue:  operandRawValue(operandAWidgets, parseInt(operandATypeSelect.val(), 10)),
                    operandBType:   parseInt(operandBTypeSelect.val(), 10),
                    operandBValue:  operandRawValue(operandBWidgets, parseInt(operandBTypeSelect.val(), 10)),
                };
                self.CONDITIONS_dirty = true;
                self.needSave = true;
                setDirty();
            }

            enableInput.on('change', commit);
            operatorSelect.on('change', function () {
                updateOperandVisibility();
                commit();
            });
            operandATypeSelect.on('change', function () {
                const newType = parseInt(operandATypeSelect.val(), 10);
                showOperandWidget(operandAWidgets, newType);
                if (newType === LogicCondition.OPERAND_TYPE_VALUE) {
                    initNumberWidget(operandAWidgets, 0, pairedTransform(operandBTypeSelect, operandBWidgets));
                }
                if (parseInt(operandBTypeSelect.val(), 10) === LogicCondition.OPERAND_TYPE_VALUE) {
                    setNumberScale(operandBWidgets, pairedTransform(operandATypeSelect, operandAWidgets));
                }
                updateSetValueAvailability();
                commit();
            });
            operandBTypeSelect.on('change', function () {
                const newType = parseInt(operandBTypeSelect.val(), 10);
                showOperandWidget(operandBWidgets, newType);
                if (newType === LogicCondition.OPERAND_TYPE_VALUE) {
                    initNumberWidget(operandBWidgets, 0, pairedTransform(operandATypeSelect, operandAWidgets));
                }
                if (parseInt(operandATypeSelect.val(), 10) === LogicCondition.OPERAND_TYPE_VALUE) {
                    setNumberScale(operandAWidgets, pairedTransform(operandBTypeSelect, operandBWidgets));
                }
                updateSetValueAvailability();
                commit();
            });
            // Choosing a different sensor/profile on one side rescales a VALUE
            // widget on the other side to match its unit - must run before
            // the generic commit binding below so commit() reads the
            // already-rescaled value.
            operandAWidgets.sensor.add(operandAWidgets.profile).on('change', function () {
                if (parseInt(operandBTypeSelect.val(), 10) === LogicCondition.OPERAND_TYPE_VALUE) {
                    setNumberScale(operandBWidgets, pairedTransform(operandATypeSelect, operandAWidgets));
                }
            });
            operandBWidgets.sensor.add(operandBWidgets.profile).on('change', function () {
                if (parseInt(operandATypeSelect.val(), 10) === LogicCondition.OPERAND_TYPE_VALUE) {
                    setNumberScale(operandAWidgets, pairedTransform(operandBTypeSelect, operandBWidgets));
                }
            });
            row.find('.condOperandAValueNumber, .condOperandAValueChannel, .condOperandAValueMode, .condOperandAValueCondition, .condOperandAValueSensor, .condOperandAValueProfile').on('change', commit);
            row.find('.condOperandBValueNumber, .condOperandBValueChannel, .condOperandBValueMode, .condOperandBValueCondition, .condOperandBValueSensor, .condOperandBValueProfile').on('change', commit);

            operandAWidgets.setValue.on('click', function (event) {
                event.preventDefault();
                setValueFromSibling(operandAWidgets, operandBWidgets);
            });
            operandBWidgets.setValue.on('click', function (event) {
                event.preventDefault();
                setValueFromSibling(operandBWidgets, operandAWidgets);
            });

            updateOperandVisibility();

            tbody.append(row);
        });
    }

    function update_status() {
        MSP.send_message(MSPCodes.MSP_LOGIC_CONDITIONS_STATUS, false, false, render_status);
    }

    function render_status() {
        const rows = $('#logicConditionTableBody tr.logicCondition');
        FC.LOGIC_CONDITIONS_STATUS.forEach(function (value, index) {
            const statusSpan = rows.eq(index).find('.condStatus');
            statusSpan.toggleClass('logicStatusTrue', !!value);
            statusSpan.toggleClass('logicStatusFalse', !value);
        });
    }

    function update_channels() {
        MSP.send_message(MSPCodes.MSP_RC, false, false, update_channel_values);
    }

    function process_html() {
        i18n.localizePage();

        while (FC.LOGIC_CONDITIONS.length < LogicCondition.CONDITION_COUNT) {
            FC.LOGIC_CONDITIONS.push(LogicCondition.nullCondition());
        }

        self.origConditions = LogicCondition.cloneConditions(FC.LOGIC_CONDITIONS);
        self.isDirty = false;
        self.needSave = false;
        self.CONDITIONS_dirty = false;

        $('.tab-logic').addClass('toolbar_hidden');

        renderConditionTable();

        self.save = function (callback) {
            save_data(callback);
        };

        self.revert = function (callback) {
            FC.LOGIC_CONDITIONS = self.origConditions;
            self.needSave = false;
            save_data(callback);
        };

        $('a.save').click(function () {
            self.save(() => GUI.tab_switch_reload());
        });

        $('a.revert').click(function () {
            self.revert(() => GUI.tab_switch_reload());
        });

        GUI.interval_add('logic_status_pull', update_status, 200);
        GUI.interval_add('logic_channel_pull', update_channels, 150);

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
