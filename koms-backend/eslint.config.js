export default [
  {
    ignores: ['node_modules/**'],
  },
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {},
  },
];
