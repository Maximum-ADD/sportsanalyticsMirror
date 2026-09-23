/// <reference types="vitest/config" />
import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The API requires an API key or a signed-in session on its data
  // endpoints. The dev proxy attaches this server-held key to /api
  // requests that don't bring their own, so signed-out local browsing
  // keeps working. Read here in the config only — never exposed to the
  // client bundle, so it must not carry a VITE_ prefix.
  const siteProxyApiKey = loadEnv(mode, process.cwd(), '').SITE_PROXY_API_KEY?.trim()

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      // `npm run test:cov` writes its HTML coverage report into
      // ./coverage inside this project root. Without this ignore, every
      // report file registers as a change and vite fires a full-page reload
      // per file (~200) at every open browser tab.
      watch: {
        ignored: ['**/coverage/**'],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          // Mirror of the production proxy's SITE_PROXY_API_KEY injection
          // (functions/api/[[path]].ts): a caller's own X-API-Key wins.
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              if (siteProxyApiKey && !req.headers['x-api-key']) {
                proxyReq.setHeader('x-api-key', siteProxyApiKey)
              }
            })
          },
        },
        // Mirrors production's same-origin proxy (functions/auth/[[path]].ts)
        // so both environments exercise the same code path in authClient.ts.
        '/auth': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      testTimeout: 30_000,
      reporters: ['default', 'json'],
      outputFile: { json: './test-report.json' },
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'json-summary', 'json', 'cobertura'],
        reportsDirectory: 'coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/main.tsx',
          'src/vite-env.d.ts',
          'src/components/ui/**',
          'src/**/*.{test,spec}.{ts,tsx}',
          'src/test/**',
          // Ambient type declarations only — no runtime statements to cover,
          // so v8 reports a meaningless 0% instead of leaving the file out.
          'src/types/**',
        ],
        // Enforced in CI (see .gitea/workflows/ci.yml) so a coverage drop
        // fails the build instead of silently shipping. Set at the project's
        // 80% target with the actual numbers well clear of it, not at the
        // ceiling of what's currently covered.
        thresholds: {
          lines: 80,
          statements: 80,
          functions: 80,
          branches: 80,
        },
      },
    },
  }
})
