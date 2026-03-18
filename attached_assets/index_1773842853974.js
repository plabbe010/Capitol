require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const NodeCache = require("node-cache");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const cache = new NodeCache({ stdTTL: 900 }); // 15 min cache

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Rate limit API routes — 60 requests per 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api", limiter);

// ── QuiverQuant proxy ─────────────────────────────────────────────────────────
const QUIVER_BASE = "https://api.quiverquant.com/beta";
const QUIVER_KEY = process.env.QUIVER_API_KEY;

async function fetchQuiver(endpoint) {
  const cacheKey = endpoint;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`[cache hit] ${endpoint}`);
    return cached;
  }

  if (!QUIVER_KEY) throw new Error("QUIVER_API_KEY not set in environment");

  console.log(`[quiver fetch] ${endpoint}`);
  const res = await axios.get(`${QUIVER_BASE}${endpoint}`, {
    headers: {
      Authorization: `Token ${QUIVER_KEY}`,
      Accept: "application/json",
    },
    timeout: 10000,
  });

  cache.set(cacheKey, res.data);
  return res.data;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasKey: !!QUIVER_KEY,
    cacheKeys: cache.keys().length,
    uptime: Math.floor(process.uptime()),
  });
});

// House trades
app.get("/api/house", async (req, res) => {
  try {
    const data = await fetchQuiver("/live/housetrading");
    res.json(data);
  } catch (err) {
    console.error("House fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Senate trades
app.get("/api/senate", async (req, res) => {
  try {
    const data = await fetchQuiver("/live/senatetrading");
    res.json(data);
  } catch (err) {
    console.error("Senate fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Both chambers combined (convenience endpoint)
app.get("/api/trades", async (req, res) => {
  try {
    const [house, senate] = await Promise.all([
      fetchQuiver("/live/housetrading"),
      fetchQuiver("/live/senatetrading"),
    ]);

    const normalize = (arr, chamber) =>
      (Array.isArray(arr) ? arr : []).map((t) => ({
        ticker:         t.Ticker        || t.ticker        || "—",
        asset:          t.Asset         || t.asset         || t.Ticker || "—",
        representative: t.Representative|| t.Senator       || t.Name   || "Unknown",
        party:          t.Party         || "?",
        state:          t.State         || "—",
        chamber,
        type:           t.Transaction   || t.Type          || "Purchase",
        amount:         t.Range         || t.Amount        || "$1,001 - $15,000",
        date:           t.TransactionDate || t.Date        || t.date   || "",
        filed:          t.DisclosureDate  || t.Filed       || t.date   || "",
        committees:     t.Committees    || [],
      }));

    const all = [
      ...normalize(house, "House"),
      ...normalize(senate, "Senate"),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(all);
  } catch (err) {
    console.error("Trades fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Cache bust (manual refresh)
app.post("/api/refresh", (req, res) => {
  cache.flushAll();
  res.json({ ok: true, message: "Cache cleared" });
});

// ── Serve built React app in production ───────────────────────────────────────
const clientBuild = path.join(__dirname, "../client/dist");
app.use(express.static(clientBuild));
app.get("*", (req, res) => {
  res.sendFile(path.join(clientBuild, "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🏛️  Capitol Watch server running on port ${PORT}`);
  console.log(`   QuiverQuant key: ${QUIVER_KEY ? "✓ loaded" : "✗ MISSING — set QUIVER_API_KEY"}`);
  console.log(`   Cache TTL: 15 minutes\n`);
});
