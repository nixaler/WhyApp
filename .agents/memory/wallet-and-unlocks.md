---
name: Wallet, feedback incentive, and paid unlocks
description: The money mechanics feature — earning $0.10 for feedback, paying $1/$2 to unlock likes/rejections. What's real money vs. ledger-only right now, and why.
---

## Status: ledger-only, no real payment processor wired up
Everything here runs on an internal balance (`users.wallet_balance_cents` + `wallet_transactions`
ledger). There is no Stripe (or other processor) integration yet — no way to actually charge a
card or actually pay out cash. This was a deliberate phased decision, not an oversight:
- Charging real money for unlocks is the easy half (standard Stripe Checkout) but wasn't built
  yet either — build it when ready to accept real payments.
- Paying real money out is the hard half — needs Stripe Connect (or similar), per-payee KYC,
  and eventually 1099 reporting. Not worth that compliance lift before the mechanic is proven.

**Graduate from ledger to real payouts once BOTH:**
1. Unlock revenue has run 30+ days and stays net-positive after covering that period's accrued
   ledger liability.
2. Total accrued-but-uncashed ledger balance across all users exceeds $500 — real demand to
   cash out, not just engagement with a number going up.

## Schema
Migration: `artifacts/api-server/migrations/001_wallet_and_unlocks.sql` — **not yet run against
the live database**. This repo has no other migration history for the WHY tables (see
why-app-arch.md — they were created directly against Replit's Postgres, outside Drizzle), so this
had to be written from scratch. Idempotent (`IF NOT EXISTS`), safe to re-run.

- `users.wallet_balance_cents` — cached balance, kept in sync by `services/wallet.ts`.
- `wallet_transactions` — immutable ledger, source of truth. Unique index on
  `reference_id WHERE type='feedback_reward'` prevents double-paying the same feedback submission.
- `unlocks` — one row per purchased reveal (`kind`: 'likes' | 'rejections'). `covers_up_to` is a
  snapshot cutoff — the unlock shows what existed as of purchase; anything after needs a new one.
- `payout_requests` — cash-out requests. `status` is updated by hand until real payout rails exist.

## Feedback reward ($0.10)
- Batch trigger threshold (how many left-swipes a candidate needs before swipers get asked for
  feedback) is gender-dependent: **20 for a woman candidate, 15 for a man**, default 15 for
  anything else. See `FEEDBACK_BATCH_THRESHOLD` in `swipes.ts`.
- Regardless of batch size, only `FEEDBACK_PROMPTS_PER_BATCH` (5) swipers get prompted+paid per
  batch — caps payout exposure per candidate instead of scaling with total dislikes. This was a
  deliberate cost-control decision, not the literal reading of "everyone in the batch gets paid."
- Reward only pays when: moderation passes AND the submitter's account is 24+ hours old AND the
  reason is 15+ characters. All three are anti-farming/anti-low-effort-spam guards.
- `creditWallet()` in `services/wallet.ts` is idempotent per feedback id — safe to retry.

## Paid unlocks ($1 likes / $2 rejections)
- "Who liked you" ($1, `POST /unlocks/likes`): Premium users get this free & live always (existing
  behavior). Non-premium can buy a one-off snapshot. `GET /swipes/likes` returns `newer_count` so
  the UI can prompt "N new likes since your last unlock."
- **"Who rejected you" is deliberately NOT an identity reveal.** `GET /swipes/dislikes` never
  returns name, photo, or user id — only age, gender, city, and any feedback text they gave.
  This was a explicit trust & safety call: revealing who rejected someone enables exactly the kind
  of unwanted-contact/retaliation risk that gets dating apps in real trouble. If this constraint
  ever gets revisited, treat it as a genuine safety decision to re-litigate, not a cosmetic one.
- Both unlocks debit the wallet balance via `debitWallet()`. If a user's balance is insufficient,
  they get a clear 402 error explaining real checkout isn't wired up yet — not a silent failure.

## Logo
The app mark (two mirrored "?" hooks forming a heart, dot at the bottom point) lives as
`ICON.logo` in `why-app/index.html`, used on the welcome screen, the match-celebration modal, and
as the favicon (data-URI SVG in `<head>`). Fill-based (not stroke), gold via `currentColor`, so it
stays legible at small sizes.
