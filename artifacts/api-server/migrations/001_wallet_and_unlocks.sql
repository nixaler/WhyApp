-- Wallet, unlocks, and payout requests for the feedback-incentive + paid-reveal features.
--
-- This repo has no prior migration history for the WHY tables (they were created
-- directly against Replit's Postgres, outside of Drizzle — see
-- .agents/memory/why-app-arch.md). This file is written to be safe to run once
-- against that same database: every statement is idempotent (IF NOT EXISTS /
-- ON CONFLICT), so re-running it is harmless.
--
-- Run it with psql against your DATABASE_URL, or paste it into Replit's SQL tool:
--   psql "$DATABASE_URL" -f artifacts/api-server/migrations/001_wallet_and_unlocks.sql

BEGIN;

-- Every user has a spendable balance, in integer cents (never float — avoids rounding bugs).
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance_cents INTEGER NOT NULL DEFAULT 0;

-- Immutable ledger of every balance change. The source of truth — users.wallet_balance_cents
-- is a cached sum of this table, kept in sync by the application (see wallet.ts).
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL, -- positive = credit (earned), negative = debit (spent/paid out)
  type VARCHAR(32) NOT NULL, -- 'feedback_reward' | 'unlock_purchase' | 'payout_request' | 'adjustment'
  reference_id UUID, -- feedback.id, unlocks.id, or payout_requests.id depending on type
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON wallet_transactions(user_id, created_at DESC);

-- One feedback reward per feedback submission, ever — prevents double-crediting on retries/bugs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_feedback_reward
  ON wallet_transactions(reference_id) WHERE type = 'feedback_reward';

-- Paid one-off reveals: "who liked you" ($1) and "who rejected you" ($2, anonymized).
-- Each purchase is a snapshot — it covers activity up to `covers_up_to`; anything after
-- that needs a new unlock (matches how these are sold: a look at what exists *now*).
CREATE TABLE IF NOT EXISTS unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL, -- 'likes' | 'rejections'
  price_cents INTEGER NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  covers_up_to TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_unlocks_user_kind ON unlocks(user_id, kind, purchased_at DESC);

-- Cash-out requests against the ledger. Recorded now; actually paying these out requires
-- real payout rails (Stripe Connect + KYC) that aren't wired up yet — see
-- .agents/memory/wallet-and-unlocks.md for the graduation criteria. Until then this is
-- fulfilled manually and `status` updated by hand.
CREATE TABLE IF NOT EXISTS payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'rejected'
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status, requested_at);

COMMIT;
