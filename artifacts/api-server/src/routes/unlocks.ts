import { Router } from "express";
import { query } from "../config/database";
import { authenticate, AuthRequest } from "../middleware/auth";
import { debitWallet } from "../services/wallet";

const router = Router();

const UNLOCK_PRICES_CENTS: Record<"likes" | "rejections", number> = {
  likes: 100,
  rejections: 200,
};

// POST /unlocks/:kind — spend wallet balance to unlock a snapshot of "who liked you" (kind=likes)
// or the anonymized "who rejected you" (kind=rejections). Only pays out of the user's earned
// ledger balance for now — there's no real-money checkout wired up yet (no Stripe keys configured).
// A user with $0 balance gets a clear error telling them so, not a silent failure.
router.post("/:kind", authenticate, async (req: AuthRequest, res: any) => {
  const kind = req.params.kind as "likes" | "rejections";
  if (kind !== "likes" && kind !== "rejections")
    return res.status(400).json({ error: "kind must be 'likes' or 'rejections'" });

  const price = UNLOCK_PRICES_CENTS[kind];
  const result = await debitWallet(req.user.id, price, "unlock_purchase", {
    description: `Unlock: ${kind}`,
  });
  if (!result.ok) {
    return res.status(402).json({
      error: `Not enough balance to unlock ${kind}. Needs $${(price / 100).toFixed(2)}, you have $${(result.balance_cents / 100).toFixed(2)}. Real card checkout isn't set up yet — earn balance via feedback for now.`,
      balance_cents: result.balance_cents,
      price_cents: price,
    });
  }

  const { rows } = await query(
    `INSERT INTO unlocks (user_id, kind, price_cents, covers_up_to) VALUES ($1,$2,$3,NOW()) RETURNING *`,
    [req.user.id, kind, price]
  );
  res.status(201).json({ unlock: rows[0], balance_cents: result.balance_cents });
});

export default router;
