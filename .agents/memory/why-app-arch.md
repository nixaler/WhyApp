---
name: WHY app architecture
description: Architecture decisions for the WHY dating app — artifact layout, DB approach, auth, optional services, schema notes.
---

## Artifact layout
- `artifacts/api-server` — Express 5 + TypeScript ESM backend, preview path `/api`. All WHY routes mounted under `app.use("/api", router)`. Trust proxy set to `1` for Replit's X-Forwarded-For headers (rate limiter requires this).
- `artifacts/why-app` — Vite artifact at preview path `/`, serving a single-file vanilla HTML/JS app (no React). `index.html` is self-contained with inline CSS + JS (~1800 lines).

## Database
- Replit built-in PostgreSQL via `DATABASE_URL`. Raw `pg` Pool in `artifacts/api-server/src/config/database.ts`.
- No Drizzle for WHY routes — plain parameterised queries only.
- Schema tables: users, photos, preset_prompts, user_prompts, verification_codes, swipes, left_swipe_counters, matches, messages, feedback_requests, feedback, feedback_replies, boosts, blocks, push_tokens.
- `matches` table enforces `user1_id < user2_id` (UUID alphabetical order) + `expires_at` column (24h expiry).
- `user_prompts` table: columns are `id, user_id, prompt_text, answer, sort_order, created_at` — NOT `question`. Always alias: `prompt_text AS question`.
- Extended user fields (added in migration): `height, job_title, company, education, drinking, smoking, has_kids, wants_kids, interests (text[]), values_list (text[])`.

## Auth
- JWT signed with `JWT_SECRET` (Replit Secret — must be set). `authenticate` middleware in `middleware/auth.ts` attaches full user row to `req.user`.
- `requirePremium` middleware for premium-only endpoints.

## Optional third-party services
- SMS (Twilio): stub logs a notice when `TWILIO_ACCOUNT_SID` not set — no real code sent.
- Push (APN): stub when `APN_KEY`/`APN_KEY_ID`/`APN_TEAM_ID` not set.
- AI moderation (OpenAI): stubs to `{ passed: true }` when `OPENAI_API_KEY` not set.
- `apn` and `twilio` packages are blocked by Replit package firewall — use dynamic `require()` inside guarded conditionals; do NOT add them to package.json.

## Key business logic constants
- Free swipe limit: 50/day; premium = unlimited.
- Left-swipe feedback trigger: every 5 left-swipes (`LEFT_SWIPES_PER_FEEDBACK_BATCH = 5`).
- Curiosity score: starts 50, +1 per delivered feedback, capped at 100.
- Super like: direction='super' in swipes table; also counts as a "right" for match detection.
- Match expiry: 24 hours (`expires_at = NOW() + INTERVAL '24 hours'`).

## Socket.io
- HTTP server wraps Express app in `index.ts`; Socket.io attached to HTTP server.
- `setupChat(io)` in `socket/chat.ts` handles JWT handshake auth, join_match, send_message, typing events.
- Typing event verifies match membership before broadcasting.

## Frontend design system (index.html)
- Typography: Playfair Display (headings/logo, Google Fonts) + Inter (body)
- Colors: Gold `#C4A96B`, warm off-white bg, near-black dark mode — kept as the brand accent (client explicitly chose to keep gold over pivoting to a teal/light reference app)
- Themes: auto-detect system preference via `prefers-color-scheme`, manual toggle stored in localStorage
- 5-tab nav: Discover | Likes | WHY (?) | Matches | Profile — icons are inline SVG (`ICON` object + `icon()` helper), not emoji
- No decorative emoji anywhere in the UI. Avatar fallback (no photo) is an initials monogram on a gradient (`avatarFb()` / `userInitials()`), not a random emoji glyph — this was a deliberate redesign after client feedback that the app read as "vibe-coded"
- Full-screen photo cards with drag-to-swipe + button controls
- Profile bottom sheet (drawer) for full profile view
- Real photo upload via FormData to `/api/users/me/photos`

## Known-fixed bugs (don't reintroduce)
- `GET /users/me` returns `photos` as full row objects `{id, url, sort_order}`, NOT plain URL strings — unlike `/swipes/stack` and `/matches`, which already map to `.url` strings. Profile-tab frontend code must read `photo.url` / `photo.id`, never treat a photo entry as a string directly.
- Photo deletion is by UUID (`DELETE /users/me/photos/:id`), never by array index — the frontend must pass `photo.id`.
- `matches.ts` now returns full profile fields (`photos[]`, `bio`, `prompts`, basics) on `other_user` so `openChatProfile()` → `openSheet()` shows the real profile, not a stub with just a name.

**Why raw pg over Drizzle:** WHY routes were added after initial scaffold; keeping them isolated avoids schema migration conflicts with existing Drizzle setup.
**Why trust proxy 1:** Replit's reverse proxy sets X-Forwarded-For, and express-rate-limit v7 throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR without it.
