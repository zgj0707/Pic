import js from '@eslint/js'
import ts from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  importPlugin.flatConfigs?.recommended ?? {},
  {
    files: ['electron/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: true
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
      'import/no-unresolved': 'off',
      'import/no-duplicates': 'off',
      'import/no-named-as-default-member': 'off'
    }
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off'
    }
  },
  {
    ignores: ['dist-app/', 'dist-pkg*/', 'node_modules/', 'public/vendor/', 'database/']
  }
)
