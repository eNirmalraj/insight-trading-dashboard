import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'backend/**',
            'packages/**/dist/**',
            'packages/**/__tests__/**',
            '**/*.config.js',
            '**/*.config.ts',
            'vite.config.ts',
            '*.md',
        ],
    },
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            parser: tsparser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
            'react-hooks': reactHooks,
        },
        rules: {
            // TypeScript
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            '@typescript-eslint/no-non-null-assertion': 'warn',

            // React Hooks
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            // General
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-debugger': 'warn',
            'prefer-const': 'warn',
            'no-var': 'error',
            eqeqeq: ['error', 'always'],
        },
    },
    {
        // 🎯 INDICATOR PURITY ENFORCEMENT
        // These rules prevent strategy logic from being added to indicator files
        files: ['src/core/implementations/typescript/**/*.ts'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'MemberExpression[object.name="strategy"]',
                    message:
                        '❌ FORBIDDEN: Strategy calls are not allowed in indicator files. Indicators must be pure functions that only calculate values. Move trading logic to Kuri strategy scripts. See src/core/implementations/INDICATOR_RULES.md for details.',
                },
                {
                    selector: 'CallExpression[callee.object.name="strategy"]',
                    message:
                        '❌ FORBIDDEN: Strategy function calls (strategy.entry, strategy.exit, etc.) are not allowed in indicator files. Indicators must be pure calculation functions. See INDICATOR_RULES.md for guidance.',
                },
                {
                    selector: 'CallExpression[callee.name=/^(entry|exit|close)$/]',
                    message:
                        '❌ FORBIDDEN: Trading action functions (entry, exit, close) are not allowed in indicator files. Keep indicators pure - move trading decisions to strategy scripts.',
                },
                {
                    selector: 'Identifier[name="buy"]',
                    message:
                        '⚠️  WARNING: Usage of "buy" identifier detected. If this is a trading signal/action, it should be in a strategy script, not an indicator. Indicators should only return calculated values.',
                },
                {
                    selector: 'Identifier[name="sell"]',
                    message:
                        '⚠️  WARNING: Usage of "sell" identifier detected. If this is a trading signal/action, it should be in a strategy script, not an indicator. Indicators should only return calculated values.',
                },
            ],
            'no-restricted-globals': [
                'error',
                {
                    name: 'fetch',
                    message:
                        '❌ FORBIDDEN: External API calls (fetch) are not allowed in indicators. Indicators must be pure functions with no side effects.',
                },
                {
                    name: 'XMLHttpRequest',
                    message:
                        '❌ FORBIDDEN: External HTTP requests are not allowed in indicators. Indicators must be pure functions.',
                },
            ],
            'no-console': ['error'],
        },
    },
];
