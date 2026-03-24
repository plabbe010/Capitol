import { Router, type IRouter } from "express";
import axios from "axios";
import NodeCache from "node-cache";
import { db } from "@workspace/db";
import { trades as tradesTable } from "@workspace/db";
import { desc, gte, sql } from "drizzle-orm";

const router: IRouter = Router();

const cache      = new NodeCache({ stdTTL: 900 });   // 15-min trades cache
const priceCache = new NodeCache({ stdTTL: 3600 });  // 60-min price cache

const QUIVER_URL = "https://api.quiverquant.com/beta/live/congresstrading";
const CACHE_KEY  = "quiver_congress";

const AMOUNT_MID: Record<string, number> = {
  "$1,001 - $15,000": 8000,
  "$15,001 - $50,000": 32500,
  "$50,001 - $100,000": 75000,
  "$100,001 - $250,000": 175000,
  "$250,001 - $500,000": 375000,
  "$500,001 - $1,000,000": 750000,
  "$1,000,001 - $5,000,000": 3000000,
  "Over $5,000,000": 5000000,
};

// ── Known large-cap tickers (trigger −40 household-name discount) ─────────────
const LARGE_CAPS = new Set([
  // US Mega-cap tech
  "AAPL","MSFT","GOOGL","GOOG","AMZN","META","TSLA","NVDA","BRK.A","BRK.B",
  "ORCL","CRM","NFLX","ADBE","AMD","INTC","QCOM","TXN","AVGO","IBM",
  // Semiconductors (well-known names, not obscure supply chain)
  "TSM","ASML","MU","AMAT","KLAC","LRCX","SNPS","CDNS",
  // Finance
  "JPM","GS","MS","BAC","WFC","C","BLK","SCHW","AXP","V","MA","PYPL",
  // Healthcare / Pharma
  "JNJ","PFE","MRK","ABBV","LLY","BMY","AMGN","GILD","UNH","CVS","HCA",
  // Energy majors
  "XOM","CVX","COP","SLB","OXY","MPC","PSX","VLO",
  "KMI","WMB","ET","EPD","OKE",
  // Defense primes (large, well-covered)
  "LMT","RTX","NOC","BA","GD","LHX","HII",
  // Consumer / Retail
  "WMT","HD","COST","MCD","KO","PEP","PG","DIS","NKE","SBUX",
  "TGT","LOW","TJX","PM","MO","MDLZ",
  // Telecoms
  "T","VZ","TMUS",
  // Other mega / well-known
  "ABT","TMO","DHR","NEE","DUK","SO","AMT","PLD","SPG",
  "ACN","CAT","HON","UPS","FDX","GE","MMM","DE",
]);

const TICKER_SECTOR: Record<string, string> = {
  LMT: "defense", RTX: "defense", NOC: "defense", BA: "defense", GD: "defense", LHX: "defense", HII: "defense",
  XOM: "energy",  CVX: "energy",  COP: "energy",  OXY: "energy",  SLB: "energy",  MPC: "energy",  PSX: "energy",
  KMI: "energy",  WMB: "energy",  ET:  "energy",  EPD: "energy",  OKE: "energy",  VLO: "energy",
  NVDA: "tech",   MSFT: "tech",   GOOGL: "tech",  GOOG: "tech",   AAPL: "tech",   AMZN: "tech",
  META: "tech",   ORCL: "tech",   IBM: "tech",    INTC: "tech",   AMD: "tech",    QCOM: "tech",
  TSM:  "tech",   ASML: "tech",   MU:  "tech",    AMAT: "tech",   KLAC: "tech",   LRCX: "tech",
  PFE: "health",  JNJ: "health",  MRK: "health",  ABBV: "health", LLY: "health",  BMY: "health",
  AMGN: "health", UNH: "health",  CVS: "health",  HCA: "health",  GILD: "health",
  JPM: "finance", GS: "finance",  MS: "finance",  BAC: "finance", WFC: "finance", C: "finance",
  BLK: "finance", SCHW: "finance", V: "finance",  MA: "finance",  AXP: "finance",
};

const SECTOR_COMMITTEE: Record<string, string[]> = {
  defense: ["Armed Services", "Foreign Affairs", "Military Construction"],
  energy:  ["Energy & Commerce", "Energy & Water", "Natural Resources"],
  tech:    ["Science, Space & Technology", "Commerce", "Judiciary"],
  health:  ["Energy & Commerce", "Health", "HELP"],
  finance: ["Financial Services", "Ways & Means", "Banking"],
};

const MEMBER_COMMITTEES: Record<string, string[]> = {
  "Dan Crenshaw":               ["Armed Services", "Energy & Commerce"],
  "Michael McCaul":             ["Foreign Affairs"],
  "Pete Sessions":              ["Rules", "Energy & Commerce"],
  "Marjorie Taylor Greene":     ["Oversight", "Homeland Security"],
  "Josh Gottheimer":            ["Financial Services"],
  "Suzan DelBene":              ["Ways & Means", "Agriculture"],
  "Debbie Wasserman Schultz":   ["Appropriations", "Energy & Water"],
  "Kevin McCarthy":             ["Rules"],
  "Thomas H. Kean Jr":          ["Financial Services"],
  "Cleo Fields":                ["Financial Services", "Judiciary"],
  "Nancy Pelosi":               ["Financial Services"],
  "Katie Porter":               ["Oversight"],
  "Brian Higgins":              ["Ways & Means"],
  "Tom Cole":                   ["Appropriations", "Rules"],
  "Mike Quigley":               ["Appropriations"],
  "Ro Khanna":                  ["Armed Services", "Science, Space & Technology"],
  "Jim Himes":                  ["Financial Services"],
  "David Joyce":                ["Appropriations"],
  "Earl Blumenauer":            ["Ways & Means"],
  "Mike Gallagher":             ["Armed Services", "Homeland Security"],
  "Mo Brooks":                  ["Armed Services", "Science, Space & Technology"],
  "Alan Lowenthal":             ["Natural Resources"],
  "Zoe Lofgren":                ["Judiciary", "Science, Space & Technology"],
  "John Curtis":                ["Energy & Commerce", "Natural Resources"],
  "Bill Foster":                ["Financial Services", "Science, Space & Technology"],
  "Jeff Van Drew":              ["Armed Services", "Transportation"],
  "Blake Moore":                ["Ways & Means", "Armed Services"],
  "Ann Wagner":                 ["Financial Services"],
  "French Hill":                ["Financial Services"],
  "Patrick McHenry":            ["Financial Services"],
  "Brad Sherman":               ["Financial Services", "Foreign Affairs"],
  "Scott Peters":               ["Energy & Commerce"],
  "Kurt Schrader":              ["Energy & Commerce"],
  "Gil Cisneros":               ["Armed Services"],
  "Gilbert Cisneros":           ["Armed Services"],
  "Julia Letlow":               ["Armed Services", "Agriculture"],
};

// ── Interfaces ────────────────────────────────────────────────────────────────
interface RawQuiverTrade {
  Representative?: string;
  BioGuideID?: string;
  ReportDate?: string;
  TransactionDate?: string;
  Ticker?: string;
  Transaction?: string;
  Range?: string;
  House?: string;
  Amount?: string;
  Party?: string;
  last_modified?: string;
  TickerType?: string;
  Description?: string | null;
  ExcessReturn?: number | null;
  PriceChange?: number | null;
  SPYChange?: number | null;
}

interface ScoreSignal {
  label: string;
  pts: number;
}

interface Trade {
  ticker: string;
  asset: string;
  representative: string;
  party: string;
  state: string;
  chamber: string;
  type: string;
  amount: string;
  date: string;
  filed: string;
  committees: string[];
  signalScore: number;
  tier: "diamond" | "high" | "watch" | "low";
  signals: ScoreSignal[];
  noise: ScoreSignal[];
}

interface PriceData {
  low52: number;
  high52: number;
  currentPrice: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMoney(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function daysBetween(a: string, b: string): number {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (isNaN(ta) || isNaN(tb)) return 0;
  return Math.round(Math.abs(tb - ta) / 86400000);
}

function isBuy(type: string): boolean {
  return type.toLowerCase().includes("purchase");
}

function amountMid(s: string): number {
  return AMOUNT_MID[s] ?? 8000;
}

// ── Price data fetching ───────────────────────────────────────────────────────
async function fetchPriceData(tickers: string[]): Promise<Record<string, PriceData>> {
  const PRICE_CACHE_KEY = `prices:${tickers.sort().join(",")}`;
  const cached = priceCache.get<Record<string, PriceData>>(PRICE_CACHE_KEY);
  if (cached) return cached;

  const result: Record<string, PriceData> = {};

  const fetches = tickers.slice(0, 50).map(async (ticker) => {
    const tickerKey = `price:${ticker}`;
    const hit = priceCache.get<PriceData>(tickerKey);
    if (hit) { result[ticker] = hit; return; }

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`;
      const res = await axios.get<{chart?: {result?: Array<{meta?: {fiftyTwoWeekLow?: number; fiftyTwoWeekHigh?: number; regularMarketPrice?: number}}>}}>(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CapitolWatch/1.0)",
          "Accept": "application/json",
        },
        timeout: 8000,
      });
      const meta = res.data?.chart?.result?.[0]?.meta;
      if (meta?.fiftyTwoWeekLow && meta?.regularMarketPrice) {
        const pd: PriceData = {
          low52: meta.fiftyTwoWeekLow,
          high52: meta.fiftyTwoWeekHigh ?? meta.regularMarketPrice,
          currentPrice: meta.regularMarketPrice,
        };
        priceCache.set(tickerKey, pd);
        result[ticker] = pd;
      }
    } catch {
      // non-fatal — skip this ticker
    }
  });

  await Promise.allSettled(fetches);
  priceCache.set(PRICE_CACHE_KEY, result);
  return result;
}

// ── Scoring engine ────────────────────────────────────────────────────────────
function computeScore(
  trade: Omit<Trade, "signalScore" | "tier" | "signals" | "noise">,
  allTrades: Omit<Trade, "signalScore" | "tier" | "signals" | "noise">[],
  priceData: Record<string, PriceData>,
  committeeMap: Record<string, string[]> = {}
): { signalScore: number; tier: "diamond" | "high" | "watch" | "low"; signals: ScoreSignal[]; noise: ScoreSignal[] } {
  const signals: ScoreSignal[] = [];
  const noise: ScoreSignal[]   = [];

  const gap        = (trade.date && trade.filed) ? daysBetween(trade.date, trade.filed) : 0;
  const isThisBuy  = isBuy(trade.type);
  const isLargeCap = LARGE_CAPS.has(trade.ticker);
  const isSell     = !isThisBuy;

  // 1. Obscure / small-cap ticker (+30) — purchase only
  if (isThisBuy && !isLargeCap) {
    signals.push({ label: "Obscure small-cap", pts: 30 });
  }

  // 2. Committee/sector overlap (+20)
  const sector = TICKER_SECTOR[trade.ticker];
  if (sector) {
    const nameKey = trade.representative.toLowerCase().trim();
    const memberCommittees = committeeMap[nameKey] || MEMBER_COMMITTEES[trade.representative] || [];
    const sectorCommittees  = SECTOR_COMMITTEE[sector] || [];
    const overlap = memberCommittees.find(mc =>
      sectorCommittees.some(sc => mc.includes(sc) || sc.includes(mc))
    );
    if (overlap) {
      signals.push({ label: `On ${overlap} — oversees ${sector} sector`, pts: 20 });
    }
  }

  // 3. Bipartisan buy (+15)
  if (isThisBuy && (trade.party === "D" || trade.party === "R")) {
    const oppositeParty = trade.party === "D" ? "R" : "D";
    const hasOpposite = allTrades.some(
      t =>
        t.ticker === trade.ticker &&
        t.party === oppositeParty &&
        isBuy(t.type) &&
        t.representative !== trade.representative &&
        daysBetween(trade.date, t.date) <= 30
    );
    if (hasOpposite) {
      signals.push({ label: "Bipartisan buy — D & R both purchasing within 30 days", pts: 15 });
    }
  }

  // 4. Near 52-week low (+15)
  const pd = priceData[trade.ticker];
  if (pd && pd.currentPrice <= pd.low52 * 1.20) {
    signals.push({ label: "Trading near 52-week low", pts: 15 });
  }

  // 5. Multiple members buying same obscure ticker (+25)
  // Threshold: >= 2 OTHER buyers (3 total) to prevent stacking with +30 obscure signal
  if (isThisBuy && !isLargeCap) {
    const otherBuyers = new Set(
      allTrades
        .filter(t => t.ticker === trade.ticker && isBuy(t.type) && t.representative !== trade.representative)
        .map(t => t.representative)
    );
    if (otherBuyers.size >= 2) {
      signals.push({ label: `${otherBuyers.size + 1} members buying this obscure ticker`, pts: 25 });
    }
  }

  // 6. Filed quickly (+10) — 5 days or fewer
  if (gap > 0 && gap <= 5 && trade.date && trade.filed) {
    signals.push({ label: `Filed within ${gap} day${gap === 1 ? "" : "s"} — unusually prompt`, pts: 10 });
  }

  // 7. Near the 45-day legal limit (+8)
  if (gap >= 40 && trade.date && trade.filed) {
    signals.push({ label: `Filed ${gap}d after trade — near the 45-day limit`, pts: 8 });
  }

  // ── SUBTRACTIVE NOISE ───────────────────────────────────────────────────────

  if (isLargeCap) {
    noise.push({ label: "Household name ticker", pts: -40 });
  }

  const tickerCount = allTrades.filter(t => t.ticker === trade.ticker).length;
  if (tickerCount >= 10) {
    noise.push({ label: "Frequently traded by Congress", pts: -15 });
  }

  const memberCount = allTrades.filter(t => t.representative === trade.representative).length;
  if (memberCount >= 20) {
    noise.push({ label: "High-volume congressional trader", pts: -15 });
  }

  if (isSell) {
    noise.push({ label: "Sell transaction (less predictive)", pts: -10 });
  }

  const raw = [
    ...signals.map(s => s.pts),
    ...noise.map(n => n.pts),
  ].reduce((a, b) => a + b, 0);

  const signalScore = Math.min(100, Math.max(0, raw));

  const tier: "diamond" | "high" | "watch" | "low" =
    signalScore >= 60 ? "diamond" :
    signalScore >= 40 ? "high"    :
    signalScore >= 20 ? "watch"   : "low";

  return { signalScore, tier, signals, noise };
}

const COMMITTEE_URL = "https://theunitedstates.io/congress-legislators/committee-membership-current.json";
const committeeCache = new NodeCache({ stdTTL: 86400 });

async function fetchCommitteeMap(): Promise<Record<string, string[]>> {
  const cached = committeeCache.get<Record<string, string[]>>("committee_map");
  if (cached) return cached;

  try {
    const res = await axios.get<Record<string, { name: string; members: Array<{ name: string }> }>>(
      COMMITTEE_URL, { headers: { Accept: "application/json" }, timeout: 10000 }
    );
    const map: Record<string, string[]> = {};
    for (const cmte of Object.values(res.data || {})) {
      const cmteName = cmte.name || "";
      for (const member of (cmte.members || [])) {
        const key = (member.name || "").toLowerCase().trim();
        if (!key) continue;
        if (!map[key]) map[key] = [];
        map[key].push(cmteName);
      }
    }
    for (const [name, cmtes] of Object.entries(MEMBER_COMMITTEES)) {
      const key = name.toLowerCase();
      map[key] = [...new Set([...cmtes, ...(map[key] || [])])];
    }
    committeeCache.set("committee_map", map);
    console.log(`[committees] loaded ${Object.keys(map).length} members`);
    return map;
  } catch {
    console.warn("[committees] fetch failed, using static fallback");
    const fallback: Record<string, string[]> = {};
    for (const [name, cmtes] of Object.entries(MEMBER_COMMITTEES)) {
      fallback[name.toLowerCase()] = cmtes;
    }
    return fallback;
  }
}

async function fetchAll(): Promise<RawQuiverTrade[]> {
  const cached = cache.get<RawQuiverTrade[]>(CACHE_KEY);
  if (cached) {
    console.log("[cache hit] quiver congress");
    return cached;
  }
  console.log("[fetch] quiver congress");
  const res = await axios.get<unknown>(QUIVER_URL, {
    headers: { Accept: "application/json" },
    timeout: 20000,
  });
  const data = Array.isArray(res.data) ? (res.data as RawQuiverTrade[]) : [];
  cache.set(CACHE_KEY, data);
  return data;
}

function normalizeRecord(t: RawQuiverTrade): Omit<Trade, "signalScore" | "tier" | "signals" | "noise"> {
  const chamber = t.House === "Senators" ? "Senate" : "House";
  return {
    ticker:         t.Ticker || "—",
    asset:          t.Description || t.Ticker || "—",
    representative: t.Representative || "Unknown",
    party:          t.Party || "?",
    state:          "—",
    chamber,
    type:           t.Transaction || "Purchase",
    amount:         t.Range || "$1,001 - $15,000",
    date:           t.TransactionDate || "",
    filed:          t.ReportDate || "",
    committees:     [],
  };
}

// ── DB persistence ────────────────────────────────────────────────────────────
async function upsertTrades(enriched: Trade[]): Promise<void> {
  if (!enriched.length) return;

  // FIX: Deduplicate within the incoming batch before inserting.
  // Quiver sometimes sends the same trade twice in a single response payload.
  // When two identical rows land in the same chunk, Postgres sees an intra-batch
  // conflict — onConflictDoUpdate only handles conflicts against *existing* rows,
  // not duplicates within the VALUES list itself. The result is the entire chunk
  // gets rejected, silently dropping ~60–70% of trades.
  const seen = new Set<string>();
  const deduped = enriched.filter(t => {
    const key = `${t.representative}|${t.ticker}|${t.date}|${t.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const skipped = enriched.length - deduped.length;
  if (skipped > 0) {
    console.log(`[db] deduped ${skipped} duplicate trades before insert`);
  }

  const CHUNK = 50;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK);
    try {
      await db
        .insert(tradesTable)
        .values(
          chunk.map(t => ({
            representative: t.representative,
            ticker:         t.ticker,
            date:           t.date,
            type:           t.type,
            asset:          t.asset,
            party:          t.party,
            state:          t.state,
            chamber:        t.chamber,
            amount:         t.amount,
            filed:          t.filed,
            committees:     t.committees,
            signalScore:    t.signalScore,
            tier:           t.tier,
            signals:        t.signals,
            noise:          t.noise,
            firstSeenAt:    new Date(),
            lastSeenAt:     new Date(),
          }))
        )
        .onConflictDoUpdate({
          target: [
            tradesTable.representative,
            tradesTable.ticker,
            tradesTable.date,
            tradesTable.type,
          ],
          set: {
            // Re-score on every upsert in case signals change
            asset:       sql`excluded.asset`,
            signalScore: sql`excluded.signal_score`,
            tier:        sql`excluded.tier`,
            signals:     sql`excluded.signals`,
            noise:       sql`excluded.noise`,
            committees:  sql`excluded.committees`,
            lastSeenAt:  sql`now()`,
          },
        });
    } catch (err) {
      // Non-fatal — log and continue. App still works off in-memory data.
      console.error(`[db] upsert chunk ${i}–${i + CHUNK} failed:`, err);
    }
  }
  console.log(`[db] upserted ${deduped.length} trades`);
}

// Read from DB — returns up to 200 trades from the last 90 days.
// FIX: Sort tiebreaker is now `filed` (the ReportDate from Quiver — when the
// member actually disclosed the trade) rather than `firstSeenAt` (when the
// row entered our DB). All trades from a single Quiver pull share the same
// firstSeenAt timestamp, so it was useless as a recency tiebreaker.
async function readTradesFromDb(): Promise<Trade[] | null> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const rows = await db
      .select()
      .from(tradesTable)
      .where(gte(tradesTable.firstSeenAt, cutoff))
      .orderBy(desc(tradesTable.signalScore), desc(tradesTable.filed))
      .limit(200);

    if (!rows.length) return null;

    return rows.map(r => ({
      ticker:         r.ticker,
      asset:          r.asset || r.ticker,
      representative: r.representative,
      party:          r.party || "?",
      state:          r.state || "—",
      chamber:        r.chamber || "House",
      type:           r.type,
      amount:         r.amount || "$1,001 - $15,000",
      date:           r.date,
      filed:          r.filed || "",
      committees:     (r.committees as string[]) || [],
      signalScore:    r.signalScore,
      tier:           r.tier as "diamond" | "high" | "watch" | "low",
      signals:        (r.signals as { label: string; pts: number }[]) || [],
      noise:          (r.noise   as { label: string; pts: number }[]) || [],
    }));
  } catch (err) {
    console.error("[db] read failed:", err);
    return null;
  }
}

export { cache };

// ── Routes ────────────────────────────────────────────────────────────────────
router.get("/trades", async (_req, res) => {
  try {
    const raw = await fetchAll();

    const normalized = raw
      .filter((t) => !t.TickerType || t.TickerType === "ST")
      .map(normalizeRecord)
      .filter((t) => t.ticker && t.ticker !== "—" && t.date);

    const uniqueTickers = [...new Set(normalized.map(t => t.ticker))].slice(0, 50);
    const [priceData, committeeMap] = await Promise.all([
      fetchPriceData(uniqueTickers).catch(() => ({})),
      fetchCommitteeMap().catch(() => ({})),
    ]);

    const enriched: Trade[] = normalized.map((trade) => {
      const { signalScore, tier, signals, noise } = computeScore(trade, normalized, priceData, committeeMap);
      return { ...trade, signalScore, tier, signals, noise };
    });

    // Persist to DB in the background — don't block the response
    upsertTrades(enriched).catch(err => console.error("[db] background upsert failed:", err));

    // Read from DB to return full 90-day history (not just today's Quiver window)
    const dbTrades = await readTradesFromDb();

    // Fall back to just the fresh Quiver data if DB read fails
    const result = dbTrades ?? enriched
      .sort((a, b) => {
        const scoreDiff = b.signalScore - a.signalScore;
        if (scoreDiff !== 0) return scoreDiff;
        return (b.filed || b.date) > (a.filed || a.date) ? 1 : -1;
      })
      .slice(0, 200);

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Trades fetch error:", msg);

    // Last resort: try to serve from DB even if Quiver is down
    const dbFallback = await readTradesFromDb().catch(() => null);
    if (dbFallback) {
      console.log("[db] serving from DB fallback after Quiver error");
      return res.json(dbFallback);
    }

    res.status(500).json({ error: msg });
  }
});

router.get("/house", async (_req, res) => {
  try {
    const raw = await fetchAll();
    const house = raw.filter((t) => t.House !== "Senators").map(normalizeRecord);
    res.json(house);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/senate", async (_req, res) => {
  try {
    const raw = await fetchAll();
    const senate = raw.filter((t) => t.House === "Senators").map(normalizeRecord);
    res.json(senate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/refresh", (_req, res) => {
  cache.flushAll();
  priceCache.flushAll();
  res.json({ ok: true, message: "Cache cleared" });
});

export default router;