// The web app's lint config: the workspace rules plus React's hook rules. ESLint uses the
// config nearest each file, so this one applies to everything under apps/web.
import reactHooks from 'eslint-plugin-react-hooks';
import workspace from '../../eslint.config.js';

export default [
  // Paths in the workspace ignores are relative to the repo root; restate the web ones here.
  {
    ignores: [
      'dist/**',
      'src/data/pb-types.ts',
      'playwright-report/**',
      'test-results/**',
      'dev-dist/**',
    ],
  },
  ...workspace,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest'].rules,
  },
];
