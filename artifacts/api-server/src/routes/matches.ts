import { Router } from "express";
import { query } from "../config/database";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// GET /matches — active (non-expired) matches with full details
router.get("/", authenticate, async (req: AuthRequest, res: any) => {
  const userId = req.user.id;
  try {
    const { rows } = await query(
      `SELECT m.*,
        CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END AS other_id
       FROM matches m
       WHERE (m.user1_id = $1 OR m.user2_id = $1)
         AND (m.expires_at IS NULL OR m.expires_at > NOW())
       ORDER BY m.created_at DESC`,
      [userId]
    );
    const withDetails = await Promise.all(
      rows.map(async (match: any) => {
        const { rows: userRows } = await query(
          `SELECT id, name, identity_verified, last_active_at, curiosity_score FROM users WHERE id = $1`,
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
          ? { ...userRows[0], photo: photoRows[0]?.url || null }
          : null;
        return {
          ...match,
          other_user,
          last_message: lastMsgRows[0] || null,
          last_message_at: lastMsgRows[0]?.created_at || match.created_at,
          unread_count: parseInt(unreadRows[0].cnt),
          ms_remaining: match.expires_at
            ? Math.max(0, new Date(match.expires_at).getTime() - Date.now())
            : null,
        };
      })
    );
    res.json({ matches: withDetails });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get matches" });
  }
});

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
