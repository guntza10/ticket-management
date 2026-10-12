/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // Component tests live in this config rather than a separate vitest.config.ts
  // so they inherit the plugins and the `@/` alias. A test run that resolved
  // imports differently from the app would be testing something the app never
  // actually runs.
  test: {
    // There is no browser in a Vitest run, so the DOM has to be simulated.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Only component tests. `e2e/*.spec.ts` belongs to Playwright, which needs a
    // real browser — Vitest would pick those files up and fail on the import.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
