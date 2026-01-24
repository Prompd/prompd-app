import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Use relative base for Electron compatibility
  base: process.env.ELECTRON_START_URL ? '/' : './',
  // Serve static assets from local public folder
  publicDir: 'public',
  server: {
    host: '127.0.0.1', // Force IPv4 for Electron compatibility
    port: 5173,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true,
        secure: false
      }
    },
    hmr: {
      // Prevent full reload on WebSocket reconnection after sleep/wake
      // This helps preserve app state in Electron
      overlay: false,  // Don't show error overlay (can cause reloads)
      timeout: 60000   // Give more time to reconnect before giving up
    }
  },
  define: {
    global: 'globalThis',
    'process.env': {}
  },
  optimizeDeps: {
    include: [
      'monaco-editor/esm/vs/editor/editor.api',
      'monaco-editor/esm/vs/basic-languages/yaml/yaml',
      'monaco-editor/esm/vs/basic-languages/markdown/markdown'
    ]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor']
        }
      }
    }
  }
})
