---
name: WHY upload URL convention
description: How uploaded file URLs are constructed and served — a previous bug fixed this.
---

## Rule
All photo/file upload URLs returned by API routes must use the prefix `/api/uploads/<filename>`.

The Express static middleware in `app.ts` must be mounted at `/api/uploads`:
```ts
app.use("/api/uploads", express.static(uploadsDir));
```

## Why
The api-server artifact is served at proxy path `/api`. The browser requests `/api/uploads/filename`, which the proxy forwards to the api-server as `GET /api/uploads/filename`. If the static middleware is at `/uploads` only, this path never matches → 404 for all media.

## How to apply
When adding any new file upload feature:
1. Route handler returns URL as `/api/uploads/${filename}`.
2. Static middleware stays at `/api/uploads` in `app.ts`.
3. Do NOT use `/uploads/` prefix alone or prefix-less paths.
