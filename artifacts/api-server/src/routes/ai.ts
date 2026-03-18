import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI rate limit reached, please wait before generating more signals." },
});

router.use(aiLimiter);

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

    const prompt = `You are a sharp financial intelligence analyst writing a morning briefing for sophisticated investors. Here are the top congressional stock trades ranked by signal score:\n\n${digest}\n\nWrite exactly 3–5 bullet points. Rules:\n- Each bullet starts with •\n- One punchy sentence per bullet, max 20 words\n- Lead with the single most unusual or suspicious trade\n- Name the ticker, member, and what makes it interesting (committee overlap, bipartisan buys, obscure small-cap, etc.)\n- Make the final bullet a forward-looking sector watch sentence\n- No disclaimers, no hedging, no legal language\n- Plain text only, no bold, no markdown`;

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
