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

// ── Free data sources (no API key needed) ────────────────────────────────────
// House Stock Watcher & Senate Stock Watcher are community-run open projects
// that parse the official STOCK Act filings daily. Completely free, no signup.
// GitHub raw URLs — reliable, no S3 auth issues
const HOUSE_URL  = "https://raw.githubusercontent.com/timothycarambat/house-stock-watcher-data/master/data/all_transactions.json";
const SENATE_URL = "https://raw.githubusercontent.com/timothycarambat/senate-stock-watcher-data/master/aggregate/all_transactions.json";

async function fetchFree(url, label) {
  const cached = cache.get(url);
  if (cached) {
    console.log(`[cache hit] ${label}`);
    return cached;
  }
  console.log(`[fetch] ${label}`);
  const res = await axios.get(url, {
    headers: { Accept: "application/json" },
    timeout: 20000, // S3 can be slow on cold fetches
  });
  cache.set(url, res.data);
  return res.data;
}

// Normalize House Stock Watcher shape → our internal shape
// House data is a flat array of trade objects
function normalizeHouse(arr) {
  return (Array.isArray(arr) ? arr : []).map((t) => ({
    ticker:         t.ticker                          || "—",
    asset:          t.asset_description               || t.ticker || "—",
    representative: t.representative                  || "Unknown",
    party:          t.party                           || "?",
    state:          t.state                           || "—",
    chamber:        "House",
    type:           t.type                            || "Purchase",
    amount:         t.amount                          || "$1,001 - $15,000",
    date:           t.transaction_date                || "",
    filed:          t.disclosure_date                 || "",
    committees:     [],
  }));
}

// Normalize Senate Stock Watcher shape → our internal shape
// Senate data is nested: array of senators, each with a transactions[] array
function normalizeSenate(arr) {
  if (!Array.isArray(arr)) return [];
  const flat = [];
  for (const senator of arr) {
    // Handle both flat format and nested {senator, transactions[]} format
    if (senator.transactions && Array.isArray(senator.transactions)) {
      const name = `${senator.first_name || ""} ${senator.last_name || ""}`.trim() || senator.senator || "Unknown";
      for (const t of senator.transactions) {
        if (!t.ticker || t.ticker === "--") continue;
        flat.push({
          ticker:         t.ticker                    || "—",
          asset:          t.asset_description         || t.ticker || "—",
          representative: name,
          party:          senator.party               || t.party  || "?",
          state:          senator.state               || "—",
          chamber:        "Senate",
          type:           t.type                      || "Purchase",
          amount:         t.amount                    || "$1,001 - $15,000",
          date:           t.transaction_date          || "",
          filed:          senator.date_recieved       || "",
          committees:     [],
        });
      }
    } else {
      // Flat format fallback
      if (!senator.ticker || senator.ticker === "--") continue;
      flat.push({
        ticker:         senator.ticker                || "—",
        asset:          senator.asset_description     || senator.ticker || "—",
        representative: senator.senator               || "Unknown",
        party:          senator.party                 || "?",
        state:          senator.state                 || "—",
        chamber:        "Senate",
        type:           senator.type                  || "Purchase",
        amount:         senator.amount                || "$1,001 - $15,000",
        date:           senator.transaction_date      || "",
        filed:          senator.disclosure_date       || "",
        committees:     [],
      });
    }
  }
  return flat;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check — no key required anymore, just confirm server is up
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasKey: true, // always true — no key needed
    source: "House Stock Watcher + Senate Stock Watcher (free)",
    cacheKeys: cache.keys().length,
    uptime: Math.floor(process.uptime()),
  });
});

// House trades
app.get("/api/house", async (req, res) => {
  try {
    const data = await fetchFree(HOUSE_URL, "house");
    res.json(normalizeHouse(data));
  } catch (err) {
    console.error("House fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Senate trades
app.get("/api/senate", async (req, res) => {
  try {
    const data = await fetchFree(SENATE_URL, "senate");
    res.json(normalizeSenate(data));
  } catch (err) {
    console.error("Senate fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Both chambers combined, most recent 150 trades
app.get("/api/trades", async (req, res) => {
  try {
    const [house, senate] = await Promise.all([
      fetchFree(HOUSE_URL,  "house"),
      fetchFree(SENATE_URL, "senate"),
    ]);

    const all = [
      ...normalizeHouse(house),
      ...normalizeSenate(senate),
    ]
      .filter((t) => t.ticker && t.ticker !== "—" && t.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 150); // keep it snappy — most recent 150

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
  console.log(`   Data: House + Senate Stock Watcher (free, no API key needed)`);
  console.log(`   Cache TTL: 15 minutes\n`);
});
