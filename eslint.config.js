// Flat config for the whole workspace. App-specific React rules live in apps/web/eslint.config.js
// only if they need browser globals; the shared rules are here.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'backend/pb_data/**',
      'backend/pb_public/**',
      'backend/bin/**',
      'backend/pb_migrations/**',
      'backend/pb_hooks/**',
      'apps/web/src/data/pb-types.ts',
      'apps/web/playwright-report/**',
      'apps/web/test-results/**',
      'apps/web/dev-dist/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // The domain package must stay pure (PLAN.md §7.3, §11.2).
    files: ['packages/domain/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-*', 'pocketbase', '@srt/web', '@srt/backend'] },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'The domain package is deterministic: take time as input.',
        },
        { object: 'Math', property: 'random', message: 'The domain package is deterministic.' },
      ],
    },
  },
  prettier,
);
