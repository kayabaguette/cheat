import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Minimal ambient declaration so the config type-checks without @types/node
// (only VITE_API_TARGET is read here, at Vite config-load time in Node).
declare const process: { env: Record<string, string | undefined> }

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind all interfaces so the dev server is reachable when its port is
    // published from a container (bridge network, no host networking).
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        // In containerized dev the API runs in a sibling container reachable by
        // name on a shared network; override via VITE_API_TARGET (Makefile).
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
