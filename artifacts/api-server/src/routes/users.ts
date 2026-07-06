import { Router } from "express";
import { query } from "../config/database";
import { authenticate, AuthRequest } from "../middleware/auth";
import upload from "../middleware/upload";

const router = Router();

router.get("/me", authenticate, async (req: AuthRequest, res: any) => {
  try {
    const { rows: userRows } = await query(
      "SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL",
      [req.user.id]
    );
    if (!userRows.length) return res.status(404).json({ error: "Not found" });
    const user = userRows[0];
    const { password_hash: _ph, ...safe } = user;
    const { rows: photos } = await query(
      "SELECT * FROM photos WHERE user_id = $1 ORDER BY sort_order",
      [req.user.id]
    );
    const { rows: prompts } = await query(
      "SELECT * FROM user_prompts WHERE user_id = $1 ORDER BY sort_order",
      [req.user.id]
    );
    res.json({ user: { ...safe, photos, prompts } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

router.patch("/me", authenticate, async (req: AuthRequest, res: any) => {
  const allowed = [
    "name", "bio", "gender", "seeking", "latitude", "longitude",
    "location_city", "filter_min_age", "filter_max_age", "filter_max_distance",
    "filter_genders", "profile_paused", "feedback_opt_out", "hidden_from_feedback",
  ];
  const updates: string[] = [];
  const vals: any[] = [];
  let i = 1;
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates.push(`${key} = $${i++}`);
      vals.push(req.body[key]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
  vals.push(req.user.id);
  const { rows } = await query(
    `UPDATE users SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
    vals
  );
  const { password_hash: _ph, ...safe } = rows[0];
  res.json({ user: safe });
});

router.post(
  "/me/photos",
  authenticate,
  upload.single("photo"),
  async (req: AuthRequest, res: any) => {
    if (!req.file) return res.status(400).json({ error: "Photo required" });
    const { rows: existing } = await query(
      "SELECT COUNT(*) as cnt FROM photos WHERE user_id = $1",
      [req.user.id]
    );
    const sortOrder = parseInt(existing[0].cnt);
    const url = `/api/uploads/${req.file.filename}`;
    const { rows } = await query(
      "INSERT INTO photos (user_id, url, sort_order) VALUES ($1,$2,$3) RETURNING *",
      [req.user.id, url, sortOrder]
    );
    res.status(201).json({ photo: rows[0] });
  }
);

router.delete("/me/photos/:id", authenticate, async (req: AuthRequest, res: any) => {
  const { rows } = await query(
    "DELETE FROM photos WHERE id = $1 AND user_id = $2 RETURNING id",
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Photo not found" });
  res.json({ message: "Photo deleted" });
});

router.post("/me/prompts", authenticate, async (req: AuthRequest, res: any) => {
  const { prompt_text, answer } = req.body;
  if (!prompt_text || !answer)
    return res.status(400).json({ error: "prompt_text and answer required" });
  const { rows: existing } = await query(
    "SELECT COUNT(*) as cnt FROM user_prompts WHERE user_id = $1",
    [req.user.id]
  );
  const sortOrder = parseInt(existing[0].cnt);
  const { rows } = await query(
    "INSERT INTO user_prompts (user_id, prompt_text, answer, sort_order) VALUES ($1,$2,$3,$4) RETURNING *",
    [req.user.id, prompt_text, answer, sortOrder]
  );
  res.status(201).json({ prompt: rows[0] });
});

router.delete("/me/prompts/:id", authenticate, async (req: AuthRequest, res: any) => {
  const { rows } = await query(
    "DELETE FROM user_prompts WHERE id = $1 AND user_id = $2 RETURNING id",
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Prompt not found" });
  res.json({ message: "Prompt deleted" });
});

router.post("/:id/block", authenticate, async (req: AuthRequest, res: any) => {
  await query(
    "INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [req.user.id, req.params.id]
  );
  res.json({ message: "User blocked" });
});

router.get("/prompts/presets", authenticate, async (_req: any, res: any) => {
  const { rows } = await query("SELECT * FROM preset_prompts ORDER BY id");
  res.json({ presets: rows });
});

export default router;
