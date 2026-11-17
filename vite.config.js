import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// The app runs on Supabase (src/api/backend.supabase.js). The browser tests
// (`--mode e2e`) build it the same way but point it at /api on the page's own
// address, where every test answers for the server, so a request a test didn't
// plan for never leaves the machine.
const E2E_SUPABASE_URL = '/api'

// Build stamp shown in Admin → Fleet health, so you can see which tablets
// are still running an older version. Also written into offline-manifest.json
// so a tablet can tell a newer version has been published.
const APP_BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ');

// Lists every file in the build so the service worker (public/sw.js) can
// save them all and the app opens with no WiFi. Written once the build is on
// disk, from the files actually there: listed any earlier, a chunk renamed
// late in the build (mapbox-gl) was listed under a name that never existed,
// and the service worker can only switch to a version once every listed file
// has been saved.
export function offlineFiles(bundle, dir, exists = existsSync) {
  return Object.keys(bundle)
    .filter((f) => !f.endsWith('.map') && f !== 'index.html' && f !== 'offline-manifest.json')
    .filter((f) => exists(join(dir, f)))
}
function offlineManifest() {
  return {
    name: 'tt-offline-manifest',
    apply: 'build',
    writeBundle: {
      order: 'post',
      handler(options, bundle) {
        const files = offlineFiles(bundle, options.dir)
        writeFileSync(join(options.dir, 'offline-manifest.json'), JSON.stringify({ built: new Date().toISOString(), build: APP_BUILD, files }))
      },
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_BUILD__: JSON.stringify(APP_BUILD),
    ...(mode === 'e2e' ? { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(E2E_SUPABASE_URL) } : {}),
  },
  resolve: {
    alias: {
      'tt-backend': fileURLToPath(new URL('./src/api/backend.supabase.js', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    offlineManifest(),
  ],
}));
