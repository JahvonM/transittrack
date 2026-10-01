import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Lists every file in the build so the service worker (public/sw.js) can
// save them all and the app opens with no WiFi.
function offlineManifest() {
  return {
    name: 'tt-offline-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html');
      this.emitFile({ type: 'asset', fileName: 'offline-manifest.json', source: JSON.stringify({ built: new Date().toISOString(), files }) });
    },
  };
}

// Build stamp shown in Admin → Fleet health, so you can see which tablets
// are still running an older version.
const APP_BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ');

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify(APP_BUILD) },
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
    offlineManifest(),
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
