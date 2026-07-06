import { Router } from "express";
import { query } from "../config/database";
import { authenticate, AuthRequest } from "../middleware/auth";
import upload from "../middleware/upload";

const router = Router();

async function verifyMatchMember(matchId: string, userId: string) {
  const { rows } = await query(
    "SELECT * FROM matches WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)",
    [matchId, userId]
  );
  return rows[0] || null;
}

// GET /messages/:matchId
router.get("/:matchId", authenticate, async (req: AuthRequest, res: any) => {
  const match = await verifyMatchMember(String(req.params.matchId), req.user.id);
  if (!match) return res.status(403).json({ error: "Match not found" });
  const { rows } = await query(
    "SELECT * FROM messages WHERE match_id = $1 ORDER BY created_at ASC",
    [req.params.matchId]
  );
  // Mark incoming as read
  await query(
    "UPDATE messages SET read_at = NOW() WHERE match_id = $1 AND sender_id != $2 AND read_at IS NULL",
    [req.params.matchId, req.user.id]
  );
  res.json({ messages: rows });
});

// POST /messages/:matchId
router.post("/:matchId", authenticate, async (req: AuthRequest, res: any) => {
  const match = await verifyMatchMember(String(req.params.matchId), req.user.id);
  if (!match) return res.status(403).json({ error: "Match not found" });
  const { content } = req.body;
  if (!content?.trim())
    return res.status(400).json({ error: "Content required" });
  const { rows } = await query(
    "INSERT INTO messages (match_id, sender_id, content) VALUES ($1,$2,$3) RETURNING *",
    [req.params.matchId, req.user.id, content.trim()]
  );
  res.status(201).json({ message: rows[0] });
});

// POST /messages/:matchId/photo
router.post(
  "/:matchId/photo",
  authenticate,
  upload.single("photo"),
  async (req: AuthRequest, res: any) => {
    const match = await verifyMatchMember(String(req.params.matchId), req.user.id);
    if (!match) return res.status(403).json({ error: "Match not found" });
    if (!req.file) return res.status(400).json({ error: "Photo required" });
    const photoUrl = `/api/uploads/${req.file.filename}`;
    const { rows } = await query(
      "INSERT INTO messages (match_id, sender_id, photo_url) VALUES ($1,$2,$3) RETURNING *",
      [req.params.matchId, req.user.id, photoUrl]
    );
    res.status(201).json({ message: rows[0] });
  }
);

export default router;
