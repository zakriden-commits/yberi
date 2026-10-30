import globals from 'globals';
export default [
  { ignores: ['www/vendor/**'] },
  {
    files: ['www/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'use-isnan': 'error',
      'no-func-assign': 'error',
      'no-unsafe-negation': 'error',
    },
  },
];
