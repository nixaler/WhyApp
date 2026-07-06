import { Router } from "express";
import { query } from "../config/database";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /boosts/status
router.get("/status", authenticate, async (req: AuthRequest, res: any) => {
  const { rows: activeBoost } = await query(
    "SELECT * FROM boosts WHERE user_id = $1 AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1",
    [req.user.id]
  );
  res.json({
    boosts_remaining: req.user.boosts_remaining,
    active_boost: activeBoost[0] || null,
  });
});

// POST /boosts/activate
router.post("/activate", authenticate, async (req: AuthRequest, res: any) => {
  if (req.user.boosts_remaining <= 0)
    return res.status(400).json({ error: "No boosts remaining" });

  // Check no active boost
  const { rows: active } = await query(
    "SELECT 1 FROM boosts WHERE user_id = $1 AND expires_at > NOW()",
    [req.user.id]
  );
  if (active.length)
    return res.status(400).json({ error: "Already have an active boost" });

  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60 * 1000);

  const { rows } = await query(
    `INSERT INTO boosts (user_id, activated_at, expires_at, duration_min) VALUES ($1,$2,$3,30) RETURNING *`,
    [req.user.id, now, expires]
  );

  await query(
    "UPDATE users SET boosts_remaining = boosts_remaining - 1 WHERE id = $1",
    [req.user.id]
  );

  res.json({ boost: rows[0] });
});

export default router;
