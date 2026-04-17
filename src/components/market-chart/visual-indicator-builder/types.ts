import type { ParsedIndicator } from '../../strategy-studio/visual-builder/kuriSourceParser';

export interface IndicatorInstance {
    id: string;
    name: string;           // user-editable, auto-suffixed: "SMA", "SMA 2"
    shortname: string;      // "SMA", "Custom"
    kuriSource: string;
    parsed: ParsedIndicator;
    paramValues: Record<string, any>;
}

export interface FormulaToken {
    kind: 'operand' | 'operator';
    value: string;
    valueNum?: number;
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
    int: 'Whole Number',
    float: 'Decimal Number',
    bool: 'Yes / No Toggle',
    string: 'Text Choice',
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
