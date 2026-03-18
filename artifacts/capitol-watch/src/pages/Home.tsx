import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  useGetHealth,
  useGetTrades,
  useRefreshCache,
  getGetTradesQueryKey,
  generateSignal as apiGenerateSignal,
  generateSummary as apiGenerateSummary,
} from "@workspace/api-client-react";
import { 
  Shield, 
  Bell, 
  RefreshCw, 
  Star, 
  Search, 
  ChevronRight,
  TrendingUp,
  Activity,
  AlertCircle,
  X,
  Flame,
  CircleDot,
  ChevronDown,
  Minus,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ScoreSignal {
  label: string;
  pts: number;
}

export interface Trade {
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
  committees?: string[];
  signalScore: number;
  tier: "diamond" | "high" | "watch" | "low";
  signals: ScoreSignal[];
  noise: ScoreSignal[];
}

export interface SignalResult {
  signal: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
  confidence: number;
  summary: string;
  flag_note: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = "capitolwatch_v3";
const SEEN_KEY    = "capitolwatch_seen";

// Tier display config
const TIER_CONFIG: Record<string, { label: string; Icon: React.ElementType; color: string; bg: string; border: string; textClass: string }> = {
  diamond: { label: "Priority",  Icon: Flame,     color: "#A32D2D", bg: "bg-red-50",   border: "border-red-200",   textClass: "text-red-700"   },
  high:    { label: "Elevated",  Icon: TrendingUp, color: "#854F0B", bg: "bg-amber-50", border: "border-amber-200", textClass: "text-amber-800" },
  watch:   { label: "Routine",   Icon: CircleDot,  color: "#3B6D11", bg: "bg-green-50", border: "border-green-200", textClass: "text-green-700" },
  low:     { label: "Noise",     Icon: Minus,      color: "#888780", bg: "bg-gray-50",  border: "border-gray-200",  textClass: "text-gray-500"  },
};

const SIGNAL_STYLE = {
  "Strong Buy":  { bg: "bg-green-100", color: "text-green-800", dot: "bg-green-500", border: "border-green-200" },
  "Buy":         { bg: "bg-blue-50",   color: "text-blue-700",  dot: "bg-blue-500",  border: "border-blue-200"  },
  "Hold":        { bg: "bg-yellow-50", color: "text-yellow-700",dot: "bg-yellow-500",border: "border-yellow-200"},
  "Sell":        { bg: "bg-orange-50", color: "text-orange-700",dot: "bg-orange-500",border: "border-orange-200"},
  "Strong Sell": { bg: "bg-red-100",   color: "text-red-800",   dot: "bg-red-500",   border: "border-red-200"   },
};

// Demo trades with new scoring schema
const DEMO_TRADES: Trade[] = [
  {
    ticker:"SSYS", asset:"Stratasys Ltd", representative:"Debbie Wasserman Schultz", party:"D", state:"FL", chamber:"House",
    type:"Purchase", amount:"$1,001 - $15,000", date:"2026-01-20", filed:"2026-01-21", committees:["Appropriations"],
    signalScore:70, tier:"diamond",
    signals:[
      {label:"Obscure small-cap", pts:30},
      {label:"2 members buying this obscure ticker", pts:25},
      {label:"Bipartisan buy — D & R both purchasing within 30 days", pts:15},
    ],
    noise:[],
  },
  {
    ticker:"SSYS", asset:"Stratasys Ltd", representative:"Julia Letlow", party:"R", state:"LA", chamber:"House",
    type:"Purchase", amount:"$1,001 - $15,000", date:"2026-01-25", filed:"2026-01-27", committees:["Armed Services","Agriculture"],
    signalScore:70, tier:"diamond",
    signals:[
      {label:"Obscure small-cap", pts:30},
      {label:"2 members buying this obscure ticker", pts:25},
      {label:"Bipartisan buy — D & R both purchasing within 30 days", pts:15},
    ],
    noise:[],
  },
  {
    ticker:"LMT", asset:"Lockheed Martin Corp", representative:"Michael McCaul", party:"R", state:"TX", chamber:"House",
    type:"Purchase", amount:"$250,001 - $500,000", date:"2026-01-22", filed:"2026-02-18", committees:["Foreign Affairs"],
    signalScore:50, tier:"high",
    signals:[
      {label:"Obscure small-cap", pts:30},
      {label:"On Foreign Affairs — oversees defense sector", pts:20},
      {label:"Bipartisan buy — D & R both purchasing within 30 days", pts:15},
    ],
    noise:[{label:"Frequently traded by Congress", pts:-15}],
  },
  {
    ticker:"LMT", asset:"Lockheed Martin Corp", representative:"Ro Khanna", party:"D", state:"CA", chamber:"House",
    type:"Purchase", amount:"$15,001 - $50,000", date:"2026-01-28", filed:"2026-02-24", committees:["Armed Services","Science, Space & Technology"],
    signalScore:50, tier:"high",
    signals:[
      {label:"Obscure small-cap", pts:30},
      {label:"On Armed Services — oversees defense sector", pts:20},
      {label:"Bipartisan buy — D & R both purchasing within 30 days", pts:15},
    ],
    noise:[{label:"Frequently traded by Congress", pts:-15}],
  },
  {
    ticker:"AEHR", asset:"Aehr Test Systems Inc", representative:"Marjorie Taylor Greene", party:"R", state:"GA", chamber:"House",
    type:"Purchase", amount:"$1,001 - $15,000", date:"2026-02-10", filed:"2026-02-11", committees:["Oversight","Homeland Security"],
    signalScore:40, tier:"high",
    signals:[
      {label:"Obscure small-cap", pts:30},
      {label:"Filed within 1 day — unusually prompt", pts:10},
    ],
    noise:[],
  },
  {
    ticker:"OXY", asset:"Occidental Petroleum Corp", representative:"Dan Crenshaw", party:"R", state:"TX", chamber:"House",
    type:"Purchase", amount:"$15,001 - $50,000", date:"2026-01-05", filed:"2026-02-18", committees:["Armed Services","Energy & Commerce"],
    signalScore:28, tier:"watch",
    signals:[
      {label:"On Energy & Commerce — oversees energy sector", pts:20},
      {label:"Filed 44d after trade — near the 45-day limit", pts:8},
    ],
    noise:[],
  },
  {
    ticker:"ICHR", asset:"Ichor Holdings Ltd", representative:"Gilbert Cisneros", party:"D", state:"CA", chamber:"House",
    type:"Purchase", amount:"$1,001 - $15,000", date:"2025-12-10", filed:"2026-01-21", committees:["Armed Services"],
    signalScore:38, tier:"watch",
    signals:[
      {label:"Obscure small-cap", pts:30},
      {label:"Filed 42d after trade — near the 45-day limit", pts:8},
    ],
    noise:[],
  },
  {
    ticker:"AMZN", asset:"Amazon.com Inc", representative:"Nancy Pelosi", party:"D", state:"CA", chamber:"House",
    type:"Purchase", amount:"$500,001 - $1,000,000", date:"2026-01-03", filed:"2026-01-28", committees:["Financial Services"],
    signalScore:0, tier:"low",
    signals:[],
    noise:[
      {label:"Household name ticker", pts:-40},
      {label:"Frequently traded by Congress", pts:-15},
      {label:"High-volume congressional trader", pts:-15},
    ],
  },
  {
    ticker:"NVDA", asset:"NVIDIA Corporation", representative:"Josh Gottheimer", party:"D", state:"NJ", chamber:"House",
    type:"Purchase", amount:"$15,001 - $50,000", date:"2026-01-12", filed:"2026-02-05", committees:["Financial Services"],
    signalScore:0, tier:"low",
    signals:[],
    noise:[
      {label:"Household name ticker", pts:-40},
      {label:"Frequently traded by Congress", pts:-15},
    ],
  },
  {
    ticker:"PFE", asset:"Pfizer Inc", representative:"Katie Porter", party:"D", state:"CA", chamber:"House",
    type:"Sale (Full)", amount:"$50,001 - $100,000", date:"2026-01-30", filed:"2026-02-24", committees:["Oversight"],
    signalScore:0, tier:"low",
    signals:[],
    noise:[
      {label:"Household name ticker", pts:-40},
      {label:"Sell transaction (less predictive)", pts:-10},
      {label:"Frequently traded by Congress", pts:-15},
    ],
  },
  {
    ticker:"MSFT", asset:"Microsoft Corp", representative:"Kevin McCarthy", party:"R", state:"CA", chamber:"House",
    type:"Purchase", amount:"$15,001 - $50,000", date:"2026-02-03", filed:"2026-02-28", committees:["Rules"],
    signalScore:0, tier:"low",
    signals:[],
    noise:[
      {label:"Household name ticker", pts:-40},
      {label:"Frequently traded by Congress", pts:-15},
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function amountMid(s: string) {
  const m: Record<string, number> = {
    "$1,001 - $15,000": 8000,
    "$15,001 - $50,000": 32500,
    "$50,001 - $100,000": 75000,
    "$100,001 - $250,000": 175000,
    "$250,001 - $500,000": 375000,
    "$500,001 - $1,000,000": 750000,
    "$1,000,001 - $5,000,000": 3000000,
    "Over $5,000,000": 5000000,
  };
  return m[s] || 8000;
}

function fmtMoney(n: number) {
  if (n >= 1e6) return `$${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`;
  return `$${n}`;
}

function daysAgo(d: string) { 
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); 
}

function isBuy(t: Trade) { 
  return t.type?.toLowerCase().includes("purchase"); 
}

function pc(p: string) {
  const map: Record<string, string> = {
    D: "bg-blue-100 text-blue-800",
    R: "bg-red-100 text-red-800",
    I: "bg-purple-100 text-purple-800"
  };
  return map[p] || "bg-gray-100 text-gray-700";
}

interface StorageData {
  watchlist?: string[];
  watchMembers?: string[];
  signals?: Record<string, SignalResult>;
  weekSummary?: string;
}

function loadStorage(): StorageData { 
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as StorageData; } catch { return {}; } 
}
function saveStorage(d: StorageData) { 
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} 
}
function loadSeen(): Set<string> { 
  try { return new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]") as string[]); } catch { return new Set(); } 
}
function saveSeen(s: Set<string>) { 
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch {} 
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function CapitolWatch() {
  const store = loadStorage();

  const [trades, setTrades] = useState<Trade[]>(DEMO_TRADES);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [usingDemo, setUsingDemo] = useState(true);

  const [tab, setTab] = useState("feed");
  const [watchlist, setWatchlist] = useState<string[]>(store.watchlist || []);
  const [watchMembers, setWatchMembers] = useState<string[]>(store.watchMembers || []);

  const [filterParty, setFilterParty] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [filterChamber, setFilterChamber] = useState("All");
  const [filterTier, setFilterTier] = useState("All");
  const [filterScore, setFilterScore] = useState(20); // default 20+ threshold
  const [search, setSearch] = useState("");

  const [signals, setSignals] = useState<Record<string, SignalResult>>(store.signals || {});
  const [signalLoading, setSignalLoading] = useState<Record<string, boolean>>({});
  const [weekSummary, setWeekSummary] = useState(store.weekSummary || "");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [expandedTrade, setExpandedTrade] = useState<number | null>(null);
  const [newAlerts, setNewAlerts] = useState<Trade[]>([]);

  const seenRef = useRef(loadSeen());

  const { data: healthData } = useGetHealth();

  const {
    data: tradesData,
    isLoading: tradesLoading,
    error: tradesError,
    refetch: refetchTrades,
  } = useGetTrades({
    query: {
      queryKey: getGetTradesQueryKey(),
      enabled: !!healthData?.hasKey,
      retry: 1,
    },
  });

  const { mutateAsync: bustCacheMutation } = useRefreshCache();

  useEffect(() => {
    if (tradesData && Array.isArray(tradesData) && tradesData.length > 0) {
      setTrades(tradesData as Trade[]);
      setUsingDemo(false);
      setFetchError("");
    } else if (tradesError) {
      const errMsg = tradesError instanceof Error ? tradesError.message : "Failed to load trades";
      setFetchError(errMsg);
      setUsingDemo(true);
    }
    if (tradesLoading) setLoading(true);
    else setLoading(false);
  }, [tradesData, tradesLoading, tradesError]);

  useEffect(() => {
    saveStorage({ watchlist, watchMembers, signals, weekSummary });
  }, [watchlist, watchMembers, signals, weekSummary]);

  useEffect(() => {
    const key = (t: Trade) => `${t.representative}|${t.ticker}|${t.date}`;
    const alerts = trades.filter(t =>
      (watchlist.includes(t.ticker) || watchMembers.includes(t.representative)) &&
      !seenRef.current.has(key(t))
    );
    setNewAlerts(alerts);
  }, [trades, watchlist, watchMembers]);

  function dismissAlerts() {
    const key = (t: Trade) => `${t.representative}|${t.ticker}|${t.date}`;
    newAlerts.forEach(t => seenRef.current.add(key(t)));
    saveSeen(seenRef.current);
    setNewAlerts([]);
  }

  async function handleRefresh(bust = false) {
    setLoading(true);
    setFetchError("");
    try {
      if (bust) await bustCacheMutation();
      await refetchTrades();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Refresh failed";
      setFetchError(errMsg);
      setUsingDemo(true);
    }
    setLoading(false);
  }

  async function generateSignal(trade: Trade) {
    const key = trade.ticker;
    if (signals[key] || signalLoading[key]) return;
    setSignalLoading(p => ({ ...p, [key]: true }));

    const related = trades.filter(t => t.ticker === key);
    const buys = related.filter(isBuy).length;
    const sells = related.length - buys;
    const val = related.reduce((s, t) => s + amountMid(t.amount), 0);
    const members = [...new Set(related.map(t => t.representative))];
    const flags = (trade.signals || []).map(s => s.label);

    try {
      const parsed = await apiGenerateSignal({
        ticker: key,
        asset: trade.asset,
        buys,
        sells,
        totalValue: val,
        members,
        flags,
        committees: trade.committees || [],
      });
      setSignals(p => ({ ...p, [key]: parsed as SignalResult }));
    } catch {
      setSignals(p => ({ ...p, [key]: { signal: "Hold", confidence: 50, summary: "Could not generate signal.", flag_note: "" } }));
    }
    setSignalLoading(p => ({ ...p, [key]: false }));
  }

  async function generateSummary() {
    setSummaryLoading(true);

    const topTrades = [...trades]
      .sort((a, b) => b.signalScore - a.signalScore)
      .slice(0, 5)
      .map(t =>
        `${t.ticker} (${t.asset}) — ${t.representative} (${t.party}) — Score: ${t.signalScore} — Signals: ${(t.signals||[]).map(s=>s.label).join(", ")}`
      )
      .join("\n");

    try {
      const parsed = await apiGenerateSummary({ digest: topTrades });
      setWeekSummary(parsed.summary || "Could not parse summary.");
    } catch { 
      setWeekSummary("Could not generate summary."); 
    }
    setSummaryLoading(false);
  }

  // ── Derived State ───────────────────────────────────────────────────────────
  // Trades are already sorted by signalScore descending from the backend.
  // For demo data, sort them client-side as well.
  const sortedTrades = [...trades].sort((a, b) => {
    const scoreDiff = b.signalScore - a.signalScore;
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const filtered = sortedTrades.filter(t => {
    if (filterParty !== "All" && t.party !== filterParty) return false;
    if (filterType !== "All" && !t.type.toLowerCase().includes(filterType)) return false;
    if (filterChamber !== "All" && t.chamber !== filterChamber) return false;
    if (filterTier !== "All" && t.tier !== filterTier) return false;
    if (t.signalScore < filterScore) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.ticker.toLowerCase().includes(q) &&
          !t.representative.toLowerCase().includes(q) &&
          !t.asset.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  interface TickerEntry { ticker: string; asset: string; buys: number; sells: number; val: number; members: Set<string>; signalCount: number; }
  const tickerMap: Record<string, TickerEntry> = {};
  trades.forEach(t => {
    if (!tickerMap[t.ticker]) tickerMap[t.ticker] = { ticker:t.ticker, asset:t.asset, buys:0, sells:0, val:0, members:new Set(), signalCount:0 };
    tickerMap[t.ticker].val += amountMid(t.amount);
    tickerMap[t.ticker].members.add(t.representative);
    isBuy(t) ? tickerMap[t.ticker].buys++ : tickerMap[t.ticker].sells++;
    if (t.tier !== "low") tickerMap[t.ticker].signalCount++;
  });
  const topTickers = Object.values(tickerMap).sort((a, b) => b.val - a.val).slice(0, 12);

  interface MemberEntry { name: string; party: string; state: string; chamber: string; trades: number; val: number; }
  const memberMap: Record<string, MemberEntry> = {};
  trades.forEach(t => {
    if (!memberMap[t.representative]) memberMap[t.representative] = { name:t.representative, party:t.party, state:t.state, chamber:t.chamber, trades:0, val:0 };
    memberMap[t.representative].trades++;
    memberMap[t.representative].val += amountMid(t.amount);
  });
  const topMembers = Object.values(memberMap).sort((a, b) => b.val - a.val).slice(0, 12);
  const watchTrades = sortedTrades.filter(t => watchlist.includes(t.ticker) || watchMembers.includes(t.representative));

  const diamondCount = trades.filter(t => t.tier === "diamond").length;
  const highCount    = trades.filter(t => t.tier === "high").length;

  const toggleTicker = (t: string) => setWatchlist(w => w.includes(t) ? w.filter(x => x !== t) : [...w, t]);
  const toggleMember = (m: string) => setWatchMembers(w => w.includes(m) ? w.filter(x => x !== m) : [...w, m]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground pb-20">

      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl md:text-2xl font-serif mt-1 tracking-wide">Capitol Watch</span>

            {usingDemo ? (
              <span className="ml-2 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                demo data
              </span>
            ) : (
              <span className="ml-2 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-green-50 text-green-700 border border-green-200 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse-slow"></span>
                live tracking
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {loading && <span className="text-sm text-muted-foreground hidden sm:block">Fetching fresh data...</span>}
            {fetchError && (
              <span className="text-sm text-destructive flex items-center gap-1" title={fetchError}>
                <AlertCircle className="w-4 h-4" /> Error loading
              </span>
            )}

            <button 
              onClick={() => handleRefresh(true)}
              className="px-4 py-2 rounded-lg bg-white border border-border text-sm font-medium hover:bg-gray-50 hover:text-primary transition-all flex items-center gap-2"
              disabled={loading}
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh Data</span>
            </button>
          </div>
        </div>
      </header>

      {/* ALERT BANNER */}
      {newAlerts.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 animate-fade-in">
          <div className="max-w-6xl mx-auto flex items-center justify-between text-amber-800">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium">
                {newAlerts.length} new trade{newAlerts.length > 1 ? "s" : ""} detected for watched items: <span className="font-bold">{[...new Set(newAlerts.map(t=>t.ticker))].join(", ")}</span>
              </span>
            </div>
            <button onClick={dismissAlerts} className="text-sm font-medium hover:underline opacity-80 hover:opacity-100">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* STATS BAR */}
      <div className="bg-white border-b border-border shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border">
            {[
              { label: "Trades Tracked",  value: trades.length,  sub: "all disclosures",       color: "",              icon: Activity    },
              { label: "Priority",         value: diamondCount,   sub: "score 60+",             color: "text-red-600",  icon: Flame       },
              { label: "Elevated",         value: highCount,      sub: "score 40–59",           color: "text-amber-700",icon: TrendingUp  },
              { label: "Watchlist",        value: watchlist.length + watchMembers.length, sub: `${newAlerts.length} recent alerts`, color: newAlerts.length ? "text-amber-600" : "", icon: Star },
            ].map((s, i) => (
              <div key={i} className="px-3 md:px-4 py-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{s.label}</div>
                  <s.icon className="w-3.5 h-3.5 text-gray-300" />
                </div>
                <div className={cn("text-[28px] font-serif leading-tight mb-0", s.color)}>{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-4">

        {/* TABS */}
        <div className="flex overflow-x-auto scrollbar-custom border-b border-border mb-4 gap-6">
          {[
            { id: "feed", label: "Trade Feed" },
            { id: "tickers", label: "Top Tickers" },
            { id: "members", label: "Members" },
            { id: "watchlist", label: `Watchlist (${watchlist.length + watchMembers.length})` }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "pb-2 text-sm font-medium transition-all whitespace-nowrap border-b-2",
                tab === item.id 
                  ? "border-primary text-primary" 
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* ══ FEED ══════════════════════════════════════════════════════════ */}
        {tab === "feed" && (
          <div className="animate-fade-in grid grid-cols-1 lg:grid-cols-12 gap-8">

            <div className="lg:col-span-8">
              {/* FILTERS */}
              <div className="bg-white p-3 rounded-2xl border border-card-border shadow-sm mb-2 flex flex-col gap-2">
                {/* Row 1: Search + party/type/chamber toggles */}
                <div className="flex flex-col md:flex-row gap-2 items-center justify-between">
                  <div className="relative w-full md:w-56">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="Search ticker, member..." 
                      className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-custom">
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                      {["All", "D", "R"].map(p => (
                        <button 
                          key={p} 
                          onClick={() => setFilterParty(p)} 
                          className={cn(
                            "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                            filterParty === p ? "bg-white shadow-sm text-primary" : "text-gray-500 hover:text-gray-900"
                          )}
                        >
                          {p === "All" ? "All" : p === "D" ? "Dem" : "Rep"}
                        </button>
                      ))}
                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                      {["All", "purchase", "sale"].map(t => (
                        <button 
                          key={t} 
                          onClick={() => setFilterType(t)} 
                          className={cn(
                            "px-2.5 py-1 text-xs font-medium rounded-md transition-all capitalize",
                            filterType === t ? "bg-white shadow-sm text-primary" : "text-gray-500 hover:text-gray-900"
                          )}
                        >
                          {t === "All" ? "All" : t === "purchase" ? "Purchase" : "Sale"}
                        </button>
                      ))}
                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                      {["All", "House", "Senate"].map(ch => (
                        <button 
                          key={ch} 
                          onClick={() => setFilterChamber(ch)} 
                          className={cn(
                            "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                            filterChamber === ch ? "bg-white shadow-sm text-primary" : "text-gray-500 hover:text-gray-900"
                          )}
                        >
                          {ch}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Row 2: Tier filter + score threshold */}
                <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-1.5">
                  <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Tier:</span>
                  {[
                    { key: "All",     label: "All" },
                    { key: "diamond", label: "Priority" },
                    { key: "high",    label: "Elevated" },
                    { key: "watch",   label: "Routine" },
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setFilterTier(f.key)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border",
                        filterTier === f.key
                          ? f.key === "diamond" ? "bg-blue-100 text-blue-800 border-blue-200"
                          : f.key === "high"    ? "bg-green-100 text-green-800 border-green-200"
                          : f.key === "watch"   ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-primary/10 text-primary border-primary/20"
                          : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}

                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Min score:</span>
                    {[{ v: 0, label: "All" }, { v: 20, label: "20+" }, { v: 40, label: "40+" }, { v: 60, label: "60+" }].map(o => (
                      <button
                        key={o.v}
                        onClick={() => setFilterScore(o.v)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border",
                          filterScore === o.v
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Trade count */}
              <div className="text-[11px] text-gray-400 mb-1.5 px-1">
                {filtered.length} trade{filtered.length !== 1 ? "s" : ""} shown
              </div>

              {/* TRADE FEED LIST */}
              <div className="space-y-1">
                {filtered.length === 0 && (
                  <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
                    <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No trades match your filters.</p>
                    <button onClick={() => { setSearch(""); setFilterParty("All"); setFilterType("All"); setFilterChamber("All"); setFilterTier("All"); setFilterScore(0); }} className="mt-2 text-sm text-primary hover:underline">Clear filters</button>
                  </div>
                )}

                {filtered.map((trade, i) => {
                  const tierCfg = TIER_CONFIG[trade.tier] || TIER_CONFIG["low"];
                  const isExp = expandedTrade === i;
                  const sig = signals[trade.ticker];
                  const sigStyle = sig ? (SIGNAL_STYLE[sig.signal] || SIGNAL_STYLE["Hold"]) : null;
                  const tradeSignals = trade.signals || [];
                  const tradeNoise   = trade.noise   || [];

                  return (
                    <div key={i}>
                      <div 
                        className={cn(
                          "border rounded-xl py-2.5 px-3.5 bg-white transition-all duration-200 animate-fade-in hover:shadow-md cursor-pointer",
                          isExp ? "ring-2 ring-primary/20 border-primary" : "border-card-border"
                        )}
                        onClick={() => { setExpandedTrade(isExp ? null : i); if(!sig) generateSignal(trade); }}
                      >
                        <div className="flex gap-3 items-center">
                          {/* Ticker chip — colored by buy/sell */}
                          <div className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0",
                            isBuy(trade) ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-orange-50 text-orange-700 border border-orange-100"
                          )}>
                            {trade.ticker.slice(0,5)}
                          </div>

                          {/* Center: member + asset */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-[13px] text-gray-900">{trade.representative}</span>
                              <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase", pc(trade.party))}>
                                {trade.party}
                              </span>
                              <span className="text-[11px] text-gray-500 hidden sm:inline-block">
                                {trade.chamber} · {trade.state}
                              </span>
                            </div>
                            <div className="text-[12px] text-gray-600 truncate">{trade.asset} <span className="text-gray-400">({trade.ticker})</span></div>
                          </div>

                          {/* Right: score bar + score + tier + meta */}
                          <div className="flex flex-col items-end gap-1 shrink-0 min-w-[120px]">
                            {/* Score bar */}
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${trade.signalScore}%`,
                                  backgroundColor: tierCfg.color,
                                }}
                              />
                            </div>
                            {/* Score number + tier pill + meta */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-gray-400">{daysAgo(trade.date)}d ago</span>
                              <span className="text-[11px] font-medium text-gray-600">{fmtMoney(amountMid(trade.amount))}</span>
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[11px] font-semibold",
                                isBuy(trade) ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
                              )}>
                                {isBuy(trade) ? "Buy" : "Sell"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13px] font-bold" style={{ color: tierCfg.color }}>{trade.signalScore}</span>
                              <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1", tierCfg.bg, tierCfg.textClass, tierCfg.border)}>
                                <tierCfg.Icon className="w-2.5 h-2.5" />
                                {tierCfg.label}
                              </span>
                              <ChevronDown className={cn("w-3 h-3 text-gray-400 transition-transform", isExp && "rotate-180")} />
                            </div>
                          </div>
                        </div>

                        {/* EXPANDED STATE */}
                        {isExp && (
                          <div className="mt-3 pt-3 border-t border-gray-100 animate-fade-in">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                              {/* Left Column: Score breakdown + AI */}
                              <div className="space-y-4">
                                {/* Score breakdown */}
                                <div className="rounded-xl p-3 border border-gray-200 bg-gray-50">
                                  <div className="text-xs font-bold uppercase tracking-wider mb-2 text-gray-600">Score Breakdown</div>
                                  <div className="space-y-1">
                                    {tradeSignals.map((s, si) => (
                                      <div key={si} className="flex items-center justify-between text-[12px]">
                                        <span className="text-gray-700">{s.label}</span>
                                        <span className="font-bold text-green-600 ml-2 shrink-0">+{s.pts}</span>
                                      </div>
                                    ))}
                                    {tradeNoise.map((n, ni) => (
                                      <div key={ni} className="flex items-center justify-between text-[12px]">
                                        <span className="text-gray-500">{n.label}</span>
                                        <span className="font-bold text-gray-400 ml-2 shrink-0">{n.pts}</span>
                                      </div>
                                    ))}
                                    {(tradeSignals.length > 0 || tradeNoise.length > 0) && (
                                      <div className="flex items-center justify-between text-[12px] border-t border-gray-200 pt-1 mt-1">
                                        <span className="font-bold text-gray-700">Total score</span>
                                        <span className="font-bold" style={{ color: tierCfg.color }}>{trade.signalScore} / 100</span>
                                      </div>
                                    )}
                                    {tradeSignals.length === 0 && tradeNoise.length === 0 && (
                                      <p className="text-[12px] text-gray-400 italic">No signals triggered for this trade.</p>
                                    )}
                                  </div>
                                </div>

                                {/* AI Analysis */}
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center">
                                      <Star className="w-3 h-3 text-indigo-600 fill-indigo-600" />
                                    </div>
                                    <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">AI Analysis</span>
                                  </div>

                                  {signalLoading[trade.ticker] && (
                                    <div className="flex items-center gap-2 text-sm text-indigo-600">
                                      <RefreshCw className="w-4 h-4 animate-spin" /> Analyzing position...
                                    </div>
                                  )}

                                  {sig && sigStyle && (
                                    <div>
                                      <div className="flex items-center gap-3 mb-2">
                                        <span className={cn("px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border", sigStyle.bg, sigStyle.color, sigStyle.border)}>
                                          <span className={cn("w-1.5 h-1.5 rounded-full", sigStyle.dot)} />
                                          {sig.signal}
                                        </span>
                                        <span className="text-xs font-medium text-slate-500">{sig.confidence}% confidence</span>
                                      </div>
                                      <p className="text-sm text-slate-700 leading-relaxed mb-2">{sig.summary}</p>
                                      {sig.flag_note && (
                                        <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded border border-amber-100 italic">
                                          <strong>Note:</strong> {sig.flag_note}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Right Column: Details & Actions */}
                              <div className="space-y-4">
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-sm space-y-2">
                                  <div className="flex justify-between border-b border-gray-200 pb-2">
                                    <span className="text-gray-500">Transaction Date</span>
                                    <span className="font-medium text-gray-900">{trade.date}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-gray-200 pb-2">
                                    <span className="text-gray-500">Disclosure Filed</span>
                                    <span className="font-medium text-gray-900">{trade.filed}</span>
                                  </div>
                                  {trade.committees && trade.committees.length > 0 && (
                                    <div className="pt-1">
                                      <span className="text-gray-500 block mb-1">Committees</span>
                                      <div className="flex flex-wrap gap-1">
                                        {trade.committees.map(c => (
                                          <span key={c} className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">{c}</span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-col gap-2">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); toggleMember(trade.representative); }}
                                    className={cn(
                                      "w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex justify-center items-center gap-2 border",
                                      watchMembers.includes(trade.representative) 
                                        ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" 
                                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                                    )}
                                  >
                                    <Star className={cn("w-4 h-4", watchMembers.includes(trade.representative) && "fill-amber-500 text-amber-500")} />
                                    {watchMembers.includes(trade.representative) ? "Member Watched" : "Watch Member"}
                                  </button>

                                  <button 
                                    onClick={(e) => { e.stopPropagation(); toggleTicker(trade.ticker); }}
                                    className={cn(
                                      "w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex justify-center items-center gap-2 border",
                                      watchlist.includes(trade.ticker) 
                                        ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" 
                                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                                    )}
                                  >
                                    <Star className={cn("w-4 h-4", watchlist.includes(trade.ticker) && "fill-indigo-500 text-indigo-500")} />
                                    {watchlist.includes(trade.ticker) ? "Ticker Watched" : "Watch Ticker"}
                                  </button>
                                </div>
                              </div>

                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT SIDEBAR */}
            <div className="lg:col-span-4 space-y-6">
              {/* AI WEEKLY SUMMARY */}
              <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-2xl p-4 text-white shadow-xl shadow-blue-900/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <Star className="w-3.5 h-3.5 text-blue-100 fill-blue-100" />
                  </div>
                  <h3 className="font-serif text-lg tracking-wide">AI Market Pulse</h3>
                </div>

                <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm border border-white/10 mb-3 min-h-[90px]">
                  {summaryLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-blue-200 gap-3 py-4">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                      <span className="text-sm font-medium">Analyzing weekly patterns...</span>
                    </div>
                  ) : weekSummary ? (
                    <div className="space-y-1">
                      {weekSummary.split("•").filter(s => s.trim()).map((bullet, i) => (
                        <p key={i} style={{ fontSize: "13px", lineHeight: 1.8, fontWeight: "normal" }} className="text-blue-50">
                          • {bullet.trim()}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-blue-200/70 text-center py-4">
                      Generate an AI summary of congressional trading patterns based on the latest disclosures.
                    </p>
                  )}
                </div>

                <button 
                  onClick={generateSummary} 
                  disabled={summaryLoading}
                  className="w-full py-3 rounded-xl bg-white text-indigo-900 font-semibold text-sm hover:bg-blue-50 transition-colors shadow-lg disabled:opacity-80 disabled:cursor-not-allowed"
                >
                  {summaryLoading ? "Thinking..." : weekSummary ? "Regenerate Analysis" : "Generate Summary"}
                </button>
              </div>

              {/* QUICK WATCHLIST WIDGET */}
              <div className="bg-white rounded-2xl p-5 border border-card-border shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> Quick Watchlist
                </h3>

                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-2">Tickers ({watchlist.length})</div>
                    <div className="flex flex-wrap gap-2">
                      {watchlist.length === 0 ? <span className="text-sm text-gray-400">None</span> : 
                        watchlist.map(t => (
                          <div key={t} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold border border-indigo-100 flex items-center gap-1.5">
                            {t} <button onClick={()=>toggleTicker(t)} className="text-indigo-400 hover:text-indigo-900"><X className="w-3 h-3"/></button>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-2">Members ({watchMembers.length})</div>
                    <div className="flex flex-wrap gap-2">
                      {watchMembers.length === 0 ? <span className="text-sm text-gray-400">None</span> : 
                        watchMembers.map(m => (
                          <div key={m} className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold border border-amber-100 flex items-center gap-1.5">
                            {m.split(" ").slice(-1)[0]} <button onClick={()=>toggleMember(m)} className="text-amber-400 hover:text-amber-900"><X className="w-3 h-3"/></button>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ TICKERS ═══════════════════════════════════════════════════════ */}
        {tab === "tickers" && (
          <div className="animate-fade-in">
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="text-2xl font-serif text-gray-900">Most Traded Assets</h2>
                <p className="text-sm text-gray-500 mt-1">Ranked by estimated disclosed value. Click cards for AI signals.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {topTickers.map(t => {
                const sig = signals[t.ticker];
                const sigStyle = sig ? (SIGNAL_STYLE[sig.signal] || SIGNAL_STYLE["Hold"]) : null;
                const total = t.buys + t.sells;
                const buyPct = total > 0 ? Math.round((t.buys / total) * 100) : 0;
                const sample = trades.find(tr => tr.ticker === t.ticker);

                return (
                  <div 
                    key={t.ticker} 
                    className="bg-white border border-card-border rounded-2xl p-5 transition-all hover:shadow-lg hover:-translate-y-1 hover:border-gray-300 cursor-pointer group"
                    onClick={() => { if(sample) generateSignal(sample); }}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="text-2xl font-serif text-gray-900">{t.ticker}</div>
                        <div className="text-xs font-medium text-gray-500 truncate max-w-[150px]">{t.asset}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.signalCount > 0 && (
                          <div className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-[10px] font-bold border border-blue-100 flex items-center gap-1">
                            <Gem className="w-3 h-3" /> {t.signalCount}
                          </div>
                        )}
                        <button 
                          className={cn(
                            "p-2 rounded-xl transition-colors",
                            watchlist.includes(t.ticker) ? "bg-amber-100 text-amber-600" : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                          )}
                          onClick={(e) => { e.stopPropagation(); toggleTicker(t.ticker); }}
                        >
                          <Star className={cn("w-4 h-4", watchlist.includes(t.ticker) && "fill-amber-500")} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <div className="text-[10px] uppercase font-bold text-gray-400 mb-1">Est. Volume</div>
                        <div className="text-lg font-semibold text-gray-900">{fmtMoney(t.val)}</div>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-end justify-between">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-gray-400 mb-1">Members</div>
                          <div className="text-lg font-semibold text-gray-900">{t.members.size}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-green-600">{t.buys} B</div>
                          <div className="text-xs font-bold text-orange-600">{t.sells} S</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 mb-2">
                      <div className="h-2 w-full bg-orange-100 rounded-full overflow-hidden flex">
                        <div className="h-full bg-green-500 rounded-r-full transition-all duration-500" style={{ width: `${buyPct}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] font-bold uppercase">
                        <span className="text-green-600">{buyPct}% Buys</span>
                        <span className="text-orange-600">{100 - buyPct}% Sells</span>
                      </div>
                    </div>

                    {/* AI Signal Region */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      {sig && sigStyle ? (
                        <div className="animate-fade-in">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1", sigStyle.bg, sigStyle.color)}>
                              {sig.signal}
                            </span>
                            <span className="text-[11px] font-medium text-gray-500">{sig.confidence}% conf</span>
                          </div>
                          <p className="text-xs text-gray-600 leading-snug line-clamp-2 group-hover:line-clamp-none transition-all">{sig.summary}</p>
                        </div>
                      ) : signalLoading[t.ticker] ? (
                        <div className="flex items-center gap-2 text-xs font-medium text-indigo-600">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing position...
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs font-medium text-indigo-600 group-hover:text-indigo-800 transition-colors">
                          <Star className="w-3.5 h-3.5" /> Request AI Signal <ChevronRight className="w-3 h-3 ml-auto" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ MEMBERS ═══════════════════════════════════════════════════════ */}
        {tab === "members" && (
          <div className="animate-fade-in max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-serif text-gray-900">Top Trading Members</h2>
              <p className="text-sm text-gray-500 mt-1">Ranked by total estimated disclosed value in the recent period.</p>
            </div>

            <div className="bg-white rounded-2xl border border-card-border overflow-hidden shadow-sm">
              {topMembers.map((m, i) => (
                <div key={m.name} className="p-4 md:p-6 border-b border-gray-100 last:border-0 flex flex-col md:flex-row md:items-center gap-4 hover:bg-gray-50 transition-colors">

                  <div className="flex items-center gap-4 md:w-1/3">
                    <div className="w-8 text-center font-serif text-2xl text-gray-300">
                      {i + 1}
                    </div>
                    <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shadow-inner shrink-0", pc(m.party))}>
                      {m.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 leading-tight">{m.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                        <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", pc(m.party))}>{m.party}</span>
                        {m.chamber} · {m.state}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 px-12 md:px-0">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-medium text-gray-600">{m.trades} trades</span>
                      <span className="font-bold text-gray-900">{fmtMoney(m.val)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, (m.val / (topMembers[0]?.val || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => toggleMember(m.name)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all shrink-0",
                      watchMembers.includes(m.name)
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <Star className={cn("w-3.5 h-3.5", watchMembers.includes(m.name) && "fill-amber-500 text-amber-500")} />
                    {watchMembers.includes(m.name) ? "Watching" : "Watch"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ WATCHLIST ═════════════════════════════════════════════════════ */}
        {tab === "watchlist" && (
          <div className="animate-fade-in max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-serif text-gray-900">Your Watchlist</h2>
              <p className="text-sm text-gray-500 mt-1">Star any ticker or member in the other tabs to track their activity here and get alerts on new trades.</p>
            </div>

            {watchTrades.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
                <Star className="w-10 h-10 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 max-w-sm mx-auto">Star any ticker or member in the other tabs to track their activity here and get alerts on new trades.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {watchTrades.map((trade, i) => {
                  const tierCfg = TIER_CONFIG[trade.tier] || TIER_CONFIG["low"];
                  return (
                    <div key={i} className="border rounded-xl py-2.5 px-3.5 bg-white border-card-border hover:shadow-md transition-all">
                      <div className="flex gap-3 items-center">
                        <div className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0",
                          isBuy(trade) ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-orange-50 text-orange-700 border border-orange-100"
                        )}>
                          {trade.ticker.slice(0,5)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-[13px] text-gray-900">{trade.representative}</span>
                            <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase", pc(trade.party))}>
                              {trade.party}
                            </span>
                          </div>
                          <div className="text-[12px] text-gray-600 truncate">{trade.asset} <span className="text-gray-400">({trade.ticker})</span></div>
                          {(trade.signals || []).length > 0 && (
                            <div className="text-[11px] text-gray-500 truncate">{(trade.signals || [])[0].label}</div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-bold" style={{ color: tierCfg.color }}>{trade.signalScore}</span>
                            <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1", tierCfg.bg, tierCfg.textClass, tierCfg.border)}>
                              <tierCfg.Icon className="w-2.5 h-2.5" />
                              {tierCfg.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-gray-400">{daysAgo(trade.date)}d ago</span>
                            <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-semibold", isBuy(trade) ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700")}>
                              {isBuy(trade) ? "Buy" : "Sell"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}