// 便利ツール: 翻訳 / 為替 / Wikipedia（外部サイトのAPIと連携。サーバー側は /api/tools/*）
import React, { useEffect, useState } from "react";
import { ArrowLeftRight, Copy, Loader2, Search, ExternalLink } from "lucide-react";
import { PageHeader } from "./common";
import { CURRENCIES, LANGS, detectLang, fetchRates, translateText, wikiSearch, wikiSummary } from "./toolsApi";

const TABS = [["translate", "翻訳"], ["fx", "為替"], ["wiki", "Wikipedia"]];
const copy = (t, note) => navigator.clipboard?.writeText(t).then(() => note?.("コピーしました")).catch(() => {});

const Translate = ({ showNotification }) => {
  const [text, setText] = useState("");
  const [from, setFrom] = useState("auto");
  const [to, setTo] = useState("en");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true); setOut("");
    try {
      let f = from === "auto" ? detectLang(t) : from;
      if (f === to) f = to === "ja" ? "en" : "ja";
      setOut(await translateText(t, f, to));
    } catch (e) { showNotification?.(e.message); }
    setBusy(false);
  };
  const swap = () => { if (from !== "auto") { setFrom(to); setTo(from); setText(out || text); setOut(""); } else setTo(to === "ja" ? "en" : "ja"); };
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <select value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 bg-white rounded-xl px-3 py-2.5 text-sm font-bold outline-none border">
          <option value="auto">自動判定</option>
          {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
        <button onClick={swap} aria-label="入れ替え" className="p-2 rounded-full bg-white border"><ArrowLeftRight className="w-4 h-4" /></button>
        <select value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 bg-white rounded-xl px-3 py-2.5 text-sm font-bold outline-none border">
          {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} rows={5} placeholder="翻訳したい文章（500文字まで）" className="w-full bg-white rounded-2xl p-4 text-sm outline-none border resize-none" />
      <div className="text-right text-[10px] text-gray-400">{text.length}/500</div>
      <button onClick={run} disabled={busy || !text.trim()} className="w-full py-3 rounded-xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}翻訳する
      </button>
      {out && (
        <div className="bg-white rounded-2xl p-4 border">
          <div className="text-sm whitespace-pre-wrap break-words">{out}</div>
          <button onClick={() => copy(out, showNotification)} className="mt-3 text-xs font-bold text-green-600 flex items-center gap-1"><Copy className="w-3 h-3" />コピー</button>
        </div>
      )}
      <p className="text-[10px] text-gray-400">翻訳は MyMemory（無料枠あり）を利用しています。トーク内のメッセージは、長押しメニューの「翻訳」でも翻訳できます。</p>
    </div>
  );
};

const POPULAR = ["USD", "EUR", "GBP", "CNY", "KRW", "AUD", "THB", "JPY"];
const Fx = ({ showNotification }) => {
  const [base, setBase] = useState("JPY");
  const [amount, setAmount] = useState("1000");
  const [rates, setRates] = useState(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setBusy(true); setRates(null);
    fetchRates(base, POPULAR.filter((c) => c !== base))
      .then((d) => { if (alive) { setRates(d.rates); setDate(d.date); } })
      .catch((e) => alive && showNotification?.(e.message))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = Number(amount.replace(/,/g, "")) || 0;
  const name = (c) => CURRENCIES.find(([x]) => x === c)?.[1] || c;
  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="flex-1 min-w-0 bg-white rounded-xl px-4 py-3 text-lg font-bold outline-none border" />
        <select value={base} onChange={(e) => setBase(e.target.value)} className="bg-white rounded-xl px-3 text-sm font-bold outline-none border">
          {CURRENCIES.map(([c, nm]) => <option key={c} value={c}>{c} {nm}</option>)}
        </select>
      </div>
      {busy && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>}
      {rates && (
        <div className="bg-white rounded-2xl border divide-y">
          {Object.entries(rates).map(([c, r]) => (
            <div key={c} className="flex items-center px-4 py-3">
              <div className="flex-1"><div className="text-sm font-bold">{c}</div><div className="text-[11px] text-gray-400">{name(c)}　1 {base} = {r}</div></div>
              <div className="text-base font-bold tabular-nums">{(n * r).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            </div>
          ))}
        </div>
      )}
      {date && <p className="text-[10px] text-gray-400">欧州中央銀行(ECB)の参考レート（{date}）。実際の取引レートとは異なります。</p>}
    </div>
  );
};

const Wiki = ({ showNotification }) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [page, setPage] = useState(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (!q.trim()) return;
    setBusy(true); setPage(null);
    try { setResults(await wikiSearch(q.trim())); } catch (e) { showNotification?.(e.message); }
    setBusy(false);
  };
  const open = async (title) => {
    setBusy(true);
    try { setPage(await wikiSummary(title)); } catch (e) { showNotification?.(e.message); }
    setBusy(false);
  };
  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="調べたい言葉" className="flex-1 min-w-0 bg-white rounded-xl px-4 py-3 text-sm outline-none border" />
        <button onClick={search} className="px-4 rounded-xl bg-green-500 text-white" aria-label="検索"><Search className="w-4 h-4" /></button>
      </div>
      {busy && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>}
      {page && (
        <div className="bg-white rounded-2xl border overflow-hidden">
          {page.thumbnail && <img src={page.thumbnail} alt="" className="w-full max-h-56 object-cover" />}
          <div className="p-4">
            <div className="font-bold text-base">{page.title}</div>
            {page.description && <div className="text-xs text-gray-400 mb-2">{page.description}</div>}
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{page.extract}</div>
            <a href={page.url} target="_blank" rel="noopener noreferrer" className="mt-3 text-xs font-bold text-green-600 flex items-center gap-1"><ExternalLink className="w-3 h-3" />Wikipediaで続きを読む</a>
          </div>
        </div>
      )}
      {!page && results && results.length === 0 && <div className="text-center text-sm text-gray-400 py-8">見つかりませんでした</div>}
      {!page && (results || []).map((r) => (
        <button key={r.title} onClick={() => open(r.title)} className="w-full text-left bg-white rounded-2xl border p-3">
          <div className="text-sm font-bold">{r.title}</div>
          <div className="text-[11px] text-gray-500 line-clamp-2">{r.snippet}</div>
        </button>
      ))}
    </div>
  );
};

const ToolsView = ({ tab = "translate", setView, showNotification }) => (
  <div className="flex flex-col h-full bg-gray-50">
    <PageHeader title="便利ツール" onBack={() => setView("services")} />
    <div className="flex bg-white border-b shrink-0">
      {TABS.map(([id, label]) => (
        <button key={id} onClick={() => setView(`tools-${id}`)} className={`flex-1 py-3 text-sm font-bold border-b-2 ${tab === id ? "border-green-500 text-green-600" : "border-transparent text-gray-400"}`}>{label}</button>
      ))}
    </div>
    <div className="flex-1 overflow-y-auto scrollbar-hide pb-24">
      {tab === "translate" && <Translate showNotification={showNotification} />}
      {tab === "fx" && <Fx showNotification={showNotification} />}
      {tab === "wiki" && <Wiki showNotification={showNotification} />}
    </div>
  </div>
);

export default ToolsView;
