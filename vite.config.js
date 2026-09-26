import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
  ],
  // `vite preview` only serves the static build — the SDK always calls a
  // same-origin relative `/api` (see src/api/base44Client.js's `serverUrl:
  // ''`), which the real deployed app satisfies because Base44's own hosting
  // serves both the static bundle and /api from one origin. Locally there is
  // no /api route at all, so proxy it straight to the real backend. This only
  // affects `vite preview` (used by the Playwright e2e suite) — the actual
  // deploy never runs `vite preview`, so this is inert in production.
  preview: {
    proxy: {
      '/api': {
        target: 'https://base44.app',
        changeOrigin: true,
      },
    },
  },
});
