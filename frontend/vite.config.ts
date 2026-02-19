import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import pkg from './package.json'

export default defineConfig({
  plugins: [react()],
  // Use relative base for Electron compatibility
  base: process.env.ELECTRON_START_URL ? '/' : './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
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
    'process.env': {},
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version)
  },
  optimizeDeps: {
    include: [
      'monaco-editor/esm/vs/editor/editor.api',
      'monaco-editor/esm/vs/basic-languages/yaml/yaml',
      'monaco-editor/esm/vs/basic-languages/markdown/markdown',
      'monaco-editor/esm/vs/base/browser/ui/list/listWidget',
      '@prompd/cli/providers'  // Browser-compatible: types + KNOWN_PROVIDERS (CJS→ESM pre-bundle)
    ],
    exclude: [
      '@prompd/cli'  // Exclude main export (executor requires Node.js, goes via IPC in Electron)
      // Note: Subpath exports (@prompd/cli/providers, /parser, /types, /validator) are browser-compatible
    ]
  },
  build: {
    commonjsOptions: {
      // Default only processes node_modules/. Since @prompd/cli is file-linked
      // (outside node_modules), we must include it for CJS→ESM conversion.
      include: [/node_modules/, /prompd-cli\/cli\/npm\/dist/]
    },
    rollupOptions: {
      external: (id: string) => {
        // Externalize the main @prompd/cli entry (Node.js only, uses IPC in Electron)
        // but NOT subpath exports like /providers, /parser, /types, /validator (browser-compatible)
        return id === '@prompd/cli'
      },
      output: {
        manualChunks: {
          monaco: ['monaco-editor']
        }
      }
    }
  }
})
