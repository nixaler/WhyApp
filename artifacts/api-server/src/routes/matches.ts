import { Router } from "express";
import { query } from "../config/database";
import { authenticate, requirePremium, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /matches
router.get("/", authenticate, async (req: AuthRequest, res: any) => {
  const userId = req.user.id;
  try {
    const { rows } = await query(
      `SELECT m.*,
        CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END AS other_id
       FROM matches m
       WHERE m.user1_id = $1 OR m.user2_id = $1
       ORDER BY m.created_at DESC`,
      [userId]
    );
    const withDetails = await Promise.all(
      rows.map(async (match: any) => {
        const { rows: userRows } = await query(
          `SELECT id, name, identity_verified, last_active_at FROM users WHERE id = $1`,
          [match.other_id]
        );
        const { rows: photoRows } = await query(
          "SELECT url FROM photos WHERE user_id = $1 ORDER BY sort_order LIMIT 1",
          [match.other_id]
        );
        const { rows: lastMsgRows } = await query(
          `SELECT content, created_at FROM messages WHERE match_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [match.id]
        );
        const { rows: unreadRows } = await query(
          `SELECT COUNT(*) as cnt FROM messages WHERE match_id = $1 AND sender_id != $2 AND read_at IS NULL`,
          [match.id, userId]
        );
        const other_user = userRows[0]
          ? {
              ...userRows[0],
              photo: photoRows[0]?.url || null,
            }
          : null;
        return {
          ...match,
          other_user,
          last_message: lastMsgRows[0] || null,
          last_message_at: lastMsgRows[0]?.created_at || match.created_at,
          unread_count: parseInt(unreadRows[0].cnt),
        };
      })
    );
    res.json({ matches: withDetails });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get matches" });
  }
});

// GET /matches/likes — premium only
router.get(
  "/likes",
  authenticate,
  requirePremium,
  async (req: AuthRequest, res: any) => {
    const userId = req.user.id;
    const { rows } = await query(
      `SELECT s.swiper_id, u.name, u.identity_verified, u.last_active_at, s.created_at
       FROM swipes s
       JOIN users u ON u.id = s.swiper_id
       WHERE s.swiped_id = $1 AND s.direction = 'right' AND s.undone = false
         AND NOT EXISTS (SELECT 1 FROM swipes s2 WHERE s2.swiper_id = $1 AND s2.swiped_id = s.swiper_id)
         AND NOT EXISTS (SELECT 1 FROM matches m WHERE
           (m.user1_id = $1 AND m.user2_id = s.swiper_id) OR
           (m.user2_id = $1 AND m.user1_id = s.swiper_id)
         )
       ORDER BY s.created_at DESC`,
      [userId]
    );
    res.json({ likes: rows });
  }
);

// DELETE /matches/:id
router.delete("/:id", authenticate, async (req: AuthRequest, res: any) => {
  const { rows } = await query(
    "DELETE FROM matches WHERE id = $1 AND (user1_id = $2 OR user2_id = $2) RETURNING id",
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Match not found" });
  res.json({ message: "Unmatched" });
});

export default router;
