import { Router } from "express";
import { query } from "../config/database";
import { authenticate, AuthRequest } from "../middleware/auth";
import { moderateText } from "../services/aiModeration";

const router = Router();

// GET /feedback/pending — feedback requests assigned to current user
router.get("/pending", authenticate, async (req: AuthRequest, res: any) => {
  const { rows } = await query(
    `SELECT fr.id, fr.recipient_id, fr.created_at,
            u.name as recipient_name
     FROM feedback_requests fr
     JOIN users u ON u.id = fr.recipient_id
     WHERE fr.swiper_id = $1 AND fr.completed = false
     ORDER BY fr.created_at DESC`,
    [req.user.id]
  );
  // Add recipient photo
  const withPhotos = await Promise.all(
    rows.map(async (r: any) => {
      const { rows: photos } = await query(
        "SELECT url FROM photos WHERE user_id = $1 ORDER BY sort_order LIMIT 1",
        [r.recipient_id]
      );
      return { ...r, recipient_photo: photos[0]?.url || null };
    })
  );
  res.json({ pending: withPhotos });
});

// POST /feedback/:requestId — submit feedback
router.post("/:requestId", authenticate, async (req: AuthRequest, res: any) => {
  const { reason, suggestion } = req.body;
  if (!reason?.trim())
    return res.status(400).json({ error: "reason required" });

  // Verify request exists and belongs to this swiper
  const { rows: reqRows } = await query(
    "SELECT * FROM feedback_requests WHERE id = $1 AND swiper_id = $2 AND completed = false",
    [req.params.requestId, req.user.id]
  );
  if (!reqRows.length)
    return res.status(404).json({ error: "Request not found" });
  const feedbackReq = reqRows[0];

  // AI moderation
  const modResult = await moderateText(reason + (suggestion ? " " + suggestion : ""));

  // Insert feedback — delivered_at only set when moderation actually passes
  const { rows: fbRows } = await query(
    `INSERT INTO feedback (request_id, recipient_id, reason, suggestion, moderation_passed, moderation_score, delivered, delivered_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      feedbackReq.id,
      feedbackReq.recipient_id,
      reason.trim(),
      suggestion?.trim() || null,
      modResult.passed,
      JSON.stringify(modResult.score),
      modResult.passed,
      modResult.passed ? new Date() : null,
    ]
  );

  // Mark request as completed
  await query("UPDATE feedback_requests SET completed = true WHERE id = $1", [
    feedbackReq.id,
  ]);

  // Update curiosity_score if delivered
  if (modResult.passed) {
    await query(
      "UPDATE users SET curiosity_score = LEAST(100, curiosity_score + 1) WHERE id = $1",
      [feedbackReq.recipient_id]
    );
  }

  res.status(201).json({ feedback: fbRows[0], moderation_passed: modResult.passed });
});

// GET /feedback/inbox — received feedback
router.get("/inbox", authenticate, async (req: AuthRequest, res: any) => {
  const { rows } = await query(
    `SELECT f.id, f.reason, f.suggestion, f.delivered_at, f.created_at,
            (SELECT COUNT(*) FROM feedback_replies fr WHERE fr.feedback_id = f.id) as reply_count
     FROM feedback f
     WHERE f.recipient_id = $1 AND f.delivered = true AND f.moderation_passed = true
     ORDER BY f.created_at DESC`,
    [req.user.id]
  );
  res.json({ feedback: rows });
});

// POST /feedback/:id/reply
router.post("/:id/reply", authenticate, async (req: AuthRequest, res: any) => {
  const { content } = req.body;
  if (!content?.trim())
    return res.status(400).json({ error: "content required" });

  // Verify feedback belongs to this recipient
  const { rows: fbRows } = await query(
    "SELECT * FROM feedback WHERE id = $1 AND recipient_id = $2",
    [req.params.id, req.user.id]
  );
  if (!fbRows.length)
    return res.status(404).json({ error: "Feedback not found" });

  const { rows } = await query(
    "INSERT INTO feedback_replies (feedback_id, sender_id, content) VALUES ($1,$2,$3) RETURNING *",
    [req.params.id, req.user.id, content.trim()]
  );
  res.status(201).json({ reply: rows[0] });
});

export default router;
