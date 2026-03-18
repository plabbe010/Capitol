import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

router.post("/ai/signal", async (req, res) => {
  try {
    const { ticker, asset, buys, sells, totalValue, members, flags, committees } = req.body as {
      ticker: string;
      asset: string;
      buys: number;
      sells: number;
      totalValue: number;
      members: string[];
      flags: string[];
      committees: string[];
    };

    const fmtMoney = (n: number) => {
      if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
      if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
      return `$${n}`;
    };

    const prompt = `You are a sharp, concise financial analyst. A user tracks congressional stock disclosures.

Ticker: ${ticker} (${asset})
Congressional activity: ${buys} purchases, ${sells} sales by ${members.length} member(s) — ${members.slice(0, 3).join(", ")}
Total estimated disclosed value: ${fmtMoney(totalValue)}
Unusual flags: ${flags.length ? flags.join(", ") : "None"}
Committee context: ${committees.join(", ") || "Unknown"}

Respond ONLY with a JSON object, no markdown, no extra text:
{
  "signal": "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell",
  "confidence": <integer 0-100>,
  "summary": "<2 sentence plain-english explanation, mention political context>",
  "flag_note": "<1 sentence on the most suspicious element, or empty string>"
}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0]?.type === "text" ? message.content[0].text : "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("AI signal error:", msg);
    res.status(500).json({ error: msg });
  }
});

router.post("/ai/summary", async (req, res) => {
  try {
    const { digest } = req.body as { digest: string };

    const prompt = `You are a financial journalist covering political transparency. Based on these recent congressional stock disclosures:\n\n${digest}\n\nWrite a 3-sentence market insight. Identify sector patterns, note anything suspicious, and flag what retail investors should watch. Be direct and specific.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0]?.type === "text" ? message.content[0].text : "";
    res.json({ summary: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("AI summary error:", msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
