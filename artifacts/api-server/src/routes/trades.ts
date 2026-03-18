import { Router, type IRouter } from "express";
import axios from "axios";
import NodeCache from "node-cache";

const router: IRouter = Router();

const cache = new NodeCache({ stdTTL: 900 });

const HOUSE_URL =
  "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json";
const SENATE_URL =
  "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json";

async function fetchFree(url: string, label: string): Promise<unknown[]> {
  const cached = cache.get<unknown[]>(url);
  if (cached) {
    console.log(`[cache hit] ${label}`);
    return cached;
  }
  console.log(`[fetch] ${label}`);
  const res = await axios.get(url, {
    headers: { Accept: "application/json" },
    timeout: 20000,
  });
  const data = Array.isArray(res.data) ? res.data : [];
  cache.set(url, data);
  return data;
}

interface RawHouseTrade {
  ticker?: string;
  asset_description?: string;
  representative?: string;
  party?: string;
  state?: string;
  type?: string;
  amount?: string;
  transaction_date?: string;
  disclosure_date?: string;
}

interface RawSenateTrade {
  ticker?: string;
  asset_description?: string;
  senator?: string;
  party?: string;
  state?: string;
  type?: string;
  amount?: string;
  transaction_date?: string;
  disclosure_date?: string;
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

function normalizeHouse(arr: unknown[]): Trade[] {
  return (arr as RawHouseTrade[]).map((t) => ({
    ticker: t.ticker || "—",
    asset: t.asset_description || t.ticker || "—",
    representative: t.representative || "Unknown",
    party: t.party || "?",
    state: t.state || "—",
    chamber: "House",
    type: t.type || "Purchase",
    amount: t.amount || "$1,001 - $15,000",
    date: t.transaction_date || "",
    filed: t.disclosure_date || "",
    committees: [],
  }));
}

function normalizeSenate(arr: unknown[]): Trade[] {
  return (arr as RawSenateTrade[]).map((t) => ({
    ticker: t.ticker || "—",
    asset: t.asset_description || t.ticker || "—",
    representative: t.senator || "Unknown",
    party: t.party || "?",
    state: t.state || "—",
    chamber: "Senate",
    type: t.type || "Purchase",
    amount: t.amount || "$1,001 - $15,000",
    date: t.transaction_date || "",
    filed: t.disclosure_date || "",
    committees: [],
  }));
}

export { cache };

router.get("/trades", async (_req, res) => {
  try {
    const [house, senate] = await Promise.all([
      fetchFree(HOUSE_URL, "house"),
      fetchFree(SENATE_URL, "senate"),
    ]);

    const all = [...normalizeHouse(house), ...normalizeSenate(senate)]
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
    const data = await fetchFree(HOUSE_URL, "house");
    res.json(normalizeHouse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("House fetch error:", msg);
    res.status(500).json({ error: msg });
  }
});

router.get("/senate", async (_req, res) => {
  try {
    const data = await fetchFree(SENATE_URL, "senate");
    res.json(normalizeSenate(data));
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
