import type { ParsedIndicator } from '../../strategy-studio/visual-builder/kuriSourceParser';

export interface IndicatorInstance {
    id: string;
    name: string;           // user-editable, auto-suffixed: "SMA", "SMA 2"
    shortname: string;      // "SMA", "Custom"
    kuriSource: string;
    parsed: ParsedIndicator;
    paramValues: Record<string, any>;
}

export type MatchOp = '==' | '<' | '<=' | '>' | '>=' | '!=';

export interface MatchCase {
    op?: MatchOp;   // comparison operator (default '==')
    when: string;   // input value to match (string or number as string)
    then: string;   // output value (string or number as string)
}

export interface FormulaToken {
    kind: 'operand' | 'operator';
    value: string;
    valueNum?: number;
    // For "match" operand: map a parameter's value to an output
    matchParam?: string;       // variable name of parameter to match against
    matchCases?: MatchCase[];
    matchDefault?: string;     // fallback when no case matches
    matchOutputType?: 'string' | 'number';  // whether outputs are strings or numbers
}

export interface Formula {
    id: string;
    name: string;           // referenceable: "BA", "upper", "spread"
    tokens: FormulaToken[];
}

export type PlotKind = 'line' | 'level' | 'histogram' | 'area' | 'marker';

export interface PlotDef {
    id: string;
    formulaId: string;
    title: string;
    kind: PlotKind;
    color: string;
    lineStyle: 'solid' | 'dashed' | 'dotted';
    width: number;
    markerLocation?: 'above' | 'below';
    // User-input linking — if set, use that param variable instead of the literal
    visibilityParam?: string;  // bool param — plot only shows when this is true
    widthParam?: string;       // int param — line width
}

export interface AlertRow {
    id: string;
    title: string;
    message: string;
    condition: FormulaToken[];
}

export type ParamType = 'int' | 'float' | 'bool' | 'string';

export interface ParameterDef {
    id: string;
    varName: string;            // identifier used in code: "sensitivity", "openType"
    title: string;              // shown to user: "Sensitivity", "Open Type"
    type: ParamType;
    defaultValue: any;
    min?: number;               // for int/float
    max?: number;               // for int/float
    options?: string[];         // for choice lists: ["Auto","Gap","Flat"] or ["10","20"]
    tooltip?: string;           // help text shown on hover — supports \n for line breaks
}

// Friendly labels for param types (shown in dropdown)
export const PARAM_TYPE_LABELS: Record<ParamType, string> = {
    int: 'Number — e.g. 14, 20, 50',
    float: 'Decimal — e.g. 0.5, 1.25, 2.75',
    bool: 'On / Off Switch',
    string: 'Choice from list — e.g. Auto, Gap, Flat',
};

export const PARAM_TYPE_DESCRIPTIONS: Record<ParamType, string> = {
    int: 'A whole number the user can adjust. Use for period lengths, counts, bar counts, multipliers (where decimals don\'t matter).',
    float: 'A decimal number the user can adjust. Use for multipliers, percentages, sensitivity, fine-tuned values.',
    bool: 'An On/Off switch. Use for "show labels?", "show history?", "enable alerts?" — anywhere the user turns something on or off.',
    string: 'A dropdown where user picks one option from a list you define. Use for period choices (Daily/Weekly), open type (Gap/Flat), modes, etc.',
};

export interface IndicatorModel {
    info: { name: string; shortname: string; overlay: boolean };
    parameters: ParameterDef[];
    indicators: IndicatorInstance[];
    formulas: Formula[];
    plots: PlotDef[];
    alerts: AlertRow[];
}

export const createEmptyModel = (): IndicatorModel => ({
    info: { name: 'My Indicator', shortname: 'MI', overlay: true },
    parameters: [],
    indicators: [],
    formulas: [],
    plots: [],
    alerts: [],
});

export const OPERATOR_LIBRARY = [
    { label: 'is above (>)', op: '>' },
    { label: 'is below (<)', op: '<' },
    { label: '>= (greater or equal)', op: '>=' },
    { label: '<= (less or equal)', op: '<=' },
    { label: '== (equals)', op: '==' },
    { label: '!= (not equals)', op: '!=' },
    { label: '+ (plus)', op: '+' },
    { label: '- (minus)', op: '-' },
    { label: 'x (times)', op: '*' },
    { label: '/ (divided by)', op: '/' },
    { label: 'AND', op: 'and' },
    { label: 'OR', op: 'or' },
] as const;
