import js from '@eslint/js';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  { files: ['**/*.js', '**/*.jsx'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } }, globals: { process: 'readonly', Buffer: 'readonly', console: 'readonly', document: 'readonly', fetch: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', queueMicrotask: 'readonly', AbortController: 'readonly', URL: 'readonly' } }, rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
];
