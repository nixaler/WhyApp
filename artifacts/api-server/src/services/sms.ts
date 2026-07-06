// Twilio is optional — stub when not configured
export async function sendVerificationCode(
  phone: string,
  code: string
): Promise<void> {
  if (!process.env["TWILIO_ACCOUNT_SID"]) {
    console.log("[SMS stub] Verification code sent (set TWILIO_ACCOUNT_SID to enable real SMS)");
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const twilio = require("twilio");
    const client = twilio(
      process.env["TWILIO_ACCOUNT_SID"],
      process.env["TWILIO_AUTH_TOKEN"]
    );
    await client.messages.create({
      body: `Your WHY verification code is: ${code}`,
      from: process.env["TWILIO_PHONE_NUMBER"],
      to: phone,
    });
  } catch (err) {
    console.error("SMS error:", err);
  }
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
