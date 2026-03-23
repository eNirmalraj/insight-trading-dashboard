// packages/kuri-engine/src/errors/errorRegistry.ts

import type { ErrorCategory, ErrorSeverity } from './kuriError';

export interface ErrorDefinition {
    code: string;
    title: string;
    description: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
}

export const ERROR_REGISTRY: Record<string, ErrorDefinition> = {
    // ── Syntax Errors (K000) ──
    K000: {
        code: 'K000',
        title: 'Syntax Error',
        description: 'The script contains a syntax error that prevents parsing.',
        category: 'syntax',
        severity: 'error',
    },

    // ── Semantic Errors (existing K001-K080) ──
    K001: {
        code: 'K001',
        title: 'Undefined Variable',
        description:
            'A variable was used before being declared. Check for typos or add a declaration.',
        category: 'semantic',
        severity: 'error',
    },
    K002: {
        code: 'K002',
        title: 'Unknown Function',
        description:
            'The function name is not recognized. Check spelling or see the Kuri function reference.',
        category: 'semantic',
        severity: 'error',
    },
    K003: {
        code: 'K003',
        title: 'Possible Typo',
        description: 'A variable or function name looks similar to a known one.',
        category: 'semantic',
        severity: 'warning',
    },
    K004: {
        code: 'K004',
        title: 'Shadowing Builtin',
        description: 'A variable name shadows a built-in variable.',
        category: 'semantic',
        severity: 'warning',
    },
    K010: {
        code: 'K010',
        title: 'Wrong Argument Count',
        description: 'Function called with wrong number of arguments.',
        category: 'semantic',
        severity: 'error',
    },
    K011: {
        code: 'K011',
        title: 'Wrong Argument Type',
        description: 'Function called with wrong argument type.',
        category: 'semantic',
        severity: 'error',
    },
    K012: {
        code: 'K012',
        title: 'Invalid Function Call',
        description: 'The expression is not callable.',
        category: 'semantic',
        severity: 'error',
    },
    K013: {
        code: 'K013',
        title: 'Missing Return Value',
        description: 'Function is missing a return statement.',
        category: 'semantic',
        severity: 'warning',
    },
    K020: {
        code: 'K020',
        title: 'Break/Continue Outside Loop',
        description: 'break or continue used outside of a for/while loop.',
        category: 'semantic',
        severity: 'error',
    },
    K030: {
        code: 'K030',
        title: 'Type Mismatch',
        description: 'Incompatible types in expression.',
        category: 'semantic',
        severity: 'error',
    },
    K031: {
        code: 'K031',
        title: 'Invalid Operator',
        description: 'Operator cannot be applied to these types.',
        category: 'semantic',
        severity: 'error',
    },
    K032: {
        code: 'K032',
        title: 'Type Incompatibility',
        description: 'Types are not compatible in this context.',
        category: 'semantic',
        severity: 'error',
    },
    K033: {
        code: 'K033',
        title: 'Series Type Error',
        description: 'Expected series type but got scalar, or vice versa.',
        category: 'semantic',
        severity: 'error',
    },
    K040: {
        code: 'K040',
        title: 'Invalid Assignment',
        description: 'Cannot assign to this target.',
        category: 'semantic',
        severity: 'error',
    },
    K041: {
        code: 'K041',
        title: 'Readonly Variable',
        description: 'Cannot assign to a read-only variable.',
        category: 'semantic',
        severity: 'error',
    },
    K042: {
        code: 'K042',
        title: 'Division by Zero',
        description: 'Dividing by a literal zero.',
        category: 'semantic',
        severity: 'warning',
    },
    K043: {
        code: 'K043',
        title: 'Invalid Operation',
        description: 'This operation is not valid in this context.',
        category: 'semantic',
        severity: 'error',
    },
    K050: {
        code: 'K050',
        title: 'Infinite Loop Risk',
        description: 'Loop condition may never be false.',
        category: 'semantic',
        severity: 'warning',
    },
    K051: {
        code: 'K051',
        title: 'Missing Loop Condition',
        description: 'Loop has no termination condition.',
        category: 'semantic',
        severity: 'error',
    },
    K052: {
        code: 'K052',
        title: 'Invalid Iterator',
        description: 'Loop iterator is not valid.',
        category: 'semantic',
        severity: 'error',
    },
    K060: {
        code: 'K060',
        title: 'Invalid Plot',
        description: 'plot() used in an invalid context.',
        category: 'semantic',
        severity: 'warning',
    },
    K061: {
        code: 'K061',
        title: 'Missing Declaration',
        description: 'Script is missing indicator() or strategy() declaration.',
        category: 'structure',
        severity: 'error',
    },
    K062: {
        code: 'K062',
        title: 'Wrong Script Type',
        description: 'Function not valid for this script type.',
        category: 'semantic',
        severity: 'error',
    },
    K063: {
        code: 'K063',
        title: 'Missing Output',
        description: 'Indicator has no plot() or drawing output.',
        category: 'structure',
        severity: 'error',
    },
    K070: {
        code: 'K070',
        title: 'NA Comparison',
        description: 'Comparing with == to na always returns false. Use na() function.',
        category: 'semantic',
        severity: 'warning',
    },
    K071: {
        code: 'K071',
        title: 'Dead Condition',
        description: 'Condition will always be true or always false.',
        category: 'semantic',
        severity: 'warning',
    },
    K080: {
        code: 'K080',
        title: 'Input Range Invalid',
        description: 'Input minval is greater than maxval, or default is out of range.',
        category: 'semantic',
        severity: 'error',
    },

    // ── Semantic Warnings (existing K100-K161) ──
    K100: {
        code: 'K100',
        title: 'Unused Input',
        description: 'An input() is declared but never referenced.',
        category: 'semantic',
        severity: 'warning',
    },
    K101: {
        code: 'K101',
        title: 'Unused Variable',
        description: 'A variable is declared but never referenced.',
        category: 'semantic',
        severity: 'warning',
    },
    K110: {
        code: 'K110',
        title: 'Multiple Declarations',
        description: 'Script type declared more than once.',
        category: 'structure',
        severity: 'error',
    },
    K120: {
        code: 'K120',
        title: 'Modifying Readonly Builtin',
        description: 'Attempting to modify a read-only built-in variable.',
        category: 'semantic',
        severity: 'error',
    },
    K121: {
        code: 'K121',
        title: 'Shadowing Builtin',
        description: 'Variable name shadows a built-in.',
        category: 'semantic',
        severity: 'warning',
    },
    K130: {
        code: 'K130',
        title: 'Duplicate Input Title',
        description: 'Two inputs share the same title string.',
        category: 'semantic',
        severity: 'warning',
    },
    K131: {
        code: 'K131',
        title: 'Input Default Out of Range',
        description: 'Input default value is outside the specified min/max range.',
        category: 'semantic',
        severity: 'warning',
    },
    K150: {
        code: 'K150',
        title: 'Deprecated Function',
        description: 'This function is deprecated. Use the suggested replacement.',
        category: 'semantic',
        severity: 'warning',
    },
    K160: {
        code: 'K160',
        title: 'Bare Strategy Entry',
        description: 'strategy.entry() called without a condition — will trade every bar.',
        category: 'semantic',
        severity: 'warning',
    },
    K161: {
        code: 'K161',
        title: 'Return Outside Function',
        description: 'return used outside of a function body.',
        category: 'semantic',
        severity: 'error',
    },

    // ── Plot Limits (existing K301-K303) ──
    K301: {
        code: 'K301',
        title: 'Too Many Plots',
        description: 'Script exceeds the 64-plot limit.',
        category: 'structure',
        severity: 'error',
    },
    K302: {
        code: 'K302',
        title: 'Approaching Plot Limit',
        description: 'Script has over 50 plots — approaching the 64-plot limit.',
        category: 'structure',
        severity: 'warning',
    },
    K303: {
        code: 'K303',
        title: 'Conditional Plot',
        description: 'plot() inside conditional may produce gaps.',
        category: 'structure',
        severity: 'warning',
    },

    // ── Strategy Errors (existing K401) ──
    K401: {
        code: 'K401',
        title: 'Unmatched Strategy Close',
        description: 'strategy.close() ID does not match any strategy.entry() ID.',
        category: 'semantic',
        severity: 'warning',
    },

    // ── Runtime Errors (NEW K500-K599) ──
    K500: {
        code: 'K500',
        title: 'Runtime Error',
        description: 'An error occurred during script execution.',
        category: 'runtime',
        severity: 'error',
    },
    K501: {
        code: 'K501',
        title: 'Runtime Division by Zero',
        description: 'Attempted to divide by zero at runtime.',
        category: 'runtime',
        severity: 'error',
    },
    K502: {
        code: 'K502',
        title: 'Index Out of Bounds',
        description: 'Array or series index is out of valid range.',
        category: 'runtime',
        severity: 'error',
    },
    K503: {
        code: 'K503',
        title: 'Null Reference',
        description: 'Attempted to access a property of na/null.',
        category: 'runtime',
        severity: 'error',
    },
    K504: {
        code: 'K504',
        title: 'Unknown Function',
        description: 'Function not found in registry at runtime.',
        category: 'runtime',
        severity: 'error',
    },
    K505: {
        code: 'K505',
        title: 'Invalid Argument',
        description: 'Function received an invalid argument at runtime.',
        category: 'runtime',
        severity: 'error',
    },
    K506: {
        code: 'K506',
        title: 'Type Error at Runtime',
        description: 'Unexpected type encountered during execution.',
        category: 'runtime',
        severity: 'error',
    },

    // ── Safety Limits (NEW K600-K699) ──
    K600: {
        code: 'K600',
        title: 'Execution Limit Exceeded',
        description: 'Script exceeded maximum allowed operations.',
        category: 'limit',
        severity: 'error',
    },
    K601: {
        code: 'K601',
        title: 'Max Operations Per Bar',
        description: 'Exceeded maximum operations per bar (10,000).',
        category: 'limit',
        severity: 'error',
    },
    K602: {
        code: 'K602',
        title: 'Max Execution Time',
        description: 'Script exceeded maximum execution time (30s).',
        category: 'limit',
        severity: 'error',
    },
    K603: {
        code: 'K603',
        title: 'Max Recursion Depth',
        description: 'Exceeded maximum recursion depth (100).',
        category: 'limit',
        severity: 'error',
    },
    K604: {
        code: 'K604',
        title: 'Max Array Length',
        description: 'Array exceeded maximum length (100,000).',
        category: 'limit',
        severity: 'error',
    },
    K605: {
        code: 'K605',
        title: 'Max Variables',
        description: 'Script exceeded maximum number of variables (1,000).',
        category: 'limit',
        severity: 'error',
    },
    K606: {
        code: 'K606',
        title: 'Max Orders',
        description: 'Script exceeded maximum orders per execution (500).',
        category: 'limit',
        severity: 'error',
    },
    K607: {
        code: 'K607',
        title: 'Script Too Large',
        description: 'Script exceeds maximum allowed size.',
        category: 'limit',
        severity: 'error',
    },
    K608: {
        code: 'K608',
        title: 'Too Many Lines',
        description: 'Script exceeds maximum line count.',
        category: 'limit',
        severity: 'error',
    },

    // ── Security (NEW K700-K799) ──
    K700: {
        code: 'K700',
        title: 'Security Violation',
        description: 'Attempted to access a restricted resource.',
        category: 'security',
        severity: 'error',
    },
    K701: {
        code: 'K701',
        title: 'Blocked Global Access',
        description: 'Attempted to access a blocked global variable.',
        category: 'security',
        severity: 'error',
    },

    // ── Type Checker Errors (NEW K800-K899) ──
    K800: {
        code: 'K800',
        title: 'Type Error',
        description: 'General type checking error.',
        category: 'type',
        severity: 'error',
    },
    K801: {
        code: 'K801',
        title: 'Boolean Expected',
        description: 'Condition expression must be boolean.',
        category: 'type',
        severity: 'error',
    },
    K802: {
        code: 'K802',
        title: 'Wrong Argument Type',
        description: 'Function argument has wrong type.',
        category: 'type',
        severity: 'error',
    },
    K803: {
        code: 'K803',
        title: 'Too Many Arguments',
        description: 'Function called with too many arguments.',
        category: 'type',
        severity: 'error',
    },
    K804: {
        code: 'K804',
        title: 'Cannot Index Type',
        description: 'Cannot use index operator on this type.',
        category: 'type',
        severity: 'error',
    },
    K805: {
        code: 'K805',
        title: 'Invalid Operand',
        description: 'Operator cannot be applied to this type.',
        category: 'type',
        severity: 'error',
    },
};

export function getErrorInfo(code: string): ErrorDefinition | undefined {
    return ERROR_REGISTRY[code];
}
