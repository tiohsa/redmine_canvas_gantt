import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/plugin_assets/redmine_canvas_gantt/build/' : '/',
  build: {
    manifest: true,
    outDir: '../../build', // Output to plugins/redmine_canvas_gantt/assets/build
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/main.tsx',
    },
  },
  server: {
    origin: 'http://localhost:5173',
    cors: true,
  },
})
