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

export interface IndicatorModel {
    info: { name: string; shortname: string; overlay: boolean };
    indicators: IndicatorInstance[];
    formulas: Formula[];
    plots: PlotDef[];
    alerts: AlertRow[];
}

export const createEmptyModel = (): IndicatorModel => ({
    info: { name: 'My Indicator', shortname: 'MI', overlay: true },
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
