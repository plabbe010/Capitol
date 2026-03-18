import { useState, useEffect, useCallback, useRef } from "react";

// ── Google Fonts ──────────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap";
document.head.appendChild(fontLink);

// ── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = "capitolwatch_v2";
const SEEN_KEY    = "capitolwatch_seen";

// ── Demo data (fallback if API unavailable) ───────────────────────────────────
const DEMO_TRADES = [
  { ticker:"ICHR", asset:"Ichor Holdings",           representative:"Debbie Wasserman Schultz", party:"D", state:"FL", chamber:"House",  type:"Purchase",     amount:"$1,001 - $15,000",         date:"2025-08-05", filed:"2025-08-28", committees:["Appropriations","Energy & Water"],         isMemberFirst:true  },
  { ticker:"NVDA", asset:"NVIDIA Corporation",        representative:"Nancy Pelosi",             party:"D", state:"CA", chamber:"House",  type:"Purchase",     amount:"$1,000,001 - $5,000,000",  date:"2026-01-15", filed:"2026-02-10", committees:["Financial Services"],                    isMemberFirst:false },
  { ticker:"LMT",  asset:"Lockheed Martin",           representative:"Michael McCaul",           party:"R", state:"TX", chamber:"House",  type:"Purchase",     amount:"$250,001 - $500,000",      date:"2026-01-22", filed:"2026-02-18", committees:["Armed Services","Foreign Affairs"],       isMemberFirst:false },
  { ticker:"XOM",  asset:"Exxon Mobil",               representative:"Dan Crenshaw",             party:"R", state:"TX", chamber:"House",  type:"Purchase",     amount:"$50,001 - $100,000",       date:"2026-01-20", filed:"2026-02-14", committees:["Energy & Commerce"],                     isMemberFirst:false },
  { ticker:"AMZN", asset:"Amazon.com Inc",             representative:"Nancy Pelosi",             party:"D", state:"CA", chamber:"House",  type:"Purchase",     amount:"$500,001 - $1,000,000",    date:"2026-01-03", filed:"2026-01-28", committees:["Financial Services"],                    isMemberFirst:false },
  { ticker:"SSYS", asset:"Stratasys Ltd",              representative:"Debbie Wasserman Schultz", party:"D", state:"FL", chamber:"House",  type:"Purchase",     amount:"$1,001 - $15,000",         date:"2025-08-15", filed:"2025-09-02", committees:["Appropriations"],                        isMemberFirst:true  },
  { ticker:"BA",   asset:"Boeing Co",                  representative:"Kevin McCarthy",           party:"R", state:"CA", chamber:"House",  type:"Purchase",     amount:"$500,001 - $1,000,000",    date:"2026-02-03", filed:"2026-02-28", committees:["Rules"],                                 isMemberFirst:false },
  { ticker:"MSFT", asset:"Microsoft Corp",             representative:"Josh Gottheimer",          party:"D", state:"NJ", chamber:"House",  type:"Purchase",     amount:"$15,001 - $50,000",        date:"2026-01-12", filed:"2026-02-05", committees:["Financial Services"],                    isMemberFirst:false },
  { ticker:"PFE",  asset:"Pfizer Inc",                 representative:"Katie Porter",             party:"D", state:"CA", chamber:"House",  type:"Sale (Full)",  amount:"$50,001 - $100,000",       date:"2026-01-30", filed:"2026-02-24", committees:["Oversight"],                             isMemberFirst:false },
  { ticker:"TSLA", asset:"Tesla Inc",                  representative:"Marjorie Taylor Greene",   party:"R", state:"GA", chamber:"House",  type:"Purchase",     amount:"$1,001 - $15,000",         date:"2026-02-01", filed:"2026-02-25", committees:["Oversight","Homeland Security"],          isMemberFirst:false },
  { ticker:"CVX",  asset:"Chevron Corp",               representative:"Dan Crenshaw",             party:"R", state:"TX", chamber:"House",  type:"Purchase",     amount:"$15,001 - $50,000",        date:"2026-01-28", filed:"2026-02-22", committees:["Energy & Commerce"],                     isMemberFirst:false },
  { ticker:"GOOGL",asset:"Alphabet Inc",               representative:"Suzan DelBene",            party:"D", state:"WA", chamber:"House",  type:"Purchase",     amount:"$250,001 - $500,000",      date:"2026-01-25", filed:"2026-02-20", committees:["Ways & Means","Agriculture"],             isMemberFirst:false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function amountMid(s) {
  const m = {
    "$1,001 - $15,000":900000,"$15,001 - $50,000":32500,"$50,001 - $100,000":75000,
    "$100,001 - $250,000":175000,"$250,001 - $500,000":375000,
    "$500,001 - $1,000,000":750000,"$1,000,001 - $5,000,000":3000000,"Over $5,000,000":5000000,
  };
  return m[s] || 8000;
}
function fmtMoney(n) {
  if (n >= 1e6) return `$${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`;
  return `$${n}`;
}
function daysAgo(d)  { return Math.floor((Date.now() - new Date(d)) / 86400000); }
function isBuy(t)    { return t.type?.toLowerCase().includes("purchase"); }

// ── Flag logic ────────────────────────────────────────────────────────────────
const SECTOR_COMMITTEE = {
  defense: ["Armed Services","Foreign Affairs","Military Construction"],
  energy:  ["Energy & Commerce","Energy & Water","Natural Resources"],
  tech:    ["Science, Space & Technology","Commerce"],
  health:  ["Energy & Commerce","Health"],
  finance: ["Financial Services","Ways & Means"],
};
const TICKER_SECTOR = {
  LMT:"defense",RTX:"defense",NOC:"defense",BA:"defense",
  XOM:"energy",CVX:"energy",COP:"energy",
  NVDA:"tech",MSFT:"tech",GOOGL:"tech",AAPL:"tech",AMZN:"tech",
  PFE:"health",JNJ:"health",MRK:"health",
  JPM:"finance",GS:"finance",MS:"finance",
};

function flagTrade(trade) {
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

// ── Claude AI call (goes through Anthropic directly — safe from client) ───────
async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// ── Signal styles ─────────────────────────────────────────────────────────────
const SIGNAL_STYLE = {
  "Strong Buy":  { bg:"#dcfce7", color:"#15803d", dot:"#22c55e" },
  "Buy":         { bg:"#eff6ff", color:"#1d4ed8", dot:"#3b82f6" },
  "Hold":        { bg:"#fef9c3", color:"#a16207", dot:"#eab308" },
  "Sell":        { bg:"#fff7ed", color:"#c2410c", dot:"#f97316" },
  "Strong Sell": { bg:"#fee2e2", color:"#b91c1c", dot:"#ef4444" },
};

// ── Storage ───────────────────────────────────────────────────────────────────
function loadStorage() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } }
function saveStorage(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} }
function loadSeen()     { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); } }
function saveSeen(s)    { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch {} }

// ─────────────────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────────────────
export default function CapitolWatch() {
  const store = loadStorage();

  const [trades,        setTrades]        = useState(DEMO_TRADES);
  const [loading,       setLoading]       = useState(false);
  const [fetchError,    setFetchError]    = useState("");
  const [usingDemo,     setUsingDemo]     = useState(true);
  const [serverHealth,  setServerHealth]  = useState(null);

  const [tab,           setTab]           = useState("feed");
  const [watchlist,     setWatchlist]     = useState(store.watchlist     || []);
  const [watchMembers,  setWatchMembers]  = useState(store.watchMembers  || []);

  const [filterParty,   setFilterParty]   = useState("All");
  const [filterType,    setFilterType]    = useState("All");
  const [filterChamber, setFilterChamber] = useState("All");
  const [search,        setSearch]        = useState("");

  const [signals,       setSignals]       = useState(store.signals      || {});
  const [signalLoading, setSignalLoading] = useState({});
  const [weekSummary,   setWeekSummary]   = useState(store.weekSummary  || "");
  const [summaryLoading,setSummaryLoading]= useState(false);

  const [expandedTrade, setExpandedTrade] = useState(null);
  const [newAlerts,     setNewAlerts]     = useState([]);

  const seenRef = useRef(loadSeen());

  // ── Persist state ──────────────────────────────────────────────────────────
  useEffect(() => {
    saveStorage({ watchlist, watchMembers, signals, weekSummary });
  }, [watchlist, watchMembers, signals, weekSummary]);

  // ── Check server health on mount ───────────────────────────────────────────
  useEffect(() => {
    fetch("/api/health")
      .then(r => r.json())
      .then(d => {
        setServerHealth(d);
        if (d.hasKey) fetchLiveTrades();
      })
      .catch(() => setServerHealth(null));
  }, []);

  // ── Alert detection ────────────────────────────────────────────────────────
  useEffect(() => {
    const key = t => `${t.representative}|${t.ticker}|${t.date}`;
    const alerts = trades.filter(t =>
      (watchlist.includes(t.ticker) || watchMembers.includes(t.representative)) &&
      !seenRef.current.has(key(t))
    );
    setNewAlerts(alerts);
  }, [trades, watchlist, watchMembers]);

  function dismissAlerts() {
    const key = t => `${t.representative}|${t.ticker}|${t.date}`;
    newAlerts.forEach(t => seenRef.current.add(key(t)));
    saveSeen(seenRef.current);
    setNewAlerts([]);
  }

  // ── Fetch live data from our Express backend ───────────────────────────────
  async function fetchLiveTrades(bust = false) {
    setLoading(true);
    setFetchError("");
    try {
      if (bust) await fetch("/api/refresh", { method: "POST" });
      const res = await fetch("/api/trades");
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (Array.isArray(data) && data.length > 0) {
        setTrades(data);
        setUsingDemo(false);
      } else {
        setUsingDemo(true);
      }
    } catch (err) {
      setFetchError(err.message);
      setUsingDemo(true);
    }
    setLoading(false);
  }

  // ── AI signal for a ticker ─────────────────────────────────────────────────
  async function generateSignal(trade) {
    const key = trade.ticker;
    if (signals[key] || signalLoading[key]) return;
    setSignalLoading(p => ({ ...p, [key]: true }));

    const related = trades.filter(t => t.ticker === key);
    const buys    = related.filter(isBuy).length;
    const sells   = related.length - buys;
    const val     = related.reduce((s, t) => s + amountMid(t.amount), 0);
    const members = [...new Set(related.map(t => t.representative))];
    const flags   = flagTrade(trade);

    const prompt = `You are a sharp, concise financial analyst. A user tracks congressional stock disclosures.

Ticker: ${key} (${trade.asset})
Congressional activity: ${buys} purchases, ${sells} sales by ${members.length} member(s) — ${members.slice(0,3).join(", ")}
Total estimated disclosed value: ${fmtMoney(val)}
Unusual flags: ${flags.length ? flags.join(", ") : "None"}
Committee context: ${trade.committees?.join(", ") || "Unknown"}

Respond ONLY with a JSON object, no markdown, no extra text:
{
  "signal": "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell",
  "confidence": <integer 0-100>,
  "summary": "<2 sentence plain-english explanation, mention political context>",
  "flag_note": "<1 sentence on the most suspicious element, or empty string>"
}`;

    try {
      const text   = await callClaude(prompt);
      const clean  = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setSignals(p => ({ ...p, [key]: parsed }));
    } catch {
      setSignals(p => ({ ...p, [key]: { signal:"Hold", confidence:50, summary:"Could not generate signal.", flag_note:"" } }));
    }
    setSignalLoading(p => ({ ...p, [key]: false }));
  }

  // ── Weekly AI summary ──────────────────────────────────────────────────────
  async function generateSummary() {
    setSummaryLoading(true);
    const top    = [...trades].sort((a,b) => amountMid(b.amount)-amountMid(a.amount)).slice(0,10);
    const digest = top.map(t => `${t.representative} (${t.party}) ${t.type} ${t.ticker} — ${t.amount}`).join("\n");
    const prompt = `You are a financial journalist covering political transparency. Based on these recent congressional stock disclosures:\n\n${digest}\n\nWrite a 3-sentence market insight. Identify sector patterns, note anything suspicious, and flag what retail investors should watch. Be direct and specific.`;
    try {
      const text = await callClaude(prompt);
      setWeekSummary(text);
    } catch { setWeekSummary("Could not generate summary."); }
    setSummaryLoading(false);
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const filtered = trades.filter(t => {
    if (filterParty   !== "All" && t.party   !== filterParty)                          return false;
    if (filterType    !== "All" && !t.type.toLowerCase().includes(filterType))         return false;
    if (filterChamber !== "All" && t.chamber !== filterChamber)                        return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.ticker.toLowerCase().includes(q) &&
          !t.representative.toLowerCase().includes(q) &&
          !t.asset.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const tickerMap = {};
  trades.forEach(t => {
    if (!tickerMap[t.ticker]) tickerMap[t.ticker] = { ticker:t.ticker, asset:t.asset, buys:0, sells:0, val:0, members:new Set(), flagCount:0 };
    tickerMap[t.ticker].val += amountMid(t.amount);
    tickerMap[t.ticker].members.add(t.representative);
    isBuy(t) ? tickerMap[t.ticker].buys++ : tickerMap[t.ticker].sells++;
    if (flagTrade(t).length) tickerMap[t.ticker].flagCount++;
  });
  const topTickers = Object.values(tickerMap).sort((a,b) => b.val-a.val).slice(0,8);

  const memberMap = {};
  trades.forEach(t => {
    if (!memberMap[t.representative]) memberMap[t.representative] = { name:t.representative, party:t.party, state:t.state, chamber:t.chamber, trades:0, val:0 };
    memberMap[t.representative].trades++;
    memberMap[t.representative].val += amountMid(t.amount);
  });
  const topMembers  = Object.values(memberMap).sort((a,b) => b.val-a.val).slice(0,8);
  const watchTrades = trades.filter(t => watchlist.includes(t.ticker) || watchMembers.includes(t.representative));

  const toggleTicker = t => setWatchlist(w => w.includes(t) ? w.filter(x=>x!==t) : [...w, t]);
  const toggleMember = m => setWatchMembers(w => w.includes(m) ? w.filter(x=>x!==m) : [...w, m]);

  const pc = p => ({ D:{bg:"#dbeafe",text:"#1e40af"}, R:{bg:"#fee2e2",text:"#b91c1c"}, I:{bg:"#f3e8ff",text:"#7e22ce"} }[p] || {bg:"#f3f4f6",text:"#374151"});

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#f8f7f4", fontFamily:"'DM Sans', sans-serif", color:"#1a1a1a" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::selection{background:#bfdbfe}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:99px}
        .btn{background:white;border:1px solid #e5e7eb;border-radius:8px;padding:7px 14px;font-size:13px;cursor:pointer;font-family:inherit;color:#374151;transition:all .15s}
        .btn:hover{background:#f9fafb;border-color:#d1d5db}
        .btn.active{background:#1e3a8a;color:white;border-color:#1e3a8a}
        .tab{background:none;border:none;padding:12px 18px;font-size:14px;cursor:pointer;font-family:inherit;color:#6b7280;border-bottom:2px solid transparent;transition:all .15s;white-space:nowrap}
        .tab.active{color:#1e3a8a;border-bottom-color:#1e3a8a;font-weight:500}
        .tab:hover:not(.active){color:#374151}
        .trade-card{background:white;border:1px solid #f0eeea;border-radius:12px;padding:16px;margin-bottom:8px;cursor:pointer;transition:all .15s}
        .trade-card:hover{border-color:#d1d5db;box-shadow:0 2px 8px rgba(0,0,0,.06)}
        .trade-card.flagged{border-color:#fca5a5;background:#fffbfb}
        .trade-card.expanded{border-color:#93c5fd}
        .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:500}
        .ticker-chip{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:500;flex-shrink:0}
        .watch-star{background:none;border:none;cursor:pointer;font-size:16px;padding:2px 6px;border-radius:6px;transition:all .15s;color:#9ca3af}
        .watch-star:hover{color:#f59e0b}
        .watch-star.on{color:#f59e0b}
        .search-input{background:white;border:1px solid #e5e7eb;border-radius:8px;padding:8px 14px;font-size:13px;width:240px;outline:none;font-family:inherit;color:#1a1a1a}
        .search-input:focus{border-color:#93c5fd}
        .signal-btn{background:#f0f4ff;border:1px solid #c7d7fb;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-family:inherit;color:#1e3a8a;transition:all .15s}
        .signal-btn:hover{background:#e0eaff}
        .signal-btn:disabled{opacity:.5;cursor:default}
        .ticker-card{background:white;border:1px solid #f0eeea;border-radius:12px;padding:16px;transition:all .15s;cursor:pointer}
        .ticker-card:hover{border-color:#d1d5db;box-shadow:0 2px 8px rgba(0,0,0,.06)}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fadeIn .25s ease}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .pulse{animation:pulse 2s infinite}
        .member-bar{height:4px;border-radius:99px;background:#f3f4f6;overflow:hidden;margin-top:6px}
      `}</style>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ background:"white", borderBottom:"1px solid #f0eeea", padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:"#1e3a8a", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </div>
          <span style={{ fontSize:17, fontWeight:500, fontFamily:"'Instrument Serif', serif" }}>Capitol Watch</span>
          {usingDemo
            ? <span style={{ fontSize:11, color:"#9ca3af", background:"#f3f4f6", padding:"2px 8px", borderRadius:99 }}>demo data</span>
            : <span style={{ fontSize:11, color:"#15803d", background:"#dcfce7", padding:"2px 8px", borderRadius:99, display:"flex", alignItems:"center", gap:4 }}>
                <span className="pulse" style={{ width:5, height:5, borderRadius:"50%", background:"#22c55e", display:"inline-block" }} />live
              </span>
          }
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {loading && <span style={{ fontSize:12, color:"#6b7280" }}>Fetching…</span>}
          {fetchError && <span style={{ fontSize:12, color:"#b91c1c" }} title={fetchError}>⚠ {fetchError.slice(0,40)}</span>}
          {serverHealth?.hasKey
            ? <button className="btn" onClick={() => fetchLiveTrades(true)} style={{ fontSize:12 }}>↻ Refresh</button>
            : <span style={{ fontSize:12, color:"#9ca3af" }}>Add QUIVER_API_KEY to Replit Secrets →</span>
          }
        </div>
      </div>

      {/* ── Alert banner ──────────────────────────────────────────────────── */}
      {newAlerts.length > 0 && (
        <div className="fade-in" style={{ background:"#fef3c7", borderBottom:"1px solid #fcd34d", padding:"10px 24px", display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:14 }}>🔔</span>
          <span style={{ fontSize:13, fontWeight:500, color:"#92400e" }}>
            {newAlerts.length} new trade{newAlerts.length>1?"s":""} on your watchlist — {newAlerts.map(t=>t.ticker).join(", ")}
          </span>
          <button onClick={dismissAlerts} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#b45309", textDecoration:"underline", fontFamily:"inherit" }}>Dismiss</button>
        </div>
      )}

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", background:"white", borderBottom:"1px solid #f0eeea" }}>
        {[
          { label:"Trades tracked",  value:trades.length,                                           sub:"all disclosures" },
          { label:"Purchases",       value:trades.filter(isBuy).length,                             sub:`${Math.round(trades.filter(isBuy).length/trades.length*100)}% of total`, color:"#15803d" },
          { label:"Flagged trades",  value:trades.filter(t=>flagTrade(t).length>0).length,          sub:"unusual patterns",  color:"#b91c1c" },
          { label:"Watchlist items", value:watchlist.length+watchMembers.length,                     sub:`${newAlerts.length} new today`, color:newAlerts.length?"#b45309":undefined },
        ].map((s,i) => (
          <div key={i} style={{ padding:"16px 20px", borderRight:i<3?"1px solid #f0eeea":"none" }}>
            <div style={{ fontSize:12, color:"#9ca3af", marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:26, fontWeight:500, fontFamily:"'Instrument Serif', serif", color:s.color||"#1a1a1a" }}>{s.value}</div>
            <div style={{ fontSize:11, color:"#9ca3af", marginTop:1 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div style={{ background:"white", borderBottom:"1px solid #f0eeea", padding:"0 24px", display:"flex", overflowX:"auto" }}>
        {[["feed","Trade Feed"],["tickers","Top Tickers"],["members","Members"],["watchlist",`Watchlist (${watchlist.length+watchMembers.length})`]].map(([id,label]) => (
          <button key={id} className={`tab ${tab===id?"active":""}`} onClick={()=>setTab(id)}>{label}</button>
        ))}
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 16px" }}>

        {/* ══ FEED ══════════════════════════════════════════════════════════ */}
        {tab==="feed" && (
          <div>
            {/* AI Summary card */}
            <div style={{ background:"white", border:"1px solid #f0eeea", borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:"#9ca3af", marginBottom:6 }}>✦ AI weekly summary</div>
                  {weekSummary
                    ? <p style={{ fontSize:13, color:"#374151", lineHeight:1.7 }}>{weekSummary}</p>
                    : <p style={{ fontSize:13, color:"#9ca3af" }}>Generate an AI summary of congressional trading patterns this week.</p>
                  }
                </div>
                <button className="signal-btn" onClick={generateSummary} disabled={summaryLoading} style={{ flexShrink:0 }}>
                  {summaryLoading ? "Thinking…" : weekSummary ? "↻ Refresh" : "Generate"}
                </button>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
              <input className="search-input" placeholder="Search ticker, member, company…" value={search} onChange={e=>setSearch(e.target.value)} />
              <div style={{ display:"flex", gap:4 }}>
                {["All","D","R"].map(p => <button key={p} className={`btn ${filterParty===p?"active":""}`} onClick={()=>setFilterParty(p)} style={{padding:"6px 12px",fontSize:12}}>{p==="All"?"All parties":p==="D"?"Democrat":"Republican"}</button>)}
              </div>
              <div style={{ display:"flex", gap:4 }}>
                {["All","purchase","sale"].map(t => <button key={t} className={`btn ${filterType===t?"active":""}`} onClick={()=>setFilterType(t)} style={{padding:"6px 12px",fontSize:12}}>{t==="All"?"All types":t==="purchase"?"Buys":"Sells"}</button>)}
              </div>
              <div style={{ display:"flex", gap:4 }}>
                {["All","House","Senate"].map(c => <button key={c} className={`btn ${filterChamber===c?"active":""}`} onClick={()=>setFilterChamber(c)} style={{padding:"6px 12px",fontSize:12}}>{c}</button>)}
              </div>
            </div>

            {/* Trade rows */}
            {filtered.length===0 && <div style={{ textAlign:"center", color:"#9ca3af", padding:40, fontSize:14 }}>No trades match your filters.</div>}
            {filtered.map((trade, i) => {
              const flags     = flagTrade(trade);
              const isExp     = expandedTrade===i;
              const sig       = signals[trade.ticker];
              const sigStyle  = sig ? (SIGNAL_STYLE[sig.signal]||SIGNAL_STYLE["Hold"]) : null;

              return (
                <div key={i} className={`trade-card fade-in ${flags.length?"flagged":""} ${isExp?"expanded":""}`}
                  onClick={()=>{ setExpandedTrade(isExp?null:i); if(!sig) generateSignal(trade); }}>

                  <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                    <div className="ticker-chip" style={{ background:isBuy(trade)?"#eff6ff":"#fff7ed", color:isBuy(trade)?"#1d4ed8":"#c2410c" }}>
                      {trade.ticker.slice(0,5)}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:3 }}>
                        <span style={{ fontSize:14, fontWeight:500 }}>{trade.representative}</span>
                        <span className="badge" style={{ background:pc(trade.party).bg, color:pc(trade.party).text }}>{trade.party}</span>
                        <span style={{ fontSize:12, color:"#9ca3af" }}>{trade.chamber} · {trade.state}</span>
                        {flags.length>0 && <span className="badge" style={{ background:"#fee2e2", color:"#b91c1c" }}>⚑ Flagged</span>}
                      </div>
                      <div style={{ fontSize:13, color:"#4b5563" }}>{trade.asset} <span style={{ color:"#9ca3af" }}>({trade.ticker})</span></div>
                    </div>

                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
                      <span className="badge" style={{ background:isBuy(trade)?"#dcfce7":"#fff7ed", color:isBuy(trade)?"#15803d":"#c2410c" }}>
                        {isBuy(trade)?"Buy":"Sell"}
                      </span>
                      <span style={{ fontSize:12, color:"#6b7280" }}>{trade.amount}</span>
                      <span style={{ fontSize:11, color:"#9ca3af" }}>{daysAgo(trade.date)}d ago</span>
                    </div>

                    {sig && (
                      <div style={{ textAlign:"right", flexShrink:0, minWidth:90 }}>
                        <div className="badge" style={{ background:sigStyle.bg, color:sigStyle.color, marginBottom:2 }}>
                          <span style={{ width:6, height:6, borderRadius:"50%", background:sigStyle.dot, display:"inline-block" }} />
                          {sig.signal}
                        </div>
                        <div style={{ fontSize:11, color:"#9ca3af" }}>{sig.confidence}% conf.</div>
                      </div>
                    )}

                    <button className={`watch-star ${watchlist.includes(trade.ticker)?"on":""}`}
                      onClick={e=>{ e.stopPropagation(); toggleTicker(trade.ticker); }}>
                      {watchlist.includes(trade.ticker)?"★":"☆"}
                    </button>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div className="fade-in" style={{ marginTop:14, paddingTop:14, borderTop:"1px solid #f3f4f6" }}>
                      {flags.length>0 && (
                        <div style={{ background:"#fff5f5", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", marginBottom:12 }}>
                          <div style={{ fontSize:12, fontWeight:500, color:"#b91c1c", marginBottom:4 }}>Why this is flagged</div>
                          {flags.map((f,fi) => <div key={fi} style={{ fontSize:12, color:"#7f1d1d" }}>• {f}</div>)}
                        </div>
                      )}
                      {signalLoading[trade.ticker] && <div style={{ fontSize:13, color:"#9ca3af", padding:8 }}>✦ Generating AI signal…</div>}
                      {sig && (
                        <div style={{ background:"#f8faff", border:"1px solid #dbeafe", borderRadius:8, padding:"12px 14px", marginBottom:12 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                            <span className="badge" style={{ background:sigStyle.bg, color:sigStyle.color }}>
                              <span style={{ width:6, height:6, borderRadius:"50%", background:sigStyle.dot, display:"inline-block" }} />
                              {sig.signal}
                            </span>
                            <span style={{ fontSize:12, color:"#4b5563" }}>{sig.confidence}% confidence</span>
                          </div>
                          <p style={{ fontSize:13, color:"#374151", lineHeight:1.65, marginBottom:sig.flag_note?6:0 }}>{sig.summary}</p>
                          {sig.flag_note && <p style={{ fontSize:12, color:"#b91c1c", fontStyle:"italic" }}>⚑ {sig.flag_note}</p>}
                        </div>
                      )}
                      <div style={{ display:"flex", gap:20, fontSize:12, color:"#6b7280", flexWrap:"wrap", marginBottom:10 }}>
                        <span>Transaction: {trade.date}</span>
                        <span>Filed: {trade.filed}</span>
                        {trade.committees?.length>0 && <span>Committees: {trade.committees.join(", ")}</span>}
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button className={`btn ${watchMembers.includes(trade.representative)?"active":""}`}
                          onClick={e=>{ e.stopPropagation(); toggleMember(trade.representative); }} style={{ fontSize:12 }}>
                          {watchMembers.includes(trade.representative)?"★ Watching member":"☆ Watch member"}
                        </button>
                        <button className={`btn ${watchlist.includes(trade.ticker)?"active":""}`}
                          onClick={e=>{ e.stopPropagation(); toggleTicker(trade.ticker); }} style={{ fontSize:12 }}>
                          {watchlist.includes(trade.ticker)?"★ Watching ticker":"☆ Watch ticker"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ══ TICKERS ═══════════════════════════════════════════════════════ */}
        {tab==="tickers" && (
          <div>
            <div style={{ fontSize:12, color:"#9ca3af", marginBottom:16 }}>Ranked by estimated disclosed value · click any card for AI signal</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
              {topTickers.map(t => {
                const sig      = signals[t.ticker];
                const sigStyle = sig ? (SIGNAL_STYLE[sig.signal]||SIGNAL_STYLE["Hold"]) : null;
                const buyPct   = Math.round(t.buys/(t.buys+t.sells)*100);
                const sample   = trades.find(tr=>tr.ticker===t.ticker);
                return (
                  <div key={t.ticker} className="ticker-card" onClick={()=>{ if(sample) generateSignal(sample); }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:20, fontWeight:500, fontFamily:"'Instrument Serif', serif" }}>{t.ticker}</div>
                        <div style={{ fontSize:11, color:"#9ca3af" }}>{t.asset}</div>
                      </div>
                      <div style={{ display:"flex", gap:6, alignItems:"flex-start" }}>
                        {t.flagCount>0 && <span className="badge" style={{ background:"#fee2e2", color:"#b91c1c", fontSize:10 }}>⚑</span>}
                        <button className={`watch-star ${watchlist.includes(t.ticker)?"on":""}`}
                          onClick={e=>{ e.stopPropagation(); toggleTicker(t.ticker); }}>
                          {watchlist.includes(t.ticker)?"★":"☆"}
                        </button>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:16, marginBottom:10 }}>
                      <div><div style={{ fontSize:10, color:"#9ca3af" }}>Est. value</div><div style={{ fontSize:16, fontWeight:500 }}>{fmtMoney(t.val)}</div></div>
                      <div><div style={{ fontSize:10, color:"#9ca3af" }}>Members</div><div style={{ fontSize:16, fontWeight:500 }}>{t.members.size}</div></div>
                      <div><div style={{ fontSize:10, color:"#15803d" }}>Buys</div><div style={{ fontSize:16, fontWeight:500, color:"#15803d" }}>{t.buys}</div></div>
                      <div><div style={{ fontSize:10, color:"#c2410c" }}>Sells</div><div style={{ fontSize:16, fontWeight:500, color:"#c2410c" }}>{t.sells}</div></div>
                    </div>
                    <div style={{ height:4, borderRadius:99, background:"#f3f4f6", overflow:"hidden" }}>
                      <div style={{ width:`${buyPct}%`, height:"100%", background:"#22c55e", borderRadius:99 }} />
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#9ca3af", marginTop:3 }}>
                      <span>{buyPct}% buy</span><span>{100-buyPct}% sell</span>
                    </div>
                    {sig && (
                      <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid #f3f4f6" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                          <span className="badge" style={{ background:sigStyle.bg, color:sigStyle.color, fontSize:10 }}>
                            <span style={{ width:5, height:5, borderRadius:"50%", background:sigStyle.dot, display:"inline-block" }} />
                            {sig.signal}
                          </span>
                          <span style={{ fontSize:11, color:"#9ca3af" }}>{sig.confidence}%</span>
                        </div>
                        <p style={{ fontSize:11, color:"#4b5563", lineHeight:1.6 }}>{sig.summary}</p>
                      </div>
                    )}
                    {signalLoading[t.ticker] && <div style={{ marginTop:8, fontSize:12, color:"#9ca3af" }}>✦ Analyzing…</div>}
                    {!sig && !signalLoading[t.ticker] && <div style={{ marginTop:8, fontSize:11, color:"#93c5fd" }}>Click for AI signal →</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ MEMBERS ═══════════════════════════════════════════════════════ */}
        {tab==="members" && (
          <div>
            <div style={{ fontSize:12, color:"#9ca3af", marginBottom:16 }}>Ranked by total estimated disclosed value</div>
            {topMembers.map((m,i) => (
              <div key={m.name} style={{ background:"white", border:"1px solid #f0eeea", borderRadius:12, padding:"16px 20px", marginBottom:8, display:"flex", alignItems:"center", gap:16 }}>
                <div style={{ fontFamily:"'Instrument Serif', serif", fontSize:28, color:"#e5e7eb", minWidth:36 }}>{i+1}</div>
                <div style={{ width:40, height:40, borderRadius:"50%", background:pc(m.party).bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:500, color:pc(m.party).text, flexShrink:0 }}>
                  {m.name.split(" ").map(n=>n[0]).slice(0,2).join("")}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:14, fontWeight:500 }}>{m.name}</span>
                    <span className="badge" style={{ background:pc(m.party).bg, color:pc(m.party).text }}>{m.party}</span>
                    <span style={{ fontSize:12, color:"#9ca3af" }}>{m.chamber} · {m.state}</span>
                  </div>
                  <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>{m.trades} trade{m.trades>1?"s":""} disclosed</div>
                  <div className="member-bar">
                    <div style={{ width:`${Math.round(m.val/topMembers[0].val*100)}%`, height:"100%", background:pc(m.party).text, opacity:.5, borderRadius:99 }} />
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:20, fontWeight:500, fontFamily:"'Instrument Serif', serif" }}>{fmtMoney(m.val)}</div>
                  <div style={{ fontSize:11, color:"#9ca3af" }}>est. disclosed</div>
                </div>
                <button className={`watch-star ${watchMembers.includes(m.name)?"on":""}`} onClick={()=>toggleMember(m.name)}>
                  {watchMembers.includes(m.name)?"★":"☆"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ══ WATCHLIST ═════════════════════════════════════════════════════ */}
        {tab==="watchlist" && (
          <div>
            {watchlist.length===0 && watchMembers.length===0 ? (
              <div style={{ textAlign:"center", padding:"60px 20px" }}>
                <div style={{ fontSize:32, marginBottom:12 }}>☆</div>
                <div style={{ fontSize:16, fontFamily:"'Instrument Serif', serif", marginBottom:6 }}>Your watchlist is empty</div>
                <div style={{ fontSize:13, color:"#9ca3af" }}>Star any ticker or member in the other tabs to track them here.</div>
              </div>
            ) : (
              <div>
                {watchlist.length>0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:12, color:"#9ca3af", marginBottom:8 }}>Watching tickers</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {watchlist.map(t => (
                        <div key={t} style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, padding:"5px 12px", display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:13, fontWeight:500, color:"#1e3a8a" }}>{t}</span>
                          <button onClick={()=>toggleTicker(t)} style={{ background:"none", border:"none", cursor:"pointer", color:"#93c5fd", fontSize:14, lineHeight:1 }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {watchMembers.length>0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:12, color:"#9ca3af", marginBottom:8 }}>Watching members</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {watchMembers.map(m => (
                        <div key={m} style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:8, padding:"5px 12px", display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:13, fontWeight:500, color:"#92400e" }}>{m}</span>
                          <button onClick={()=>toggleMember(m)} style={{ background:"none", border:"none", cursor:"pointer", color:"#fbbf24", fontSize:14, lineHeight:1 }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ fontSize:12, color:"#9ca3af", marginBottom:12 }}>Recent trades on your watchlist</div>
                {watchTrades.length===0
                  ? <div style={{ fontSize:13, color:"#9ca3af", padding:20 }}>No trades yet for your watchlist items.</div>
                  : watchTrades.map((trade,i) => {
                    const flags = flagTrade(trade);
                    return (
                      <div key={i} className={`trade-card ${flags.length?"flagged":""}`}>
                        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                          <div className="ticker-chip" style={{ background:isBuy(trade)?"#eff6ff":"#fff7ed", color:isBuy(trade)?"#1d4ed8":"#c2410c" }}>
                            {trade.ticker.slice(0,5)}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:2 }}>
                              <span style={{ fontSize:14, fontWeight:500 }}>{trade.representative}</span>
                              <span className="badge" style={{ background:pc(trade.party).bg, color:pc(trade.party).text }}>{trade.party}</span>
                              {flags.length>0 && <span className="badge" style={{ background:"#fee2e2", color:"#b91c1c" }}>⚑ Flagged</span>}
                            </div>
                            <div style={{ fontSize:12, color:"#6b7280" }}>{trade.asset} · {trade.date}</div>
                          </div>
                          <span className="badge" style={{ background:isBuy(trade)?"#dcfce7":"#fff7ed", color:isBuy(trade)?"#15803d":"#c2410c" }}>
                            {isBuy(trade)?"Buy":"Sell"}
                          </span>
                          <span style={{ fontSize:12, color:"#6b7280" }}>{trade.amount}</span>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ textAlign:"center", padding:"20px 24px", fontSize:11, color:"#d1d5db" }}>
        Capitol Watch · STOCK Act disclosures · Data via QuiverQuant · Not financial advice
      </div>
    </div>
  );
}
