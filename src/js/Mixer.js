export const Mixer = {

    inputNames: [
        'mixerInputNone',
        'mixerInputStabilizedRoll',
        'mixerInputStabilizedPitch',
        'mixerInputStabilizedYaw',
        'mixerInputStabilizedCollective',
        'mixerInputStabilizedThrottle',
        'mixerInputRCCommandRoll',
        'mixerInputRCCommandPitch',
        'mixerInputRCCommandYaw',
        'mixerInputRCCommandCollective',
        'mixerInputRCCommandThrottle',
        'mixerInputRCChannelRoll',
        'mixerInputRCChannelPitch',
        'mixerInputRCChannelYaw',
        'mixerInputRCChannelCollective',
        'mixerInputRCChannelThrottle',
        'mixerInputRCChannelAux1',
        'mixerInputRCChannelAux2',
        'mixerInputRCChannelAux3',
        'mixerInputRCChannel9',
        'mixerInputRCChannel10',
        'mixerInputRCChannel11',
        'mixerInputRCChannel12',
        'mixerInputRCChannel13',
        'mixerInputRCChannel14',
        'mixerInputRCChannel15',
        'mixerInputRCChannel16',
        'mixerInputRCChannel17',
        'mixerInputRCChannel18',
    ],

    outputNames: [
        'mixerOutputNone',
        'mixerOutputServo1',
        'mixerOutputServo2',
        'mixerOutputServo3',
        'mixerOutputServo4',
        'mixerOutputServo5',
        'mixerOutputServo6',
        'mixerOutputServo7',
        'mixerOutputServo8',
        'mixerOutputMotor1',
        'mixerOutputMotor2',
        'mixerOutputMotor3',
        'mixerOutputMotor4',
    ],

    operNames: [
        'mixerRuleNOP',
        'mixerRuleSet',
        'mixerRuleAdd',
        'mixerRuleMul',
    ],

    swashTypes: [
        'mixerSwashType0',
        'mixerSwashType1',
        'mixerSwashType2',
        'mixerSwashType3',
        'mixerSwashType4',
        'mixerSwashType5',
        'mixerSwashType6',
    ],

    OP_NUL: 0,
    OP_SET: 1,
    OP_ADD: 2,
    OP_MUL: 3,

    UNINIT: -1,

    TAIL_MODE_VARIABLE:       0,
    TAIL_MODE_MOTORIZED:      1,
    TAIL_MODE_BIDIRECTIONAL:  2,

    SWASH_TYPE_NONE:    0,
    SWASH_TYPE_THRU:    1,
    SWASH_TYPE_120:     2,
    SWASH_TYPE_135:     3,
    SWASH_TYPE_140:     4,
    SWASH_TYPE_90L:     5,
    SWASH_TYPE_90V:     6,

    RULE_COUNT: 32,

    SPEED_MIN: 0,
    SPEED_MAX: 60000,

    OVERRIDE_MIN: -2500,
    OVERRIDE_MAX:  2500,
    OVERRIDE_OFF:  2501,
    OVERRIDE_PASSTHROUGH:  2502,

    //// Mixer rule presets
    //
    // Each preset is a starting point loaded into the editable rule table —
    // not applied directly. Servo/motor numbers and directions are typically
    // still adjusted by the user afterwards to match their airframe.

    presets: [
        {
            id: 1,
            nameKey: 'mixerPresetStandardGlider',
            rules: [
                { oper: 1, src: 1,  dst: 1, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // SET Stabilized Roll  -> Servo1 (aileron)
                { oper: 1, src: 1,  dst: 2, offset: 0, weight: -1000, weightNeg: -1000, reverse: 0, speed: 0 }, // SET Stabilized Roll  -> Servo2 (aileron, reversed)
                { oper: 1, src: 2,  dst: 3, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // SET Stabilized Pitch -> Servo3 (elevator)
                { oper: 1, src: 3,  dst: 4, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // SET Stabilized Yaw   -> Servo4 (rudder)
                { oper: 1, src: 15, dst: 9, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // SET RC Throttle      -> Motor1
            ],
        },
        {
            id: 2,
            nameKey: 'mixerPresetFlyingWing',
            rules: [
                { oper: 1, src: 2,  dst: 1, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // SET Stabilized Pitch -> Servo1 (left elevon)
                { oper: 2, src: 1,  dst: 1, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // ADD Stabilized Roll  -> Servo1
                { oper: 1, src: 2,  dst: 2, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // SET Stabilized Pitch -> Servo2 (right elevon)
                { oper: 2, src: 1,  dst: 2, offset: 0, weight: -1000, weightNeg: -1000, reverse: 0, speed: 0 }, // ADD Stabilized Roll  -> Servo2 (reversed)
                { oper: 1, src: 15, dst: 9, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // SET RC Throttle      -> Motor1
            ],
        },
        {
            id: 3,
            nameKey: 'mixerPresetVTail',
            rules: [
                { oper: 1, src: 1,  dst: 1, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // SET Stabilized Roll  -> Servo1 (aileron)
                { oper: 1, src: 3,  dst: 2, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // SET Stabilized Yaw   -> Servo2 (right tail)
                { oper: 2, src: 2,  dst: 2, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // ADD Stabilized Pitch -> Servo2
                { oper: 1, src: 3,  dst: 3, offset: 0, weight: -1000, weightNeg: -1000, reverse: 0, speed: 0 }, // SET Stabilized Yaw   -> Servo3 (left tail, reversed)
                { oper: 2, src: 2,  dst: 3, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // ADD Stabilized Pitch -> Servo3
                { oper: 1, src: 15, dst: 9, offset: 0, weight:  1000, weightNeg:  1000, reverse: 0, speed: 0 }, // SET RC Throttle      -> Motor1
            ],
        },
    ],

    getPresetById : function (id)
    {
        return this.presets.find((p) => p.id === id);
    },

    //// Functions

    nullRule: function ()
    {
        return { oper: 0, src: 0, dst: 0, weight: 0, weightNeg: 0, offset: 0, reverse: 0, speed: 0 };
    },

    cloneRule: function (a)
    {
        return Object.assign({}, a);
    },

    compareRule : function (a, b)
    {
        return( a.oper      === b.oper &&
                a.src       === b.src &&
                a.dst       === b.dst &&
                a.weight    === b.weight &&
                a.weightNeg === b.weightNeg &&
                a.offset    === b.offset &&
                a.reverse   === b.reverse &&
                a.speed     === b.speed );
    },

    cloneRules : function (a)
    {
        const self = this;
        const copy = [];

        if (a) {
            a.forEach(function (rule) {
                copy.push(self.cloneRule(rule));
            });
        }

        return copy;
    },

    isNullRule : function (a) {
        return( a.oper      == 0 &&
                a.src       == 0 &&
                a.dst       == 0 &&
                a.weight    == 0 &&
                a.weightNeg == 0 &&
                a.offset    == 0 &&
                a.reverse   == 0 &&
                a.speed     == 0 );
    },

    isNullMixer : function (a) {
        const self = this;

        for (let i=0; i<a.length; i++)
            if (!self.isNullRule(a[i]))
                return false;

        return true;
    },

    compareMixer : function (a, b, cnt)
    {
        const self = this;

        for (let i=0; i<cnt; i++)
            if (!self.compareRule(a[i],b[i]))
                return false;

        return true;
    },

    firstFreeRuleIndex : function (rules)
    {
        const self = this;

        for (let i=0; i<rules.length; i++)
            if (self.isNullRule(rules[i]))
                return i;

        return -1;
    },

    swapRules : function (rules, i, j)
    {
        const tmp = rules[i];
        rules[i] = rules[j];
        rules[j] = tmp;
    },

    cloneInput : function (a)
    {
        return Object.assign({}, a);
    },

    cloneInputs : function (a)
    {
        const b = [];

        a.forEach( function (input) {
            b.push(Mixer.cloneInput(input));
        });

        return b;
    },

    cloneConfig : function (orig)
    {
        const copy = Object.assign({}, orig);

        copy.swash_trim = Array.from(orig.swash_trim);

        return copy;
    },

    overrideEnabled : function (value)
    {
        const enabled = ((value >= Mixer.OVERRIDE_MIN && value <= Mixer.OVERRIDE_MAX) || value == Mixer.OVERRIDE_PASSTHROUGH);

        return enabled;
    },

    passthroughEnabled : function (value)
    {
        const enabled = (value == Mixer.OVERRIDE_PASSTHROUGH);

        return enabled;
    },

};
