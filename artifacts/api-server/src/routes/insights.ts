import { Router } from "express";
import { query } from "../config/database";
import { authenticate, AuthRequest } from "../middleware/auth";

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "your", "just", "from",
  "have", "more", "about", "they", "there", "their", "what", "when",
  "which", "like", "been", "were", "also", "into", "than", "then",
  "some", "very", "dont", "really", "think", "because", "could",
]);

const router = Router();

router.get("/", authenticate, async (req: AuthRequest, res: any) => {
  try {
    const userId = req.user.id;

    const { rows: totalRows } = await query(
      "SELECT COUNT(*) as cnt FROM feedback WHERE recipient_id = $1 AND delivered = true AND moderation_passed = true",
      [userId]
    );

    const { rows: weeklyRows } = await query(
      `SELECT date_trunc('week', created_at) as week, COUNT(*) as count
       FROM feedback
       WHERE recipient_id = $1 AND delivered = true AND moderation_passed = true
         AND created_at > NOW() - INTERVAL '90 days'
       GROUP BY week
       ORDER BY week`,
      [userId]
    );

    const { rows: recentRows } = await query(
      `SELECT reason, created_at FROM feedback
       WHERE recipient_id = $1 AND delivered = true AND moderation_passed = true
       ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );

    const { rows: allReasons } = await query(
      `SELECT reason FROM feedback
       WHERE recipient_id = $1 AND delivered = true AND moderation_passed = true`,
      [userId]
    );

    // Word frequency analysis
    const wordFreq: Record<string, number> = {};
    for (const { reason } of allReasons) {
      const words = reason.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/);
      for (const word of words) {
        if (word.length > 4 && !STOP_WORDS.has(word)) {
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
      }
    }
    const top_words = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));

    res.json({
      total_feedback: parseInt(totalRows[0].cnt),
      weekly_trend: weeklyRows,
      recent_feedback: recentRows,
      curiosity_score: req.user.curiosity_score,
      top_words,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get insights" });
  }
});

export default router;
