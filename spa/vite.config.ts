/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './', // Ensure relative paths for assets
  build: {
    manifest: true,
    outDir: '../assets/build',
    emptyOutDir: true,
    rolldownOptions: {
      input: 'src/main.tsx',
    },
  },
  server: {
    // Playwright serves on a separate port; font asset URLs must use that origin.
    origin: mode === 'e2e' ? 'http://127.0.0.1:4173' : 'http://localhost:5173',
    cors: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
}))
