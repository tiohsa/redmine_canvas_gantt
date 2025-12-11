/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Ensure relative paths for assets
  build: {
    manifest: true,
    outDir: '../assets/build',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/main.tsx',
    },
  },
  server: {
    origin: 'http://localhost:5173',
    cors: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
})
