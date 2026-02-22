import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  define: {
    'import.meta.env.VITE_BACKEND_HOST': JSON.stringify('http://localhost:3010'),
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api'),
    'import.meta.env.VITE_REGISTRY_URL': JSON.stringify(''),
    'import.meta.env.DEV': JSON.stringify(true),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify('0.0.0-test'),
    'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(''),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
  }
})
