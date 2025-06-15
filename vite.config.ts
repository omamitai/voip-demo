// --- File: vite.config.ts ---
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // --- ADD THIS SECTION START ---
  define: {
    global: 'window',
  },
  // --- ADD THIS SECTION END ---
  server: {
    // This proxy is for development only, to forward WebSocket requests to your backend server.
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})
