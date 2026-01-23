import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Load env vars from .env files
  const env = loadEnv(mode, process.cwd(), '')

  return {
    test: {
      globals: false,
      environment: 'node',
      env,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
