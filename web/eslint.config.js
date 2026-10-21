import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// regra de dependência da arquitetura hexagonal: domain não conhece ninguém, application só conhece o
// domain e as próprias portas. Quem quebrar isso derruba o lint (e o CI)
const react = { regex: '^react(-dom)?(/|$)', message: 'React só entra no adapter de UI' }
const adapters = { regex: '(^|/)adapters(/|$)', message: 'adapter só é ligado na raiz de composição (main.tsx)' }
const layer = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
  'no-restricted-globals': ['error', 'navigator', 'window', 'document'],
})

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx,js}'],
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: layer([react, adapters, { regex: '(^|/)application(/|$)', message: 'domain não depende da application' }]),
  },
  {
    files: ['src/application/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: layer([react, adapters]),
  },
  {
    // a UI fala com o mouse só pelos casos de uso; WebHID e demo chegam pela raiz de composição
    files: ['src/adapters/ui/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { regex: '(^|/)(demo|webhid)/', message: 'a UI recebe o canal pronto da raiz de composição' },
          { regex: '(^|/)application/mouseLink$', message: 'a UI só chama os casos de uso' },
        ],
      }],
    },
  },
  {
    // nos testes e helpers de teste o índice existe por construção, o `!` só poupa um if
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'e2e/**'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
)
