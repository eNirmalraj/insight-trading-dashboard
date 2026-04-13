// backend/server/src/engine/strategyLoader.ts
// Reads .kuri files from backend/server/src/strategies/, parses yaml frontmatter,
// extracts param schema from param.*() calls, computes template_version hash,
// and upserts into the Supabase scripts table.
//
// Runs ONCE at backend startup via worker.ts.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import yaml from 'js-yaml';
import { v5 as uuidv5 } from 'uuid';
import { supabaseAdmin } from '../services/supabaseAdmin';

// Fixed namespace UUID so built-in string ids deterministically map to uuids
// for the scripts table (whose `id` column is uuid).
const BUILTIN_STRATEGY_NAMESPACE = '9b1e7a5c-4d3b-4f2e-8a11-0f4a9e7c2b10';

/** Deterministic uuid derived from a built-in strategy string id. */
export function builtinStrategyUuid(stringId: string): string {
    return uuidv5(stringId, BUILTIN_STRATEGY_NAMESPACE);
}

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
    category: string;
    kuriSource: string;
    templateVersion: string;
    paramSchema: ParamDef[];
}

const STRATEGIES_DIR = path.resolve(__dirname, '../strategies');

function parseFrontmatter(source: string): Record<string, any> {
    const match = source.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    try {
        const parsed = yaml.load(match[1]);
        return typeof parsed === 'object' && parsed ? (parsed as Record<string, any>) : {};
    } catch (err: any) {
        console.warn(`[StrategyLoader] Failed to parse frontmatter: ${err.message}`);
        return {};
    }
}

function extractParamSchema(source: string): ParamDef[] {
    const params: ParamDef[] = [];
    const lines = source.split('\n');
    const paramRegex = /^\s*(\w+)\s*=\s*param\.(int|float|bool|string|source)\s*\(([^)]*)\)/;
    for (const line of lines) {
        const m = line.match(paramRegex);
        if (!m) continue;
        const [, id, type, argsRaw] = m;
        const args = argsRaw.trim();
        const defaultMatch = args.match(/^([^,]+)/);
        const defaultValue = defaultMatch ? parseLiteral(defaultMatch[1].trim()) : null;
        const titleMatch = args.match(/title\s*=\s*"([^"]*)"/);
        const minMatch   = args.match(/min\s*=\s*([\d.-]+)/);
        const maxMatch   = args.match(/max\s*=\s*([\d.-]+)/);
        const stepMatch  = args.match(/step\s*=\s*([\d.-]+)/);
        params.push({
            id,
            type: type as ParamDef['type'],
            default: defaultValue,
            title: titleMatch ? titleMatch[1] : id,
            min: minMatch ? Number(minMatch[1]) : undefined,
            max: maxMatch ? Number(maxMatch[1]) : undefined,
            step: stepMatch ? Number(stepMatch[1]) : undefined,
        });
    }
    return params;
}

function parseLiteral(s: string): any {
    s = s.trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'close' || s === 'open' || s === 'high' || s === 'low') return s;
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
    }
    return s;
}

function computeTemplateVersion(source: string): string {
    return crypto.createHash('sha256').update(source).digest('hex').slice(0, 8);
}

export function loadStrategyMetas(): BuiltInStrategyMeta[] {
    try {
        const files = fs.readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith('.kuri'));
        const metas: BuiltInStrategyMeta[] = [];
        for (const file of files) {
            const source = fs.readFileSync(path.join(STRATEGIES_DIR, file), 'utf-8');
            const fm = parseFrontmatter(source);
            if (fm.type !== 'strategy') continue;
            if (!fm.id || !fm.name) {
                console.warn(`[StrategyLoader] Skipping ${file}: missing id or name in frontmatter`);
                continue;
            }
            metas.push({
                id: String(fm.id),
                name: String(fm.name),
                description: String(fm.description || ''),
                category: String(fm.category || 'Trend Following'),
                kuriSource: source,
                templateVersion: computeTemplateVersion(source),
                paramSchema: extractParamSchema(source),
            });
        }
        console.log(`[StrategyLoader] Loaded ${metas.length} built-in strategies`);
        return metas;
    } catch (err) {
        console.error('[StrategyLoader] Failed to load .kuri files:', err);
        return [];
    }
}

export async function syncToDatabase(): Promise<void> {
    const metas = loadStrategyMetas();
    for (const meta of metas) {
        const { error } = await supabaseAdmin.from('scripts').upsert(
            {
                id: builtinStrategyUuid(meta.id),
                user_id: null,
                name: meta.name,
                description: meta.description,
                source_code: meta.kuriSource,
                script_type: 'STRATEGY',
                is_active: true,
                is_builtin: true,
                template_version: meta.templateVersion,
                param_schema: meta.paramSchema,
                configuration: { category: meta.category },
            },
            { onConflict: 'id' }
        );
        if (error) {
            console.error(`[StrategyLoader] Failed to upsert ${meta.id}:`, error.message);
            continue;
        }
    }
    console.log(`[StrategyLoader] Synced ${metas.length} built-in strategies to scripts table`);
}

// Back-compat export: readers that only need the in-memory meta list can use this.
export const STRATEGY_REGISTRY: BuiltInStrategyMeta[] = loadStrategyMetas();

/** Look up a built-in strategy by ID */
export function getBuiltInStrategy(id: string): BuiltInStrategyMeta | undefined {
    return STRATEGY_REGISTRY.find((s) => s.id === id);
}
