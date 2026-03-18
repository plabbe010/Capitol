import { Router, type IRouter } from "express";
import axios from "axios";
import NodeCache from "node-cache";

const router: IRouter = Router();

const cache = new NodeCache({ stdTTL: 900 });

const QUIVER_URL =
  "https://api.quiverquant.com/beta/live/congresstrading";

const CACHE_KEY = "quiver_congress";

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
  const chamber =
    t.House === "Senators" ? "Senate" : "House";
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
  };
}

export { cache };

router.get("/trades", async (_req, res) => {
  try {
    const raw = await fetchAll();
    const all = raw
      .map(normalizeRecord)
      .filter((t) => t.ticker && t.ticker !== "—" && t.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 150);

    res.json(all);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Trades fetch error:", msg);
    res.status(500).json({ error: msg });
  }
});

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
