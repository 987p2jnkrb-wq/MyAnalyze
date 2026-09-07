import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: [
      'node_modules/**',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
    },
    rules: {
      'no-unused-vars': 'warn',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
];