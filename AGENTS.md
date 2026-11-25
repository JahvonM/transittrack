# AGENTS.md

## Project Context

This app was first built on Base44 and now runs on Supabase, with the site on Cloudflare. Base44 is switched off and no longer syncs with this repository. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for how the app runs, local setup and how changes go live.

## Key Files

- `docs/DATA-MODEL.md`: map of the database. Every table and field, how records link, and who can see what. Read it before changing data or access rules. It is generated: after changing `base44/entities/*` or `base44/functions/entityAccess`, run `node tools/data-model.mjs` (a test fails until you do).
- `src/`: frontend application source.
- `src/api/backend.supabase.js`: the app's connection to Supabase (sign-in and server functions). The rest of the app reaches it through `src/api/base44Client.js`; the name is from Base44.
- `base44/functions/`, `base44/shared/`: the server functions' source. `node tools/supabase/build-functions.mjs` writes the copies Supabase runs into `supabase/functions/`; edit `base44/`, not the copies.
- `vite.config.js`: Vite config.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- `npm run dev` runs the app against the live Supabase project: real data.
- Changes go live by merging to `main`: Cloudflare builds the site, and the "Supabase functions" workflow deploys the functions.
- Reuse the existing client (`src/api/base44Client.js`) and its patterns before adding new ways to reach the backend.
- Run the relevant checks from `package.json` before finishing code changes.
