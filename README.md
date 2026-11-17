# McSween Transport (TransitTrack)

The staff-transport app behind app.mcsweenstransport.com: passengers, drivers,
bus tablets, the boarding kiosk and Admin.

It was first built on Base44 and moved to Supabase in October 2026. Base44 was
switched off in November 2026: its copy is unpublished and no longer syncs with
this repository. The record of the move is `docs/SWITCH-TO-SUPABASE.md`.

## How it runs

- **Website and app:** the `transittrack` Cloudflare Worker serves
  app.mcsweenstransport.com and mcsweenstransport.com. Cloudflare builds `main`
  with `npm run build:supabase` (settings in `cloudflare/wrangler.jsonc`).
- **Backend:** Supabase. The database, sign-in (Supabase Auth), file storage
  and the server functions (Edge Functions).
- **Installed apps:** the tablet and phone app (`android/`, `capacitor.config.json`)
  and the Windows desktop app (`desktop/`) open app.mcsweenstransport.com.

## Where the code is

- `src/`: the app. `src/api/backend.supabase.js` is its connection to Supabase;
  the rest of the app reaches it through `src/api/base44Client.js` (the name is
  from Base44).
- `base44/functions/` and `base44/shared/`: the server functions' source. The
  folder kept its old name. `node tools/supabase/build-functions.mjs` writes the
  copies Supabase runs into `supabase/functions/`; edit `base44/`, not the copies.
- `base44/entities/`: the data model's source; `docs/DATA-MODEL.md` is generated
  from it (`node tools/data-model.mjs`).
- `supabase/migrations/`: the database.

## Going live

Merge to `main`:

- Cloudflare builds and publishes the site.
- The "Supabase functions" workflow checks the function copies and deploys every
  function, when `base44/functions`, `base44/shared` or the copies change.

## Run it locally

```bash
npm install
npm run dev
```

`npm run dev` talks to the **live** Supabase project, so anything you change
there changes real data.

## Checks

```bash
npm run lint
npm test                        # unit tests
npm run test:security:release   # security tests
npm run test:e2e                # browser tests (builds first; see e2e/README.md)
```

The browser tests never reach Supabase: they build the app pointed at `/api` on
its own address and answer every request themselves.
