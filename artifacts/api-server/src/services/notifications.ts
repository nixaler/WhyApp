import { query } from "../config/database";

// APN is optional — stub when not configured
export async function sendPush(
  userId: string,
  title: string,
  body: string,
  data: object = {}
): Promise<void> {
  const hasApn =
    process.env["APN_KEY"] &&
    process.env["APN_KEY_ID"] &&
    process.env["APN_TEAM_ID"];

  if (!hasApn) {
    console.log(`[PUSH stub] ${title}: ${body}`, data);
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const apn = require("apn");
    const provider = new apn.Provider({
      token: {
        key: process.env["APN_KEY"],
        keyId: process.env["APN_KEY_ID"],
        teamId: process.env["APN_TEAM_ID"],
      },
      production: process.env["NODE_ENV"] === "production",
    });

    const { rows } = await query(
      "SELECT token FROM push_tokens WHERE user_id = $1",
      [userId]
    );
    if (!rows.length) return;

    const note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + 3600;
    note.badge = 1;
    note.sound = "default";
    note.alert = { title, body };
    note.payload = data;
    note.topic = process.env["APN_BUNDLE_ID"];

    for (const { token } of rows) {
      const result = await provider.send(note, token);
      if (result.failed.length) console.error("APNs failure:", result.failed);
    }
    provider.shutdown();
  } catch (err) {
    console.error("Push notification error:", err);
  }
}
