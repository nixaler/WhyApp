---
name: WHY app architecture
description: Architecture decisions for the WHY dating app — artifact layout, DB approach, auth, optional services.
---

## Artifact layout
- `artifacts/api-server` — Express 5 + TypeScript ESM backend, preview path `/api`. All WHY routes mounted under `app.use("/api", router)`.
- `artifacts/why-app` — Vite artifact at preview path `/`, serving a single-file vanilla HTML/JS app (no React). `index.html` is self-contained with inline CSS + JS.

## Database
- Replit built-in PostgreSQL via `DATABASE_URL`. Raw `pg` Pool in `artifacts/api-server/src/config/database.ts`.
- No Drizzle for WHY routes — plain parameterised queries only.
- Schema tables: users, photos, preset_prompts, user_prompts, verification_codes, swipes, left_swipe_counters, matches, messages, feedback_requests, feedback, feedback_replies, boosts, blocks, push_tokens.
- `matches` table enforces `user1_id < user2_id` (UUID alphabetical order).

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

## Socket.io
- HTTP server wraps Express app in `index.ts`; Socket.io attached to HTTP server.
- `setupChat(io)` in `socket/chat.ts` handles JWT handshake auth, join_match, send_message, typing events.
- typing event verifies match membership before broadcasting (auth gap fix).

**Why raw pg over Drizzle:** WHY routes were added after initial scaffold; keeping them isolated avoids schema migration conflicts with existing Drizzle setup.
