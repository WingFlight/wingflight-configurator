export const Mixer = {

    PWM_SERVO_COUNT: 8,
    BUS_SERVO_OFFSET: 8,

    inputNames: [
        'mixerInputNone',
        'mixerInputStabilizedRoll',
        'mixerInputStabilizedPitch',
        'mixerInputStabilizedYaw',
        'mixerInputStabilizedThrottle',
        'mixerInputRCCommandRoll',
        'mixerInputRCCommandPitch',
        'mixerInputRCCommandYaw',
        'mixerInputRCCommandThrottle',
        'mixerInputRCChannelRoll',
        'mixerInputRCChannelPitch',
        'mixerInputRCChannelYaw',
        'mixerInputRCChannelThrottle',
        'mixerInputRCChannelAux1',
        'mixerInputRCChannelAux2',
        'mixerInputRCChannelAux3',
        'mixerInputRCChannel8',
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
        'mixerInputStabilizedTVRoll',
        'mixerInputStabilizedTVPitch',
        'mixerInputStabilizedTVYaw',
    ],

    heliOnlyInputs: [],

    // mixerInputRCChannelRoll is inputNames[9] -- Pitch/Yaw/Throttle follow
    // at 10-12. These "bypass" inputs read the RC input for that logical
    // axis *after* the firmware's rcmap indirection (rx.c's rcChannel[]),
    // so "Roll" is whatever physical channel the pilot's radio has mapped to
    // it -- there's no fixed "Roll = CH1" answer (AETR vs TAER vs custom
    // maps all differ). MSP_RX_MAP (FC.RC_MAP) reports that mapping in the
    // same Roll/Pitch/Yaw/Throttle order, so resolving the real channel just
    // means indexing it with inputIndex - RC_CHANNEL_BYPASS_FIRST.
    RC_CHANNEL_BYPASS_FIRST: 9,
    RC_CHANNEL_BYPASS_ROLES: [
        'controlAxisRoll',
        'controlAxisPitch',
        'controlAxisYaw',
        'controlAxisThrottle',
    ],

    // Label for an inputNames[] entry, resolving the RC Roll/Pitch/Yaw/
    // Throttle bypass inputs to the pilot's actual physical channel (e.g.
    // "CH #3 (Roll)") when rcMap (FC.RC_MAP, from MSP_RX_MAP) is available.
    // Falls back to the plain function name otherwise.
    inputLabel: function (index, i18n, rcMap) {
        const roleIndex = index - this.RC_CHANNEL_BYPASS_FIRST;
        if (roleIndex >= 0 && roleIndex < this.RC_CHANNEL_BYPASS_ROLES.length &&
            rcMap && rcMap.length > roleIndex) {
            const channel = rcMap[roleIndex] + 1;
            const role = i18n.getMessage(this.RC_CHANNEL_BYPASS_ROLES[roleIndex]);
            return `CH #${channel} (${role})`;
        }

        return i18n.getMessage(this.inputNames[index]);
    },

    // Last index of the "raw numbered channel" run -- inputNames[13..26]
    // are CH #5..#18 (channel = index - 8), immediately after the bypass
    // Roll/Pitch/Yaw/Throttle run (9-12) resolved above.
    RC_CHANNEL_RANGE_LAST: 26,

    // Physical channel number (1-based) for an inputNames[] index in the
    // combined bypass-Roll/Pitch/Yaw/Throttle + raw-CH#5-18 run, or
    // undefined if it can't be determined (a bypass index without a loaded
    // rcMap, or an index outside that run entirely).
    rcChannelNumber: function (index, rcMap) {
        const roleIndex = index - this.RC_CHANNEL_BYPASS_FIRST;
        if (roleIndex >= 0 && roleIndex < this.RC_CHANNEL_BYPASS_ROLES.length) {
            return rcMap && rcMap.length > roleIndex ? rcMap[roleIndex] + 1 : undefined;
        }
        if (index > this.RC_CHANNEL_BYPASS_FIRST + this.RC_CHANNEL_BYPASS_ROLES.length - 1 &&
            index <= this.RC_CHANNEL_RANGE_LAST) {
            return index - 8;
        }
        return undefined;
    },

    // Full {value,label} input-option list, in *display* order. Same wire
    // values as inputNames, but once rcMap resolves the bypass Roll/Pitch/
    // Yaw/Throttle channels, the whole bypass+CH#5-18 run (9-26) is
    // re-sorted into ascending physical-channel order -- otherwise a
    // non-AETR radio would show e.g. "CH #2 (Roll)" ahead of "CH #1
    // (Throttle)", then jump straight to "CH #5" right after, which reads
    // as out of order even though every value is correct. Falls back to
    // plain wire-value order (bypass group by function, then CH#5-18) when
    // rcMap hasn't loaded yet, since there's nothing to sort by then.
    buildInputOptions: function (i18n, rcMap) {
        const options = this.inputNames.map((_key, i) => ({
            value: i,
            label: this.inputLabel(i, i18n, rcMap),
        }));

        const first = this.RC_CHANNEL_BYPASS_FIRST;
        const last = this.RC_CHANNEL_RANGE_LAST;
        const slice = options.slice(first, last + 1);
        const channels = slice.map((_opt, i) => this.rcChannelNumber(first + i, rcMap));
        if (channels.every((c) => c != null)) {
            slice
                .map((opt, i) => [channels[i], opt])
                .sort((a, b) => a[0] - b[0])
                .forEach(([, opt], pos) => { options[first + pos] = opt; });
        }

        return options;
    },

    SERVO_OUTPUT_COUNT: 26,
    MOTOR_OUTPUT_COUNT: 4,
    MOTOR_OUTPUT_OFFSET: 27,

    outputNames: [
        'mixerOutputNone',
        ...Array.from({ length: 26 }, (_, i) => `mixerOutputServo${i + 1}`),
        ...Array.from({ length: 4 }, (_, i) => `mixerOutputMotor${i + 1}`),
    ],

    outputLabel: function (index, i18n) {
        if (index === 0) {
            return i18n.getMessage(this.outputNames[index]);
        }

        if (index >= 1 && index <= this.SERVO_OUTPUT_COUNT) {
            const servoNumber = index;
            if (servoNumber <= this.PWM_SERVO_COUNT) {
                return `PWM Servo #${servoNumber}`;
            }

            const busServoNumber = servoNumber - this.BUS_SERVO_OFFSET;
            return `Bus Servo #${busServoNumber}`;
        }

        return i18n.getMessage(this.outputNames[index]);
    },

    operNames: [
        'mixerRuleNOP',
        'mixerRuleSet',
        'mixerRuleAdd',
        'mixerRuleMul',
    ],

    OP_NUL: 0,
    OP_SET: 1,
    OP_ADD: 2,
    OP_MUL: 3,

    // Descriptive tag only -- the firmware mixer evaluator never reads it.
    // Lets tooling (this UI, RC adjustment ranges, LUA scripts) find "the"
    // rule serving a given role regardless of its array position.
    roleNames: [
        'mixerRoleNone',
        'mixerRoleFlapCompensation',
        'mixerRoleDifferentialThrustYaw',
    ],

    ROLE_NONE: 0,
    ROLE_FLAP_COMPENSATION: 1,
    ROLE_DIFFERENTIAL_THRUST_YAW: 2,

    UNINIT: -1,

    RULE_COUNT: 32,

    SPEED_MIN: 0,
    SPEED_MAX: 60000,

    // Weight/weightNeg are signed on the wire (their sign is the rule's only
    // notion of polarity now that firmware no longer has a separate reverse
    // bit), but the GUI only ever asks for a magnitude here -- polarity comes
    // from the Reverse checkbox instead. Firmware allows magnitudes up to
    // MIXER_WEIGHT_MIN/MAX (10000), but that's a 10x gain on a PWM/RX-driven
    // rule -- never a deliberate choice in practice, just a typo. Cap the GUI
    // well below that.
    WEIGHT_MIN: 0,
    WEIGHT_MAX: 5000,

    // Matches firmware's MIXER_INPUT_MIN/MAX.
    OFFSET_MIN: -2500,
    OFFSET_MAX:  2500,

    // Matches firmware's MIXER_OVERRIDE_MIN/MAX/OFF (flight/mixer.h). Values
    // in range are a forced mixer input (raw units, /1000 on the wire);
    // OFF restores normal RC/mixing control of that input.
    OVERRIDE_MIN: -2500,
    OVERRIDE_MAX:  2500,
    OVERRIDE_OFF:  2501,

    overrideEnabled: function (value)
    {
        return value >= Mixer.OVERRIDE_MIN && value <= Mixer.OVERRIDE_MAX;
    },

    //// Functions

    nullRule: function ()
    {
        return { oper: 0, src: 0, dst: 0, weight: 0, weightNeg: 0, offset: 0, speed: 0, curve: 0, condition: 0, role: 0 };
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
                a.speed     === b.speed &&
                a.curve     === b.curve &&
                a.condition === b.condition &&
                a.role      === b.role );
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

    //// Model types
    //
    // Mirrors mixerConfig_t.model_type in firmware (pg/mixer.h) -- purely
    // descriptive there, but here it also drives which simplified sub-options
    // the Mixer tab shows and what those sub-options mean in terms of
    // buildWizardRules' {layout, ailerons, tailControl, wingYaw} option
    // shape. Every type but CUSTOM exposes flaps/motors/diffThrustYaw
    // identically (see SimplifiedMixerForm.svelte), so those aren't modeled
    // here. Each of ailerons/tailControl/wingYaw is either omitted (not
    // applicable to this layout), `{ fixed }` (forced, no control shown), or
    // `{ options, default }` (user picks from a Select).

    MODEL_TYPE_REGULAR_AIRPLANE: 0,
    MODEL_TYPE_FLYING_WING: 1,
    MODEL_TYPE_V_TAIL_AIRPLANE: 2,
    MODEL_TYPE_DELTA_WING: 3,
    MODEL_TYPE_RUDDER_ELEVATOR_TRAINER: 4,
    MODEL_TYPE_CUSTOM: 5,

    MODEL_TYPES: [
        {
            value: 0,
            key: 'REGULAR_AIRPLANE',
            labelKey: 'mixerModelTypeRegularAirplane',
            images: ['conventional_shape', 'conventional_aileron', 'conventional_normal_tail'],
            layout: 'conventional',
            ailerons: { options: ['none', 'single', 'independent'], default: 'independent' },
            tailControl: { options: ['elevatorOnly', 'elevatorRudder'], default: 'elevatorRudder' },
        },
        {
            value: 1,
            key: 'FLYING_WING',
            labelKey: 'mixerModelTypeFlyingWing',
            images: ['flying_wing_shape', 'flying_wing_aileron'],
            layout: 'flyingWing',
            wingYaw: { options: ['none', 'rudder'], default: 'rudder' },
        },
        {
            value: 2,
            key: 'V_TAIL_AIRPLANE',
            labelKey: 'mixerModelTypeVTailAirplane',
            images: ['conventional_shape', 'conventional_aileron', 'conventional_v_tail'],
            layout: 'conventional',
            ailerons: { options: ['none', 'single', 'independent'], default: 'independent' },
            tailControl: { fixed: 'vtail' },
        },
        {
            value: 3,
            key: 'DELTA_WING',
            labelKey: 'mixerModelTypeDeltaWing',
            // No distinct delta-wing silhouette asset exists yet -- reuses
            // flying-wing art (the elevon rule generation is identical).
            // Cosmetic approximation until dedicated art is added.
            images: ['flying_wing_shape', 'flying_wing_aileron'],
            layout: 'flyingWing',
            wingYaw: { options: ['none', 'rudder'], default: 'rudder' },
        },
        {
            value: 4,
            key: 'RUDDER_ELEVATOR_TRAINER',
            labelKey: 'mixerModelTypeRudderElevatorTrainer',
            images: ['conventional_shape', 'conventional_normal_tail'],
            layout: 'conventional',
            ailerons: { fixed: 'none' },
            tailControl: { fixed: 'elevatorRudder' },
        },
        {
            value: 5,
            key: 'CUSTOM',
            labelKey: 'mixerModelTypeCustom',
            images: [],
        },
    ],

    modelTypeInfo: function (value)
    {
        return Mixer.MODEL_TYPES.find((t) => t.value === value) || Mixer.MODEL_TYPES[0];
    },

    // Shared by the Custom-mode wizard dialog and the named-model-type
    // simplified form -- both stage a freshly generated rule set into a
    // rule table padded/truncated to match the currently loaded rule count.
    buildRuleTableFromOptions: function (options, currentRules)
    {
        const generatedRules = Mixer.buildWizardRules(options);
        const ruleCount = (currentRules && currentRules.length) || Mixer.RULE_COUNT;
        const nextRules = Array.from({ length: ruleCount }, () => Mixer.nullRule());

        generatedRules.forEach((rule, index) => {
            if (index < nextRules.length) {
                nextRules[index] = rule;
            }
        });

        return nextRules;
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
        let nextMotor = Mixer.MOTOR_OUTPUT_OFFSET;
        // Every output that ends up carrying pitch, across whichever layout
        // ran below -- the flap compensation rule(s) further down ADD onto
        // all of these, since a flap-induced pitching moment shows up on
        // every pitch-controlling surface (both v-tail halves, both
        // elevons, ...), not just a single named "elevator" servo.
        const pitchOutputs = [];

        function rule(oper, src, dst, weight, reverse, role)
        {
            const w = reverse ? -weight : weight;
            return { oper, src, dst, offset: 0, weight: w, weightNeg: w, speed: 0, curve: 0, condition: 0, role: role || 0 };
        }

        const OP_SET = Mixer.OP_SET, OP_ADD = Mixer.OP_ADD;
        const ROLL = 1, PITCH = 2, YAW = 3, THROTTLE = 4, RC_AUX1 = 13;
        // MIXER_IN_STABILIZED_TV_ROLL/PITCH/YAW -- appended at the tail of
        // firmware's MIXER_IN_* enum (pg/mixer.h), after RC_CHANNEL_18.
        const TV_ROLL = 27, TV_PITCH = 28, TV_YAW = 29;

        if (options.layout === 'conventional') {
            if (options.ailerons === 'single') {
                rules.push(rule(OP_SET, ROLL, nextServo++, 1000));
            } else if (options.ailerons === 'independent') {
                rules.push(rule(OP_SET, ROLL, nextServo++, 1000));
                rules.push(rule(OP_SET, ROLL, nextServo++, 1000, true));
            }

            if (options.tailControl === 'elevatorOnly') {
                const elevator = nextServo++;
                rules.push(rule(OP_SET, PITCH, elevator, 1000));
                pitchOutputs.push(elevator);
            } else if (options.tailControl === 'elevatorRudder') {
                const elevator = nextServo++;
                rules.push(rule(OP_SET, PITCH, elevator, 1000));
                pitchOutputs.push(elevator);
                rules.push(rule(OP_SET, YAW,   nextServo++, 1000));
            } else if (options.tailControl === 'vtail') {
                const rightTail = nextServo++, leftTail = nextServo++;
                rules.push(rule(OP_SET, YAW,   rightTail, 1000));
                rules.push(rule(OP_ADD, PITCH, rightTail, 1000));
                rules.push(rule(OP_SET, YAW,   leftTail, 1000, true));
                rules.push(rule(OP_ADD, PITCH, leftTail, 1000));
                pitchOutputs.push(rightTail, leftTail);
            }
        } else if (options.layout === 'flyingWing') {
            const leftElevon = nextServo++, rightElevon = nextServo++;
            rules.push(rule(OP_SET, PITCH, leftElevon, 1000));
            rules.push(rule(OP_ADD, ROLL,  leftElevon, 1000));
            rules.push(rule(OP_SET, PITCH, rightElevon, 1000));
            rules.push(rule(OP_ADD, ROLL,  rightElevon, 1000, true));
            pitchOutputs.push(leftElevon, rightElevon);

            if (options.wingYaw === 'rudder') {
                rules.push(rule(OP_SET, YAW, nextServo++, 1000));
            }
        }

        if (options.flaps) {
            rules.push(rule(OP_SET, RC_AUX1, nextServo++, 1000));
            if (options.flapServos >= 2) {
                rules.push(rule(OP_SET, RC_AUX1, nextServo++, 1000));
            }

            // Flap-induced pitching moment otherwise gets silently absorbed
            // by the rate loop's I-term until it saturates at low airspeed
            // during the flare -- see the flap-compensation writeup. Starts
            // at zero weight (a placeholder to tune in, not a guessed
            // default) and is tagged so it stays findable regardless of
            // where it ends up in the table.
            pitchOutputs.forEach((output) => {
                rules.push(rule(OP_ADD, RC_AUX1, output, 0, false, Mixer.ROLE_FLAP_COMPENSATION));
            });
        }

        let motor1;
        if (options.motors >= 1) {
            motor1 = nextMotor++;
            rules.push(rule(OP_SET, THROTTLE, motor1, 1000));
        }
        if (options.motors >= 2) {
            const motor2 = nextMotor;
            rules.push(rule(OP_SET, THROTTLE, motor2, 1000));

            if (options.diffThrustYaw) {
                rules.push(rule(OP_ADD, YAW, motor1, 500, false, Mixer.ROLE_DIFFERENTIAL_THRUST_YAW));
                rules.push(rule(OP_ADD, YAW, motor2, 500, true,  Mixer.ROLE_DIFFERENTIAL_THRUST_YAW));
            }
        }

        // Thrust vectoring mounts vary -- 2-axis gimbals (commonly pitch+yaw,
        // but roll+yaw and others exist too), single-axis, or full 3-axis --
        // so each axis is wired independently rather than assuming a fixed
        // combination.
        if (options.thrustVectorRoll) {
            rules.push(rule(OP_SET, TV_ROLL, nextServo++, 1000));
        }
        if (options.thrustVectorPitch) {
            rules.push(rule(OP_SET, TV_PITCH, nextServo++, 1000));
        }
        if (options.thrustVectorYaw) {
            rules.push(rule(OP_SET, TV_YAW, nextServo, 1000));
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
                a.speed     == 0 &&
                a.curve     == 0 &&
                a.condition == 0 &&
                a.role      == 0 );
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
        return Object.assign({}, orig);
    },

};
