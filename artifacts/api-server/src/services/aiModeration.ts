import OpenAI from "openai";

let openai: OpenAI | null = null;
const getClient = () => {
  if (!openai) openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
  return openai;
};

export async function moderateText(
  text: string
): Promise<{ passed: boolean; score: object }> {
  if (!process.env["OPENAI_API_KEY"]) return { passed: true, score: {} };
  try {
    const client = getClient();
    const response = await client.moderations.create({ input: text });
    const result = response.results[0];
    return { passed: !result.flagged, score: result.category_scores as object };
  } catch (err: any) {
    console.error("Moderation error:", err.message);
    return { passed: true, score: {} };
  }
}
