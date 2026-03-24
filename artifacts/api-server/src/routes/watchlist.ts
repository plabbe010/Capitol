import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { watchlists } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

// ── Session ID helper ─────────────────────────────────────────────────────────
// Uses a simple cookie-based session ID. No auth required — this is per-device.
// Can be swapped for a real user ID later without changing the DB schema.
function getSessionId(req: Parameters<Parameters<typeof router.get>[1]>[0]): string {
  return (req.cookies?.["cw_session"] as string) || "anonymous";
}

// GET /watchlist — return all watched tickers and members for this session
router.get("/watchlist", async (req, res) => {
  const sessionId = getSessionId(req);
  try {
    const rows = await db
      .select()
      .from(watchlists)
      .where(eq(watchlists.sessionId, sessionId));

    const tickers = rows.filter(r => r.type === "ticker").map(r => r.value);
    const members = rows.filter(r => r.type === "member").map(r => r.value);

    res.json({ tickers, members });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Watchlist GET error:", msg);
    res.status(500).json({ error: msg });
  }
});

// POST /watchlist — add a ticker or member to watchlist
router.post("/watchlist", async (req, res) => {
  const sessionId = getSessionId(req);
  const { type, value } = req.body as { type: "ticker" | "member"; value: string };

  if (!type || !value || !["ticker", "member"].includes(type)) {
    return res.status(400).json({ error: "type must be 'ticker' or 'member', value is required" });
  }

  try {
    await db
      .insert(watchlists)
      .values({ sessionId, type, value })
      .onConflictDoNothing(); // Already watched — silently ignore

    res.json({ ok: true, type, value });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Watchlist POST error:", msg);
    res.status(500).json({ error: msg });
  }
});

// DELETE /watchlist — remove a ticker or member from watchlist
router.delete("/watchlist", async (req, res) => {
  const sessionId = getSessionId(req);
  const { type, value } = req.body as { type: "ticker" | "member"; value: string };

  if (!type || !value) {
    return res.status(400).json({ error: "type and value are required" });
  }

  try {
    await db
      .delete(watchlists)
      .where(
        and(
          eq(watchlists.sessionId, sessionId),
          eq(watchlists.type, type),
          eq(watchlists.value, value)
        )
      );

    res.json({ ok: true, type, value });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Watchlist DELETE error:", msg);
    res.status(500).json({ error: msg });
  }
});

export default router;