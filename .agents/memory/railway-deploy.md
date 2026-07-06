---
name: Railway deployment shape
description: How this repo is meant to run outside Replit — single-service Railway deployment, what's not portable yet.
---

## Deployment shape
- Railway runs this as **one service**, unlike Replit's two-artifact model (api-server at `/api`, why-app at `/` as separate processes behind Replit's router).
- `artifacts/api-server/src/app.ts` serves the built why-app frontend (`artifacts/why-app/dist/public`) as static files when that directory exists, falling through to `/api/*` routes otherwise. In Replit this directory never exists at runtime, so it's a no-op there — this only activates for a single-service deploy.
- Build: `pnpm install --frozen-lockfile && pnpm run build` (root — typechecks + builds every workspace package, including the frontend).
- Start: `cd artifacts/api-server && node --enable-source-maps dist/index.mjs` — must run with cwd `artifacts/api-server` because `uploadsDir` and `frontendDist` are resolved via `process.cwd()`, not `import.meta.dirname`.
- Config lives in `railway.json` at repo root. Health check: `GET /api/healthz`.
- Root `package.json` pins `engines.node` (24.x) and `packageManager` (pnpm) so Railway's Nixpacks builder picks the right toolchain via Corepack.

## Not yet portable — fix before real users depend on it
- **Uploaded photos are on local disk** (`artifacts/api-server/uploads/`, via multer diskStorage). Railway's filesystem is ephemeral — every redeploy wipes it. Needs a Railway Volume or a move to object storage (S3/R2) before this matters in production.
- **Database**: Replit's built-in Postgres does not travel with the repo. Railway needs its own Postgres addon and `DATABASE_URL`; existing Replit data needs an explicit `pg_dump`/restore if it should carry over.
- **Secrets**: `JWT_SECRET` and `DATABASE_URL` are required (app throws on boot without them — see `index.ts`). `TWILIO_ACCOUNT_SID`, `APN_KEY`/`APN_KEY_ID`/`APN_TEAM_ID`, `OPENAI_API_KEY` are optional and stub out silently when unset.

## `vite.config.ts` portability fix
`artifacts/why-app/vite.config.ts` used to throw at config-load time if `PORT`/`BASE_PATH` weren't set (Replit always sets them per-artifact). This broke `vite build` in any non-Replit environment, including CI and this Railway path. Fixed to default `BASE_PATH` to `/` and only require `PORT` for the dev/preview server, not for `build`. Don't reintroduce a hard requirement on Replit-only env vars in build-time code paths.
