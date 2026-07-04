export const LogicCondition = {

    CONDITION_COUNT: 16,

    OPERATION_TRUE: 0,
    OPERATION_EQUAL: 1,
    OPERATION_GREATER_THAN: 2,
    OPERATION_LOWER_THAN: 3,
    OPERATION_AND: 4,
    OPERATION_OR: 5,
    OPERATION_XOR: 6,
    OPERATION_NOT: 7,
    OPERATION_STICKY: 8,
    OPERATION_DELAY: 9,
    OPERATION_EDGE: 10,
    OPERATION_APPROX_EQUAL: 11,

    operationNames: [
        'logicOperationTrue',
        'logicOperationEqual',
        'logicOperationGreaterThan',
        'logicOperationLowerThan',
        'logicOperationAnd',
        'logicOperationOr',
        'logicOperationXor',
        'logicOperationNot',
        'logicOperationSticky',
        'logicOperationDelay',
        'logicOperationEdge',
        'logicOperationApproxEqual',
    ],

    OPERAND_TYPE_VALUE: 0,
    OPERAND_TYPE_RC_CHANNEL: 1,
    OPERAND_TYPE_FLIGHT_MODE: 2,
    OPERAND_TYPE_CONDITION: 3,
    OPERAND_TYPE_SENSOR: 4,
    OPERAND_TYPE_PROFILE: 5,

    operandTypeNames: [
        'logicOperandTypeValue',
        'logicOperandTypeChannel',
        'logicOperandTypeMode',
        'logicOperandTypeCondition',
        'logicOperandTypeSensor',
        'logicOperandTypeProfile',
    ],

    // Selector values for OPERAND_TYPE_SENSOR - matches firmware's logicSensor_e
    // (pg/logic_condition.h). Fixed, small set of common sensors, unlike
    // channel/mode/condition choices which are populated dynamically from FC data.
    SENSOR_ALTITUDE: 0,
    SENSOR_VOLTAGE: 1,
    SENSOR_CURRENT: 2,
    SENSOR_RPM: 3,
    SENSOR_RSSI: 4,
    SENSOR_BATTERY_PERCENT: 5,
    SENSOR_MAH_DRAWN: 6,
    SENSOR_GPS_SPEED: 7,

    sensorNames: [
        'logicSensorAltitude',
        'logicSensorVoltage',
        'logicSensorCurrent',
        'logicSensorRpm',
        'logicSensorRssi',
        'logicSensorBatteryPercent',
        'logicSensorMahDrawn',
        'logicSensorGpsSpeed',
    ],

    // Wire-value-per-display-unit for each sensor - e.g. voltage travels over
    // MSP as deci-volts (matches firmware's logicSensor_e comments in
    // pg/logic_condition.h), so the UI multiplies/divides by this factor to
    // let a VALUE operand compared against it be entered/shown in real units
    // (volts, m/s, ...) instead of the raw scaled integer.
    sensorScales: [
        10, // SENSOR_ALTITUDE: 0.1m units
        10, // SENSOR_VOLTAGE: 0.1V units
        10, // SENSOR_CURRENT: 0.1A units
        1,  // SENSOR_RPM
        1,  // SENSOR_RSSI: %
        1,  // SENSOR_BATTERY_PERCENT: %
        1,  // SENSOR_MAH_DRAWN
        10, // SENSOR_GPS_SPEED: 0.1m/s units
    ],

    // Selector values for OPERAND_TYPE_PROFILE - matches firmware's
    // logicProfile_e. A separate top-level operand type from Sensor since
    // "which profile is active" isn't a live reading, it's a mode-like pick.
    PROFILE_PID: 0,
    PROFILE_RATE: 1,
    PROFILE_BATTERY: 2,

    profileNames: [
        'logicProfilePid',
        'logicProfileRate',
        'logicProfileBattery',
    ],

    // All three profile kinds support 6 slots.
    profileCounts: [
        6, // PROFILE_PID
        6, // PROFILE_RATE
        6, // PROFILE_BATTERY
    ],

    //// Functions

    // Wire value = (display value - offset) * scale. Unknown/out-of-range
    // sensor indices are treated as unscaled rather than throwing.
    sensorScale: function (sensorIndex)
    {
        return this.sensorScales[sensorIndex] || 1;
    },

    // Profile indices travel over MSP 0-based (matches getCurrentPidProfileIndex()
    // and friends) but every other profile picker in this UI (Rates, Power,
    // Adjustments) shows/accepts 1-based numbers, so a VALUE compared against
    // one is entered/shown +1 relative to the wire value.
    profileCount: function (profileIndex)
    {
        return this.profileCounts[profileIndex] || 6;
    },

    // Whether operandA is meaningful for this operation - false only for
    // TRUE, which takes no operands at all.
    usesOperandA: function (operation)
    {
        return operation !== this.OPERATION_TRUE;
    },

    // Whether operandB is meaningful for this operation - false for TRUE
    // (no operands) and NOT (a single-operand inverter).
    usesOperandB: function (operation)
    {
        return operation !== this.OPERATION_TRUE && operation !== this.OPERATION_NOT;
    },

    nullCondition: function ()
    {
        return {
            enabled: 0,
            operation: this.OPERATION_TRUE,
            operandAType: this.OPERAND_TYPE_VALUE,
            operandAValue: 0,
            operandBType: this.OPERAND_TYPE_VALUE,
            operandBValue: 0,
        };
    },

    cloneCondition: function (a)
    {
        return Object.assign({}, a);
    },

    cloneConditions: function (a)
    {
        const self = this;
        const copy = [];

        if (a) {
            a.forEach(function (condition) {
                copy.push(self.cloneCondition(condition));
            });
        }

        return copy;
    },

    compareCondition: function (a, b)
    {
        return( a.enabled       === b.enabled &&
                a.operation     === b.operation &&
                a.operandAType  === b.operandAType &&
                a.operandAValue === b.operandAValue &&
                a.operandBType  === b.operandBType &&
                a.operandBValue === b.operandBValue );
    },

};
