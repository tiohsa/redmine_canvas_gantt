import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: process.env.NODE_ENV === 'production' ? '/plugin_assets/redmine_canvas_gantt/build/' : '/',
  build: {
    outDir: '../build',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: './src/main.tsx',
    },
  },
  server: {
    origin: 'http://localhost:5173',
  }
})
