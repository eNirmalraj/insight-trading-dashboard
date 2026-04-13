/**
 * Strategy Registry (frontend view).
 *
 * Auto-discovers .kuri strategy files from backend/server/src/strategies/ and
 * parses their yaml frontmatter + param.*() schema. Strategies live with the
 * backend because that's what runs them; the frontend reads them only for the
 * Strategy Studio's "Open Script → Built-in" tab and for per-assignment param
 * form rendering.
 *
 * To add a new strategy:
 *   1. Create a new `.kuri` file in `backend/server/src/strategies/`
 *   2. Add frontmatter: id, name, description, category, type: strategy
 *   3. Both Signal Engine and Strategy Studio pick it up automatically
 */

import yaml from 'js-yaml';

export type StrategyCategory = 'Trend Following' | 'Momentum' | 'Breakout' | 'Mean Reversion';

export interface ParamDef {
    id: string;
    type: 'int' | 'float' | 'bool' | 'string' | 'source';
    default: any;
    title?: string;
    min?: number;
    max?: number;
    step?: number;
}

export interface BuiltInStrategyMeta {
    id: string;
    name: string;
    description: string;
    category: StrategyCategory;
    kuriSource: string;
    paramSchema: ParamDef[];
}

// ─── Frontmatter parser ──────────────────────────────────────────

function parseFrontmatter(source: string): Record<string, any> {
    const match = source.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    try {
        const parsed = yaml.load(match[1]);
        return typeof parsed === 'object' && parsed ? (parsed as Record<string, any>) : {};
    } catch {
        return {};
    }
}

// ─── param.*() extractor ─────────────────────────────────────────

function extractParamSchema(source: string): ParamDef[] {
    const params: ParamDef[] = [];
    const paramRegex = /^\s*(\w+)\s*=\s*param\.(int|float|bool|string|source)\s*\(([^)]*)\)/;
    for (const line of source.split('\n')) {
        const m = line.match(paramRegex);
        if (!m) continue;
        const [, id, type, argsRaw] = m;
        const args = argsRaw.trim();
        const first = args.split(',')[0].trim();
        let defaultValue: any;
        if (type === 'bool') defaultValue = first === 'true';
        else if (type === 'int' || type === 'float') defaultValue = Number(first);
        else defaultValue = first.replace(/^["']|["']$/g, '');

        const titleM = args.match(/title\s*=\s*"([^"]*)"/);
        const minM = args.match(/min\s*=\s*([\d.-]+)/);
        const maxM = args.match(/max\s*=\s*([\d.-]+)/);
        const stepM = args.match(/step\s*=\s*([\d.-]+)/);

        params.push({
            id,
            type: type as ParamDef['type'],
            default: defaultValue,
            title: titleM ? titleM[1] : id,
            min: minM ? Number(minM[1]) : undefined,
            max: maxM ? Number(maxM[1]) : undefined,
            step: stepM ? Number(stepM[1]) : undefined,
        });
    }
    return params;
}

// ─── Registry (auto-discovered via Vite glob) ────────────────────

const kuriModules = import.meta.glob(
    '../../backend/server/src/strategies/*.kuri',
    { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

export const STRATEGY_REGISTRY: BuiltInStrategyMeta[] = Object.entries(kuriModules)
    .map(([, source]) => {
        const fm = parseFrontmatter(source);
        if (fm.type !== 'strategy') return null;
        if (!fm.id || !fm.name) return null;
        return {
            id: String(fm.id),
            name: String(fm.name),
            description: String(fm.description || ''),
            category: (fm.category || 'Trend Following') as StrategyCategory,
            kuriSource: source,
            paramSchema: extractParamSchema(source),
        } as BuiltInStrategyMeta;
    })
    .filter((s): s is BuiltInStrategyMeta => s !== null);

// ─── Lookup helpers ──────────────────────────────────────────────

export function getBuiltInStrategy(id: string): BuiltInStrategyMeta | undefined {
    return STRATEGY_REGISTRY.find((s) => s.id === id);
}

export function getStrategiesByCategory(category: StrategyCategory): BuiltInStrategyMeta[] {
    return STRATEGY_REGISTRY.filter((s) => s.category === category);
}

export const STRATEGY_CATEGORIES: StrategyCategory[] = [
    'Trend Following',
    'Momentum',
    'Breakout',
    'Mean Reversion',
];
