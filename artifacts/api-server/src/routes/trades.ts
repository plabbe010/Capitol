import { Router, type IRouter } from "express";
import axios from "axios";
import NodeCache from "node-cache";

const router: IRouter = Router();

const cache = new NodeCache({ stdTTL: 900 });

const QUIVER_URL =
  "https://api.quiverquant.com/beta/live/congresstrading";

const CACHE_KEY = "quiver_congress";

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

const TICKER_SECTOR: Record<string, string> = {
  LMT: "defense", RTX: "defense", NOC: "defense", BA: "defense", GD: "defense", LHX: "defense", HII: "defense",
  XOM: "energy", CVX: "energy", COP: "energy", OXY: "energy", SLB: "energy", MPC: "energy", PSX: "energy",
  NVDA: "tech", MSFT: "tech", GOOGL: "tech", GOOG: "tech", AAPL: "tech", AMZN: "tech", META: "tech", ORCL: "tech", IBM: "tech", INTC: "tech", AMD: "tech", QCOM: "tech",
  PFE: "health", JNJ: "health", MRK: "health", ABBV: "health", LLY: "health", BMY: "health", AMGN: "health", UNH: "health", CVS: "health", HCA: "health",
  JPM: "finance", GS: "finance", MS: "finance", BAC: "finance", WFC: "finance", C: "finance", BLK: "finance", SCHW: "finance",
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
  "Thomas H. Kean Jr":         ["Financial Services"],
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
};

const LARGE_CAP_TICKERS = new Set(Object.keys(TICKER_SECTOR));

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
  flagTier: "alert" | "flag" | null;
  flagReasons: string[];
}

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

function computeFlags(trade: Trade, allTrades: Trade[]): { flagTier: "alert" | "flag" | null; flagReasons: string[] } {
  const alertReasons: string[] = [];
  const flagReasons: string[] = [];

  const gap = (trade.date && trade.filed) ? daysBetween(trade.date, trade.filed) : 0;
  const mid = amountMid(trade.amount);
  const isThisBuy = isBuy(trade.type);

  // ── ALERT CONDITIONS ────────────────────────────────────────────────────────

  // 1. First-time purchase of this ticker by this member
  if (isThisBuy) {
    const prevPurchase = allTrades.find(
      t =>
        t.representative === trade.representative &&
        t.ticker === trade.ticker &&
        isBuy(t.type) &&
        t.date < trade.date
    );
    if (!prevPurchase) {
      alertReasons.push(`First purchase of ${trade.ticker} by this member on record`);
    }
  }

  // 2. Bipartisan buy — opposite party also bought same ticker within 30 days
  if (isThisBuy && (trade.party === "D" || trade.party === "R")) {
    const oppositeParty = trade.party === "D" ? "R" : "D";
    const bipartisan = allTrades.some(
      t =>
        t.ticker === trade.ticker &&
        t.party === oppositeParty &&
        isBuy(t.type) &&
        t.representative !== trade.representative &&
        daysBetween(trade.date, t.date) <= 30
    );
    if (bipartisan) {
      alertReasons.push(`Bipartisan signal — both D & R buying within 30 days`);
    }
  }

  // 3. Committee/sector overlap
  const sector = TICKER_SECTOR[trade.ticker];
  if (sector) {
    const memberCommittees = MEMBER_COMMITTEES[trade.representative] || [];
    const sectorCommittees = SECTOR_COMMITTEE[sector] || [];
    const overlap = memberCommittees.find(mc =>
      sectorCommittees.some(sc => mc.includes(sc) || sc.includes(mc))
    );
    if (overlap) {
      alertReasons.push(`On ${overlap} committee — directly oversees this sector`);
    }
  }

  // 4. Filed at or near the 45-day legal limit
  if (gap >= 40 && trade.date && trade.filed) {
    alertReasons.push(`Filed ${gap} days after trade — pushed to the legal limit (45d max)`);
  }

  // ── FLAG CONDITIONS (only if no alerts) ────────────────────────────────────
  if (alertReasons.length === 0) {
    // 1. Large/notable position
    if (mid >= 250000) {
      flagReasons.push(`Large position — ~${fmtMoney(mid)} disclosed`);
    } else if (mid >= 50000) {
      const memberTrades = allTrades.filter(t => t.representative === trade.representative);
      const avgMid =
        memberTrades.length > 0
          ? memberTrades.reduce((s, t) => s + amountMid(t.amount), 0) / memberTrades.length
          : 0;
      if (avgMid > 0 && mid > avgMid * 3) {
        flagReasons.push(`3× larger than this member's typical trade`);
      } else {
        flagReasons.push(`Notable size — ~${fmtMoney(mid)} disclosed`);
      }
    }

    // 2. Slow disclosure (30-39 days)
    if (gap >= 30 && gap < 40 && trade.date && trade.filed) {
      flagReasons.push(`Slow to disclose — ${gap} days between trade and filing`);
    }

    // 3. Obscure/small-cap ticker (purchase only)
    if (isThisBuy && !LARGE_CAP_TICKERS.has(trade.ticker)) {
      flagReasons.push(`Obscure or small-cap ticker — not a typical congressional pick`);
    }
  }

  if (alertReasons.length > 0) {
    return { flagTier: "alert", flagReasons: alertReasons };
  }
  if (flagReasons.length > 0) {
    return { flagTier: "flag", flagReasons: flagReasons };
  }
  return { flagTier: null, flagReasons: [] };
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

function normalizeRecord(t: RawQuiverTrade): Trade {
  const chamber = t.House === "Senators" ? "Senate" : "House";
  return {
    ticker: t.Ticker || "—",
    asset: t.Description || "—",
    representative: t.Representative || "Unknown",
    party: t.Party || "?",
    state: "—",
    chamber,
    type: t.Transaction || "Purchase",
    amount: t.Range || "$1,001 - $15,000",
    date: t.TransactionDate || "",
    filed: t.ReportDate || "",
    committees: [],
    flagTier: null,
    flagReasons: [],
  };
}

export { cache };

router.get("/trades", async (_req, res) => {
  try {
    const raw = await fetchAll();

    const normalized = raw
      .filter((t) => !t.TickerType || t.TickerType === "ST")
      .map(normalizeRecord)
      .filter((t) => t.ticker && t.ticker !== "—" && t.date);

    const enriched = normalized.map((trade) => {
      const { flagTier, flagReasons } = computeFlags(trade, normalized);
      return { ...trade, flagTier, flagReasons };
    });

    const tierOrder = (t: Trade) => (t.flagTier === "alert" ? 0 : t.flagTier === "flag" ? 1 : 2);

    const sorted = enriched
      .sort((a, b) => {
        const tierDiff = tierOrder(a) - tierOrder(b);
        if (tierDiff !== 0) return tierDiff;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      })
      .slice(0, 150);

    res.json(sorted);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Trades fetch error:", msg);
    res.status(500).json({ error: msg });
  }
});

// /house and /senate return normalized records WITHOUT flag enrichment.
// computeFlags() requires the full combined dataset for bipartisan and
// first-purchase context, which these chamber-filtered views don't have.
// Consumers that need flagTier/flagReasons should use /trades instead.
router.get("/house", async (_req, res) => {
  try {
    const raw = await fetchAll();
    const house = raw
      .filter((t) => t.House !== "Senators")
      .map(normalizeRecord);
    res.json(house);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("House fetch error:", msg);
    res.status(500).json({ error: msg });
  }
});

router.get("/senate", async (_req, res) => {
  try {
    const raw = await fetchAll();
    const senate = raw
      .filter((t) => t.House === "Senators")
      .map(normalizeRecord);
    res.json(senate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Senate fetch error:", msg);
    res.status(500).json({ error: msg });
  }
});

router.post("/refresh", (_req, res) => {
  cache.flushAll();
  res.json({ ok: true, message: "Cache cleared" });
});

export default router;
