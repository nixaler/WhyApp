import { Router } from "express";
import { query } from "../config/database";
import { authenticate, AuthRequest } from "../middleware/auth";
import { debitWallet } from "../services/wallet";

const router = Router();

const MIN_PAYOUT_CENTS = 1000; // $10 — see .agents/memory/wallet-and-unlocks.md

// GET /wallet — balance + recent ledger entries
router.get("/", authenticate, async (req: AuthRequest, res: any) => {
  const { rows: txRows } = await query(
    `SELECT id, amount_cents, type, description, created_at FROM wallet_transactions
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  const { rows: pendingRows } = await query(
    `SELECT id, amount_cents, status, requested_at FROM payout_requests
     WHERE user_id = $1 AND status = 'pending' ORDER BY requested_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.json({
    balance_cents: req.user.wallet_balance_cents,
    transactions: txRows,
    pending_payout: pendingRows[0] || null,
    min_payout_cents: MIN_PAYOUT_CENTS,
  });
});

// POST /wallet/payout-request — cash out the full current balance.
// Recorded now; actually paying it out is manual until real payout rails (Stripe Connect + KYC)
// are wired up — see .agents/memory/wallet-and-unlocks.md for the graduation criteria.
router.post("/payout-request", authenticate, async (req: AuthRequest, res: any) => {
  const { rows: pending } = await query(
    `SELECT id FROM payout_requests WHERE user_id = $1 AND status = 'pending'`,
    [req.user.id]
  );
  if (pending.length)
    return res.status(409).json({ error: "You already have a pending payout request" });

  const balance = req.user.wallet_balance_cents;
  if (balance < MIN_PAYOUT_CENTS)
    return res.status(400).json({
      error: `Minimum payout is $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}, you have $${(balance / 100).toFixed(2)}`,
    });

  const result = await debitWallet(req.user.id, balance, "payout_request", {
    description: "Payout requested",
  });
  if (!result.ok) return res.status(409).json({ error: "Balance changed, try again" });

  const { rows } = await query(
    `INSERT INTO payout_requests (user_id, amount_cents) VALUES ($1,$2) RETURNING *`,
    [req.user.id, balance]
  );
  res.status(201).json({ payout_request: rows[0], balance_cents: result.balance_cents });
});

export default router;
