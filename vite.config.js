import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

// `vite build --mode supabase` (npm run build:supabase) builds the app for its
// own hosting on Supabase + Cloudflare; the normal build stays on Base44.
// `tt-backend` is the one switch: src/api/backend.base44.js or backend.supabase.js.
const backendFor = (mode) => fileURLToPath(new URL(mode === 'supabase' ? './src/api/backend.supabase.js' : './src/api/backend.base44.js', import.meta.url))

// The switch for the whole app (step 7): base44/shared/liveBackend.ts. When it
// says 'supabase', the build Base44 hosts (the one the tablets, phone app and
// desktop app open) talks to Supabase too.
export function liveBackend(source = readFileSync(new URL('./base44/shared/liveBackend.ts', import.meta.url), 'utf8')) {
  const m = source.match(/^export const LIVE_BACKEND: Backend = '(base44|supabase)';$/m)
  if (!m) throw new Error('base44/shared/liveBackend.ts: LIVE_BACKEND line not found')
  return m[1]
}
const backendMode = (mode) => (mode === 'supabase' || liveBackend() === 'supabase' ? 'supabase' : 'base44')

// Build stamp shown in Admin → Fleet health, so you can see which tablets
// are still running an older version. Also written into offline-manifest.json
// so a tablet can tell a newer version has been published.
const APP_BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ');

// Lists every file in the build so the service worker (public/sw.js) can
// save them all and the app opens with no WiFi.
function offlineManifest() {
  return {
    name: 'tt-offline-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html');
      this.emitFile({ type: 'asset', fileName: 'offline-manifest.json', source: JSON.stringify({ built: new Date().toISOString(), build: APP_BUILD, files }) });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: { __APP_BUILD__: JSON.stringify(APP_BUILD) },
  resolve: {
    alias: {
      'tt-backend': backendFor(backendMode(mode)),
      // The Base44 plugin provides @/ itself; the Supabase build leaves that plugin out.
      ...(mode === 'supabase' ? { '@': fileURLToPath(new URL('./src', import.meta.url)) } : {}),
    },
  },
  plugins: [
    ...(mode === 'supabase' ? [] : [base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    })]),
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
}));
