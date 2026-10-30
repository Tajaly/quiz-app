import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '.deploy/**',
    '**/node_modules/**',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
    '.azure/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: [
      'apps/server/**/*.ts',
      'packages/**/*.ts',
      'e2e/**/*.ts',
      'scripts/**/*.{js,mjs}',
      '*.{js,mjs,ts}',
      'apps/*/*.{js,mjs,ts}',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
]);
