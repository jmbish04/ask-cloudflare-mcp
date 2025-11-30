import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: '../public',
    emptyOutDir: true
  },
  define: {
    'import.meta.env.VITE_WORKER_URL': JSON.stringify(process.env.WORKER_URL || 'https://ask-cloudflare-mcp.hacolby.workers.dev')
  }
})
