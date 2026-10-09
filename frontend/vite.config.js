import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The FastAPI service runs on 8000; /api is proxied so the browser only ever
// talks to one origin in development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
