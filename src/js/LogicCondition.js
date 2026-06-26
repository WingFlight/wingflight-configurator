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
    ],

    OPERAND_TYPE_VALUE: 0,
    OPERAND_TYPE_RC_CHANNEL: 1,
    OPERAND_TYPE_FLIGHT_MODE: 2,
    OPERAND_TYPE_CONDITION: 3,

    operandTypeNames: [
        'logicOperandTypeValue',
        'logicOperandTypeChannel',
        'logicOperandTypeMode',
        'logicOperandTypeCondition',
    ],

    //// Functions

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
