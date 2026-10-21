/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serve o projeto em /attackshark-x11-linux/
  base: '/attackshark-x11-linux/',
  plugins: [react()],
  // 5173/4173 ficam livres pra outros projetos rodando junto
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // raiz de composição: só liga WebHID e demo no <App/>, quem passa por ela é o e2e
        'src/main.tsx',
        // só declara as portas (interfaces), não sobra nenhuma linha de JS pra medir
        'src/application/ports.ts',
        // helpers e fakes usados só pelos testes
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
      ],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
})
