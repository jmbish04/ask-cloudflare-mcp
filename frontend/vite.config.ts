import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    cloudflare()
  ],
  build: {
    outDir: '../public',
    emptyOutDir: true
  },
  define: {
    'import.meta.env.VITE_WORKER_URL': JSON.stringify(process.env.WORKER_URL || 'https://ask-cloudflare-mcp.hacolby.workers.dev')
  }
})
