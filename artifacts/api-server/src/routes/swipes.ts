import { Router } from "express";
import { query } from "../config/database";
import { authenticate, AuthRequest } from "../middleware/auth";
import { sendPush } from "../services/notifications";

const router = Router();

const FREE_SWIPES_PER_DAY = 50;
const LEFT_SWIPES_PER_FEEDBACK_BATCH = 5;

// GET /swipes/stack — discovery queue
router.get("/stack", authenticate, async (req: AuthRequest, res: any) => {
  const u = req.user;
  const limit = parseInt((req.query.limit as string) || "20");
  const { rows } = await query(
    `SELECT u.id, u.name, u.date_of_birth, u.gender, u.bio, u.curiosity_score,
            u.identity_verified, u.last_active_at, u.location_city, u.latitude, u.longitude,
            u.height, u.job_title, u.company, u.education, u.drinking, u.smoking,
            u.has_kids, u.wants_kids, u.interests, u.values_list,
            EXTRACT(YEAR FROM AGE(u.date_of_birth))::INT AS age,
            EXISTS(SELECT 1 FROM boosts b WHERE b.user_id = u.id AND b.expires_at > NOW()) AS is_boosted
     FROM users u
     WHERE u.id != $1
       AND u.deleted_at IS NULL AND u.profile_paused = false
       AND ($2::varchar[] = '{}' OR u.gender = ANY($2::varchar[]))
       AND EXTRACT(YEAR FROM AGE(u.date_of_birth))::INT BETWEEN $3 AND $4
       AND u.id NOT IN (SELECT swiped_id FROM swipes WHERE swiper_id = $1 AND undone = false)
       AND u.id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id = $1
         UNION SELECT blocker_id FROM blocks WHERE blocked_id = $1
       )
       AND ($5::numeric IS NULL OR u.latitude IS NULL OR (
         6371 * acos(cos(radians($5::float8))*cos(radians(u.latitude::float8))*cos(u.longitude::float8-radians($6::float8))+sin(radians($5::float8))*sin(radians(u.latitude::float8)))
         <= $7
       ))
     ORDER BY is_boosted DESC, u.last_active_at DESC LIMIT $8`,
    [
      u.id,
      u.filter_genders,
      u.filter_min_age,
      u.filter_max_age,
      u.latitude || null,
      u.longitude || null,
      u.filter_max_distance,
      limit,
    ]
  );
  const withPhotos = await Promise.all(
    rows.map(async (user: any) => {
      const { rows: photos } = await query(
        "SELECT url FROM photos WHERE user_id=$1 ORDER BY sort_order LIMIT 3",
        [user.id]
      );
      const { rows: prompts } = await query(
        "SELECT prompt_text AS question, answer FROM user_prompts WHERE user_id=$1 ORDER BY sort_order LIMIT 3",
        [user.id]
      );
      return { ...user, photos: photos.map((p: any) => p.url), prompts };
    })
  );
  res.json({ profiles: withPhotos });
});

// GET /swipes/likes — who liked the current user (all tiers see count; premium sees details)
router.get("/likes", authenticate, async (req: AuthRequest, res: any) => {
  const u = req.user;
  const { rows } = await query(
    `SELECT s.swiper_id as user_id, u.name, u.date_of_birth, u.gender,
            u.curiosity_score, u.identity_verified, u.location_city, s.direction, s.created_at
     FROM swipes s
     JOIN users u ON u.id = s.swiper_id
     WHERE s.swiped_id = $1
       AND s.direction IN ('right', 'super')
       AND s.undone = false
       AND NOT EXISTS (
         SELECT 1 FROM matches m
         WHERE (m.user1_id = s.swiper_id AND m.user2_id = $1)
            OR (m.user1_id = $1 AND m.user2_id = s.swiper_id)
       )
     ORDER BY s.direction DESC, s.created_at DESC`,
    [u.id]
  );
  const count = rows.length;
  if (!u.is_premium) {
    // Free users: count only, no profile details
    return res.json({ likes: [], count, premium_required: true });
  }
  const withPhotos = await Promise.all(
    rows.map(async (r: any) => {
      const { rows: photos } = await query(
        "SELECT url FROM photos WHERE user_id=$1 ORDER BY sort_order LIMIT 1",
        [r.user_id]
      );
      return { ...r, photo: photos[0]?.url || null };
    })
  );
  res.json({ likes: withPhotos, count, premium_required: false });
});

// POST /swipes — record swipe, detect mutual match, trigger feedback
router.post("/", authenticate, async (req: AuthRequest, res: any) => {
  const { swiped_id, direction } = req.body;
  if (!swiped_id || !["left", "right", "super"].includes(direction))
    return res.status(400).json({ error: "swiped_id and direction (left|right|super) required" });
  if (swiped_id === req.user.id)
    return res.status(400).json({ error: "Cannot swipe yourself" });
  const u = req.user;

  // Daily swipe limit for free users
  if (!u.is_premium) {
    const reset = new Date(u.swipes_reset_at);
    const now = new Date();
    const sameDay = reset.toDateString() === now.toDateString();
    const used = sameDay ? u.swipes_used_today : 0;
    if (used >= FREE_SWIPES_PER_DAY)
      return res.status(429).json({ error: "Daily swipe limit reached", limit: FREE_SWIPES_PER_DAY });
    await query(
      `UPDATE users SET swipes_used_today=$1, swipes_reset_at=$2 WHERE id=$3`,
      [sameDay ? used + 1 : 1, sameDay ? u.swipes_reset_at : now, u.id]
    );
  }

  const { rows } = await query(
    `INSERT INTO swipes (swiper_id, swiped_id, direction) VALUES ($1,$2,$3)
     ON CONFLICT (swiper_id, swiped_id) DO UPDATE SET direction=$3, undone=false RETURNING *`,
    [u.id, swiped_id, direction]
  );
  const swipeRow = rows[0];
  let match = null;

  // Match if either person liked right or super
  if (direction === "right" || direction === "super") {
    const { rows: mutual } = await query(
      `SELECT 1 FROM swipes WHERE swiper_id=$1 AND swiped_id=$2
       AND direction IN ('right','super') AND undone=false`,
      [swiped_id, u.id]
    );
    if (mutual.length) {
      const [a, b] = [u.id, swiped_id].sort();
      const { rows: matchRows } = await query(
        `INSERT INTO matches (user1_id, user2_id, expires_at)
         VALUES ($1,$2, NOW() + INTERVAL '24 hours')
         ON CONFLICT (user1_id, user2_id) DO NOTHING RETURNING *`,
        [a, b]
      );
      if (matchRows.length) {
        match = matchRows[0];
        await sendPush(swiped_id, "It's a match! 🎉", `You matched with ${u.name}`, {
          type: "match",
          matchId: match.id,
        });
      }
    }
  }

  if (direction === "left") {
    try {
      const { rows: counters } = await query(
        `SELECT * FROM left_swipe_counters WHERE swiped_id=$1 ORDER BY batch_num DESC LIMIT 1`,
        [swiped_id]
      );
      let batchNum = 1, count = 0;
      if (counters.length) {
        const last = counters[0];
        if (last.feedback_sent) { batchNum = last.batch_num + 1; count = 0; }
        else { batchNum = last.batch_num; count = last.count; }
      }
      count++;
      await query(
        `INSERT INTO left_swipe_counters (swiped_id, batch_num, count) VALUES ($1,$2,$3)
         ON CONFLICT (swiped_id, batch_num) DO UPDATE SET count=$3`,
        [swiped_id, batchNum, count]
      );
      if (count >= LEFT_SWIPES_PER_FEEDBACK_BATCH) {
        const { rows: target } = await query(
          `SELECT feedback_opt_out, hidden_from_feedback FROM users WHERE id=$1`,
          [swiped_id]
        );
        if (target.length && !target[0].feedback_opt_out && !target[0].hidden_from_feedback) {
          await query(
            `UPDATE left_swipe_counters SET feedback_sent=true WHERE swiped_id=$1 AND batch_num=$2`,
            [swiped_id, batchNum]
          );
          const { rows: swipers } = await query(
            `SELECT s.swiper_id, s.id as swipe_id FROM swipes s
             WHERE s.swiped_id=$1 AND s.direction='left' AND s.undone=false
               AND s.swiper_id NOT IN (SELECT swiper_id FROM feedback_requests WHERE recipient_id=$1)
             ORDER BY s.created_at DESC LIMIT 5`,
            [swiped_id]
          );
          for (const { swiper_id, swipe_id } of swipers) {
            await query(
              `INSERT INTO feedback_requests (recipient_id, swiper_id, swipe_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
              [swiped_id, swiper_id, swipe_id]
            );
          }
        }
      }
    } catch (err) {
      console.error("Feedback trigger error:", err);
    }
  }

  res.json({ swipe: swipeRow, match });
});

// POST /swipes/undo
router.post("/undo", authenticate, async (req: AuthRequest, res: any) => {
  const { rows } = await query(
    `SELECT * FROM swipes WHERE swiper_id=$1 AND undone=false ORDER BY created_at DESC LIMIT 1`,
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Nothing to undo" });
  await query("UPDATE swipes SET undone=true WHERE id=$1", [rows[0].id]);
  res.json({ message: "Swipe undone", restored_user_id: rows[0].swiped_id });
});

// GET /swipes/remaining
router.get("/remaining", authenticate, async (req: AuthRequest, res: any) => {
  if (req.user.is_premium) return res.json({ unlimited: true });
  const reset = new Date(req.user.swipes_reset_at);
  const now = new Date();
  const sameDay = reset.toDateString() === now.toDateString();
  const used = sameDay ? req.user.swipes_used_today : 0;
  res.json({ used, remaining: Math.max(0, FREE_SWIPES_PER_DAY - used), limit: FREE_SWIPES_PER_DAY });
});

export default router;
