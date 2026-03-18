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
  Flag,
  ChevronRight,
  TrendingUp,
  Activity,
  AlertCircle,
  X
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
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
  isMemberFirst?: boolean;
}

export interface SignalResult {
  signal: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
  confidence: number;
  summary: string;
  flag_note: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = "capitolwatch_v2";
const SEEN_KEY    = "capitolwatch_seen";

const DEMO_TRADES: Trade[] = [
  { ticker:"ICHR", asset:"Ichor Holdings", representative:"Debbie Wasserman Schultz", party:"D", state:"FL", chamber:"House", type:"Purchase", amount:"$1,001 - $15,000", date:"2025-08-05", filed:"2025-08-28", committees:["Appropriations","Energy & Water"], isMemberFirst:true },
  { ticker:"NVDA", asset:"NVIDIA Corporation", representative:"Nancy Pelosi", party:"D", state:"CA", chamber:"House", type:"Purchase", amount:"$1,000,001 - $5,000,000", date:"2026-01-15", filed:"2026-02-10", committees:["Financial Services"], isMemberFirst:false },
  { ticker:"LMT", asset:"Lockheed Martin", representative:"Michael McCaul", party:"R", state:"TX", chamber:"House", type:"Purchase", amount:"$250,001 - $500,000", date:"2026-01-22", filed:"2026-02-18", committees:["Armed Services","Foreign Affairs"], isMemberFirst:false },
  { ticker:"XOM", asset:"Exxon Mobil", representative:"Dan Crenshaw", party:"R", state:"TX", chamber:"House", type:"Purchase", amount:"$50,001 - $100,000", date:"2026-01-20", filed:"2026-02-14", committees:["Energy & Commerce"], isMemberFirst:false },
  { ticker:"AMZN", asset:"Amazon.com Inc", representative:"Nancy Pelosi", party:"D", state:"CA", chamber:"House", type:"Purchase", amount:"$500,001 - $1,000,000", date:"2026-01-03", filed:"2026-01-28", committees:["Financial Services"], isMemberFirst:false },
  { ticker:"SSYS", asset:"Stratasys Ltd", representative:"Debbie Wasserman Schultz", party:"D", state:"FL", chamber:"House", type:"Purchase", amount:"$1,001 - $15,000", date:"2025-08-15", filed:"2025-09-02", committees:["Appropriations"], isMemberFirst:true },
  { ticker:"BA", asset:"Boeing Co", representative:"Kevin McCarthy", party:"R", state:"CA", chamber:"House", type:"Purchase", amount:"$500,001 - $1,000,000", date:"2026-02-03", filed:"2026-02-28", committees:["Rules"], isMemberFirst:false },
  { ticker:"MSFT", asset:"Microsoft Corp", representative:"Josh Gottheimer", party:"D", state:"NJ", chamber:"House", type:"Purchase", amount:"$15,001 - $50,000", date:"2026-01-12", filed:"2026-02-05", committees:["Financial Services"], isMemberFirst:false },
  { ticker:"PFE", asset:"Pfizer Inc", representative:"Katie Porter", party:"D", state:"CA", chamber:"House", type:"Sale (Full)", amount:"$50,001 - $100,000", date:"2026-01-30", filed:"2026-02-24", committees:["Oversight"], isMemberFirst:false },
  { ticker:"TSLA", asset:"Tesla Inc", representative:"Marjorie Taylor Greene", party:"R", state:"GA", chamber:"House", type:"Purchase", amount:"$1,001 - $15,000", date:"2026-02-01", filed:"2026-02-25", committees:["Oversight","Homeland Security"], isMemberFirst:false },
  { ticker:"CVX", asset:"Chevron Corp", representative:"Dan Crenshaw", party:"R", state:"TX", chamber:"House", type:"Purchase", amount:"$15,001 - $50,000", date:"2026-01-28", filed:"2026-02-22", committees:["Energy & Commerce"], isMemberFirst:false },
  { ticker:"GOOGL", asset:"Alphabet Inc", representative:"Suzan DelBene", party:"D", state:"WA", chamber:"House", type:"Purchase", amount:"$250,001 - $500,000", date:"2026-01-25", filed:"2026-02-20", committees:["Ways & Means","Agriculture"], isMemberFirst:false },
];

const SECTOR_COMMITTEE: Record<string, string[]> = {
  defense: ["Armed Services","Foreign Affairs","Military Construction"],
  energy:  ["Energy & Commerce","Energy & Water","Natural Resources"],
  tech:    ["Science, Space & Technology","Commerce"],
  health:  ["Energy & Commerce","Health"],
  finance: ["Financial Services","Ways & Means"],
};

const TICKER_SECTOR: Record<string, string> = {
  LMT:"defense", RTX:"defense", NOC:"defense", BA:"defense",
  XOM:"energy", CVX:"energy", COP:"energy",
  NVDA:"tech", MSFT:"tech", GOOGL:"tech", AAPL:"tech", AMZN:"tech",
  PFE:"health", JNJ:"health", MRK:"health",
  JPM:"finance", GS:"finance", MS:"finance",
};

const SIGNAL_STYLE = {
  "Strong Buy":  { bg: "bg-green-100", color: "text-green-800", dot: "bg-green-500", border: "border-green-200" },
  "Buy":         { bg: "bg-blue-50", color: "text-blue-700", dot: "bg-blue-500", border: "border-blue-200" },
  "Hold":        { bg: "bg-yellow-50", color: "text-yellow-700", dot: "bg-yellow-500", border: "border-yellow-200" },
  "Sell":        { bg: "bg-orange-50", color: "text-orange-700", dot: "bg-orange-500", border: "border-orange-200" },
  "Strong Sell": { bg: "bg-red-100", color: "text-red-800", dot: "bg-red-500", border: "border-red-200" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function amountMid(s: string) {
  const m: Record<string, number> = {
    "$1,001 - $15,000": 900000, "$15,001 - $50,000": 32500, "$50,001 - $100,000": 75000,
    "$100,001 - $250,000": 175000, "$250,001 - $500,000": 375000,
    "$500,001 - $1,000,000": 750000, "$1,000,001 - $5,000,000": 3000000, "Over $5,000,000": 5000000,
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

function flagTrade(trade: Trade) {
  const flags = [];
  if (trade.isMemberFirst) flags.push("First political buy in years");
  const sector = TICKER_SECTOR[trade.ticker];
  if (sector && trade.committees?.length) {
    const overlap = trade.committees.filter(c =>
      (SECTOR_COMMITTEE[sector] || []).some(r => c.includes(r))
    );
    if (overlap.length) flags.push(`On ${overlap[0]} committee`);
  }
  if (amountMid(trade.amount) > 200000 && trade.isMemberFirst)
    flags.push("Large position in obscure ticker");
  return flags;
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
    const flags = flagTrade(trade);

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
    const top = [...trades].sort((a, b) => amountMid(b.amount) - amountMid(a.amount)).slice(0, 10);
    const digest = top.map(t => `${t.representative} (${t.party}) ${t.type} ${t.ticker} — ${t.amount}`).join("\n");
    
    try {
      const parsed = await apiGenerateSummary({ digest });
      setWeekSummary(parsed.summary || "Could not parse summary.");
    } catch { 
      setWeekSummary("Could not generate summary."); 
    }
    setSummaryLoading(false);
  }

  // ── Derived State ───────────────────────────────────────────────────────────
  const filtered = trades.filter(t => {
    if (filterParty !== "All" && t.party !== filterParty) return false;
    if (filterType !== "All" && !t.type.toLowerCase().includes(filterType)) return false;
    if (filterChamber !== "All" && t.chamber !== filterChamber) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.ticker.toLowerCase().includes(q) &&
          !t.representative.toLowerCase().includes(q) &&
          !t.asset.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  interface TickerEntry { ticker: string; asset: string; buys: number; sells: number; val: number; members: Set<string>; flagCount: number; }
  const tickerMap: Record<string, TickerEntry> = {};
  trades.forEach(t => {
    if (!tickerMap[t.ticker]) tickerMap[t.ticker] = { ticker:t.ticker, asset:t.asset, buys:0, sells:0, val:0, members:new Set(), flagCount:0 };
    tickerMap[t.ticker].val += amountMid(t.amount);
    tickerMap[t.ticker].members.add(t.representative);
    isBuy(t) ? tickerMap[t.ticker].buys++ : tickerMap[t.ticker].sells++;
    if (flagTrade(t).length) tickerMap[t.ticker].flagCount++;
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
  const watchTrades = trades.filter(t => watchlist.includes(t.ticker) || watchMembers.includes(t.representative));

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
              { label: "Trades Tracked", value: trades.length, sub: "all disclosures", icon: Activity },
              { label: "Total Purchases", value: trades.filter(isBuy).length, sub: `${Math.round(trades.filter(isBuy).length/trades.length*100)}% of volume`, color: "text-green-700", icon: TrendingUp },
              { label: "Flagged Patterns", value: trades.filter(t => flagTrade(t).length > 0).length, sub: "require attention", color: "text-red-600", icon: AlertCircle },
              { label: "Watchlist Items", value: watchlist.length + watchMembers.length, sub: `${newAlerts.length} recent alerts`, color: newAlerts.length ? "text-amber-600" : "", icon: Star },
            ].map((s, i) => (
              <div key={i} className="px-4 md:px-6 py-5">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</div>
                  <s.icon className="w-4 h-4 text-gray-300" />
                </div>
                <div className={cn("text-3xl font-serif mt-1 mb-0.5", s.color)}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-8">
        
        {/* TABS */}
        <div className="flex overflow-x-auto scrollbar-custom border-b border-border mb-8 gap-6">
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
                "pb-3 text-sm font-medium transition-all whitespace-nowrap border-b-2",
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
              <div className="bg-white p-4 rounded-2xl border border-card-border shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-64">
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
                          "px-3 py-1 text-xs font-medium rounded-md transition-all",
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
                          "px-3 py-1 text-xs font-medium rounded-md transition-all capitalize",
                          filterType === t ? "bg-white shadow-sm text-primary" : "text-gray-500 hover:text-gray-900"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                    {["All", "House", "Senate"].map(ch => (
                      <button
                        key={ch}
                        onClick={() => setFilterChamber(ch)}
                        className={cn(
                          "px-3 py-1 text-xs font-medium rounded-md transition-all",
                          filterChamber === ch ? "bg-white shadow-sm text-primary" : "text-gray-500 hover:text-gray-900"
                        )}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* TRADE FEED LIST */}
              <div className="space-y-3">
                {filtered.length === 0 && (
                  <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
                    <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No trades match your filters.</p>
                    <button onClick={() => { setSearch(""); setFilterParty("All"); setFilterType("All"); setFilterChamber("All"); }} className="mt-2 text-sm text-primary hover:underline">Clear filters</button>
                  </div>
                )}
                
                {filtered.map((trade, i) => {
                  const flags = flagTrade(trade);
                  const isExp = expandedTrade === i;
                  const sig = signals[trade.ticker];
                  const sigStyle = sig ? (SIGNAL_STYLE[sig.signal] || SIGNAL_STYLE["Hold"]) : null;

                  return (
                    <div 
                      key={i} 
                      className={cn(
                        "bg-white border rounded-2xl p-4 transition-all duration-200 animate-fade-in hover:shadow-md cursor-pointer",
                        flags.length ? "border-red-200 bg-red-50/10" : "border-card-border",
                        isExp && "ring-2 ring-primary/20 border-primary"
                      )}
                      onClick={() => { setExpandedTrade(isExp ? null : i); if(!sig) generateSignal(trade); }}
                    >
                      <div className="flex gap-4 items-start">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm shrink-0",
                          isBuy(trade) ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-orange-50 text-orange-700 border border-orange-100"
                        )}>
                          {trade.ticker.slice(0,5)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-gray-900">{trade.representative}</span>
                            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase", pc(trade.party))}>
                              {trade.party}
                            </span>
                            <span className="text-xs text-gray-500 hidden sm:inline-block">
                              {trade.chamber} · {trade.state}
                            </span>
                            {flags.length > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-red-100 text-red-700 flex items-center gap-1">
                                <Flag className="w-3 h-3" /> Flagged
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 truncate">{trade.asset} <span className="text-gray-400">({trade.ticker})</span></div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-semibold",
                            isBuy(trade) ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
                          )}>
                            {isBuy(trade) ? "Buy" : "Sell"}
                          </span>
                          <span className="text-sm font-medium text-gray-700">{trade.amount}</span>
                          <span className="text-xs text-gray-400">{daysAgo(trade.date)}d ago</span>
                        </div>
                      </div>

                      {/* EXPANDED STATE */}
                      {isExp && (
                        <div className="mt-5 pt-5 border-t border-gray-100 animate-fade-in">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            {/* Left Column: AI & Flags */}
                            <div className="space-y-4">
                              {flags.length > 0 && (
                                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                                  <div className="text-xs font-bold text-red-800 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" /> Why this is flagged
                                  </div>
                                  <ul className="space-y-1">
                                    {flags.map((f, fi) => (
                                      <li key={fi} className="text-sm text-red-700 flex items-start gap-2">
                                        <span className="mt-1 text-red-400">•</span> {f}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
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
                  );
                })}
              </div>
            </div>
            
            {/* RIGHT SIDEBAR */}
            <div className="lg:col-span-4 space-y-6">
              {/* AI WEEKLY SUMMARY */}
              <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-2xl p-6 text-white shadow-xl shadow-blue-900/20">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <Star className="w-4 h-4 text-blue-100 fill-blue-100" />
                  </div>
                  <h3 className="font-serif text-xl tracking-wide">AI Market Pulse</h3>
                </div>
                
                <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/10 mb-4 min-h-[100px]">
                  {summaryLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-blue-200 gap-3 py-4">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                      <span className="text-sm font-medium">Analyzing weekly patterns...</span>
                    </div>
                  ) : weekSummary ? (
                    <p className="text-sm leading-relaxed text-blue-50">{weekSummary}</p>
                  ) : (
                    <p className="text-sm text-blue-200/70 text-center py-4">
                      Generate an AI summary of congressional trading patterns based on the latest 150 disclosures.
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
                        {t.flagCount > 0 && (
                          <div className="bg-red-50 text-red-700 px-2 py-1 rounded-md text-[10px] font-bold border border-red-100 flex items-center gap-1">
                            <Flag className="w-3 h-3" /> {t.flagCount}
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
                      <span className="text-gray-400 font-mono">{fmtMoney(m.val)}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full transition-all duration-1000", m.party === "D" ? "bg-blue-500" : m.party === "R" ? "bg-red-500" : "bg-purple-500")}
                        style={{ width: `${Math.max(2, Math.round((m.val / topMembers[0].val) * 100))}%` }} 
                      />
                    </div>
                  </div>
                  
                  <div className="md:w-32 flex justify-end md:justify-center pr-4 md:pr-0">
                    <button 
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                        watchMembers.includes(m.name) 
                          ? "bg-amber-50 text-amber-700 border-amber-200" 
                          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"
                      )}
                      onClick={() => toggleMember(m.name)}
                    >
                      <Star className={cn("w-4 h-4", watchMembers.includes(m.name) && "fill-amber-500")} />
                      <span className="md:hidden lg:inline">{watchMembers.includes(m.name) ? "Watched" : "Watch"}</span>
                    </button>
                  </div>
                  
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ WATCHLIST ═════════════════════════════════════════════════════ */}
        {tab === "watchlist" && (
          <div className="animate-fade-in max-w-4xl mx-auto">
            {watchlist.length === 0 && watchMembers.length === 0 ? (
              <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-gray-300">
                <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-4">
                  <Star className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-serif text-gray-900 mb-2">Your watchlist is empty</h3>
                <p className="text-gray-500 max-w-sm mx-auto">Star any ticker or member in the other tabs to track their activity here and get alerts on new trades.</p>
                <button onClick={() => setTab("feed")} className="mt-6 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-transform">
                  Explore Trades
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                
                {/* Active Tracking section */}
                <div className="bg-white rounded-2xl p-6 border border-card-border shadow-sm">
                  <h3 className="text-lg font-serif text-gray-900 mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" /> Active Tracking
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {watchlist.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Watched Tickers</div>
                        <div className="flex flex-wrap gap-2">
                          {watchlist.map(t => (
                            <div key={t} className="bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-xl px-3 py-1.5 flex items-center gap-2 group">
                              <span className="font-semibold text-sm">{t}</span>
                              <button onClick={() => toggleTicker(t)} className="text-indigo-400 hover:text-indigo-900 transition-colors p-0.5 rounded-md hover:bg-indigo-200">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {watchMembers.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Watched Members</div>
                        <div className="flex flex-wrap gap-2">
                          {watchMembers.map(m => (
                            <div key={m} className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl px-3 py-1.5 flex items-center gap-2 group">
                              <span className="font-semibold text-sm">{m}</span>
                              <button onClick={() => toggleMember(m)} className="text-amber-400 hover:text-amber-900 transition-colors p-0.5 rounded-md hover:bg-amber-200">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Watchlist Trades */}
                <div>
                  <h3 className="text-lg font-serif text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" /> Recent Activity
                  </h3>
                  
                  {watchTrades.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-200 text-gray-500">
                      No trades found for your watchlist items yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {watchTrades.map((trade, i) => {
                        const flags = flagTrade(trade);
                        return (
                          <div key={i} className={cn(
                            "bg-white border rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center gap-4",
                            flags.length ? "border-red-200 bg-red-50/10" : "border-card-border hover:shadow-md"
                          )}>
                            <div className={cn(
                              "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm shrink-0",
                              isBuy(trade) ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-orange-50 text-orange-700 border border-orange-100"
                            )}>
                              {trade.ticker.slice(0,5)}
                            </div>
                            
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-semibold text-gray-900">{trade.representative}</span>
                                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase", pc(trade.party))}>{trade.party}</span>
                                {flags.length > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-red-100 text-red-700">Flagged</span>}
                              </div>
                              <div className="text-sm text-gray-600">
                                {trade.asset} <span className="mx-2 text-gray-300">•</span> {trade.date}
                              </div>
                            </div>
                            
                            <div className="flex items-center md:flex-col md:items-end gap-3 md:gap-1">
                              <span className={cn(
                                "px-2.5 py-1 rounded-lg text-xs font-semibold",
                                isBuy(trade) ? "bg-green-50 text-green-700 border border-green-100" : "bg-orange-50 text-orange-700 border border-orange-100"
                              )}>
                                {isBuy(trade) ? "Buy" : "Sell"}
                              </span>
                              <span className="text-sm font-medium text-gray-700">{trade.amount}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="mt-20 py-8 border-t border-border bg-white text-center">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          Capitol Watch · Free Data Sources · Not financial advice
        </p>
      </footer>
    </div>
  );
}
