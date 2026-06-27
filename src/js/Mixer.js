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

    // Collective is a helicopter cyclic/collective-pitch concept inherited from
    // this firmware's Rotorflight lineage; it has no meaning on a fixed-wing
    // airframe. The underlying values still exist (firmware keeps them at
    // zero-rate by default), but they're never offered as a mixer input choice.
    heliOnlyInputs: [4, 9, 14],

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

    //// Functions

    nullRule: function ()
    {
        return { oper: 0, src: 0, dst: 0, weight: 0, weightNeg: 0, offset: 0, reverse: 0, speed: 0, curve: 0, condition: 0 };
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
                a.speed     === b.speed &&
                a.curve     === b.curve &&
                a.condition === b.condition );
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

    //// Mixer setup wizard
    //
    // Composes a starting rule set from a handful of orthogonal airframe
    // choices, rather than picking from a flat list of named presets. The
    // result is a starting point loaded into the editable rule table — not
    // applied directly. Servo/motor numbers and directions are typically
    // still adjusted by the user afterwards to match their airframe.

    buildWizardRules : function (options)
    {
        const rules = [];
        let nextServo = 1;
        let nextMotor = 9;

        function rule(oper, src, dst, weight, weightNeg)
        {
            return { oper, src, dst, offset: 0, weight,
                      weightNeg: (weightNeg === undefined ? weight : weightNeg),
                      reverse: 0, speed: 0, curve: 0, condition: 0 };
        }

        const OP_SET = Mixer.OP_SET, OP_ADD = Mixer.OP_ADD;
        const ROLL = 1, PITCH = 2, YAW = 3, RC_THROTTLE = 15, RC_AUX1 = 16;

        if (options.layout === 'conventional') {
            if (options.ailerons === 'single') {
                rules.push(rule(OP_SET, ROLL, nextServo++, 1000));
            } else if (options.ailerons === 'independent') {
                rules.push(rule(OP_SET, ROLL, nextServo++, 1000));
                rules.push(rule(OP_SET, ROLL, nextServo++, -1000));
            }

            if (options.tailControl === 'elevatorOnly') {
                rules.push(rule(OP_SET, PITCH, nextServo++, 1000));
            } else if (options.tailControl === 'elevatorRudder') {
                rules.push(rule(OP_SET, PITCH, nextServo++, 1000));
                rules.push(rule(OP_SET, YAW,   nextServo++, 1000));
            } else if (options.tailControl === 'vtail') {
                const rightTail = nextServo++, leftTail = nextServo++;
                rules.push(rule(OP_SET, YAW,   rightTail, 1000));
                rules.push(rule(OP_ADD, PITCH, rightTail, 1000));
                rules.push(rule(OP_SET, YAW,   leftTail, -1000));
                rules.push(rule(OP_ADD, PITCH, leftTail, 1000));
            }
        } else if (options.layout === 'flyingWing') {
            const leftElevon = nextServo++, rightElevon = nextServo++;
            rules.push(rule(OP_SET, PITCH, leftElevon, 1000));
            rules.push(rule(OP_ADD, ROLL,  leftElevon, 1000));
            rules.push(rule(OP_SET, PITCH, rightElevon, 1000));
            rules.push(rule(OP_ADD, ROLL,  rightElevon, -1000));

            if (options.wingYaw === 'rudder') {
                rules.push(rule(OP_SET, YAW, nextServo++, 1000));
            }
        }

        if (options.flaps) {
            rules.push(rule(OP_SET, RC_AUX1, nextServo, 1000));
        }

        if (options.motors >= 1) {
            rules.push(rule(OP_SET, RC_THROTTLE, nextMotor++, 1000));
        }
        if (options.motors >= 2) {
            const motor2 = nextMotor;
            rules.push(rule(OP_SET, RC_THROTTLE, motor2, 1000));

            if (options.diffThrustYaw) {
                rules.push(rule(OP_ADD, YAW, 9,      500, 500));
                rules.push(rule(OP_ADD, YAW, motor2, -500, -500));
            }
        }

        return rules;
    },

    isNullRule : function (a) {
        return( a.oper      == 0 &&
                a.src       == 0 &&
                a.dst       == 0 &&
                a.weight    == 0 &&
                a.weightNeg == 0 &&
                a.offset    == 0 &&
                a.reverse   == 0 &&
                a.speed     == 0 &&
                a.curve     == 0 &&
                a.condition == 0 );
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
