// 便利ボックスの追加ツール（すべて端末内で動作・localStorage に保存）
import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Copy, Play, Pause, RotateCcw, BellOff } from "lucide-react";
import { playPreview, stopPreview } from "./ring";
import { getRingSettings } from "./ringtones";
import { loadAlarms, saveAlarms } from "./AlarmWatcher";
import { ymd } from "./common";

export const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 無視 */ } },
};
export const copy = (t, note) => navigator.clipboard?.writeText(t).then(() => note?.("コピーしました")).catch(() => {});
export const card = "bg-white rounded-2xl border p-4";
export const btn = "py-3 rounded-xl font-bold text-sm";
export const inp = "w-full bg-gray-50 border rounded-xl px-3 py-2.5 text-sm outline-none";
export const rnd = (n) => { const a = new Uint32Array(1); const lim = Math.floor(0x100000000 / n) * n; do { crypto.getRandomValues(a); } while (a[0] >= lim); return a[0] % n; };
export const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const parseYmd = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const dayDiff = (a, b) => Math.round((parseYmd(ymd(b)) - parseYmd(ymd(a))) / 86400000);
export const WD = ["日", "月", "火", "水", "木", "金", "土"];
export const fmtDate = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
export const useList = (key, init = []) => {
  const [v, setV] = useState(() => store.get(key, init));
  const save = (n) => { setV(n); store.set(key, n); };
  return [v, save];
};

// ---------- 電卓 ----------
const evalExpr = (src) => {
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/\s/g, "");
  let i = 0;
  const post = (v) => { while (s[i] === "%") { v /= 100; i++; } return v; };
  const num = () => {
    if (s[i] === "(") { i++; const v = add(); if (s[i] !== ")") throw new Error("paren"); i++; return post(v); }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (!m) throw new Error("num");
    i += m[0].length;
    return post(parseFloat(m[0]));
  };
  const unary = () => { if (s[i] === "-") { i++; return -unary(); } if (s[i] === "+") { i++; return unary(); } return num(); };
  const mul = () => { let v = unary(); while (s[i] === "*" || s[i] === "/") { const o = s[i++]; const r = unary(); v = o === "*" ? v * r : v / r; } return v; };
  const add = () => { let v = mul(); while (s[i] === "+" || s[i] === "-") { const o = s[i++]; const r = mul(); v = o === "+" ? v + r : v - r; } return v; };
  const v = add();
  if (i < s.length) throw new Error("syntax");
  if (!Number.isFinite(v)) throw new Error("range");
  return parseFloat(v.toPrecision(12));
};
export const Calc = ({ showNotification }) => {
  const [expr, setExpr] = useState("");
  const [hist, setHist] = useList("toolbox.calc", []);
  const [err, setErr] = useState(false);
  let live = "";
  try { if (expr && /[\d)%]$/.test(expr)) live = String(evalExpr(expr)); } catch { /* 入力途中 */ }
  const press = (k) => {
    setErr(false);
    if (k === "C") return setExpr("");
    if (k === "⌫") return setExpr(expr.slice(0, -1));
    if (k === "=") {
      if (!expr) return;
      try { const r = String(evalExpr(expr)); setHist([{ e: expr, r }, ...hist].slice(0, 30)); setExpr(r); }
      catch { setErr(true); }
      return;
    }
    setExpr((expr + k).slice(0, 60));
  };
  const keys = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "%", "="];
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} text-right`}>
        <div className="text-sm text-gray-400 h-5 break-all">{err ? <span className="text-red-500">式が正しくありません</span> : live && live !== expr ? `= ${Number(live).toLocaleString("ja-JP", { maximumFractionDigits: 10 })}` : ""}</div>
        <div className="text-3xl font-black break-all min-h-[2.5rem]">{expr || "0"}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {keys.map((k) => (
          <button key={k} onClick={() => press(k)} className={`py-4 rounded-xl text-lg font-bold active:scale-95 transition-transform ${k === "=" ? "bg-green-500 text-white" : /[÷×\-+]/.test(k) ? "bg-green-50 text-green-700" : k === "C" ? "bg-red-50 text-red-500" : "bg-white border"}`}>{k}</button>
        ))}
        <button onClick={() => press("⌫")} className="col-span-4 py-2.5 rounded-xl bg-gray-100 text-sm font-bold">⌫ 1文字消す</button>
      </div>
      {hist.length > 0 && (
        <div className={card}>
          <div className="flex justify-between text-xs font-bold text-gray-400 mb-1"><span>履歴</span><button onClick={() => setHist([])} className="text-red-500">消去</button></div>
          {hist.slice(0, 8).map((h, i) => <button key={i} onClick={() => setExpr(h.r)} className="w-full flex justify-between py-1.5 text-sm text-left"><span className="text-gray-400 truncate">{h.e}</span><span className="font-bold ml-3">{h.r}</span></button>)}
          <button onClick={() => copy(hist.map((h) => `${h.e} = ${h.r}`).join("\n"), showNotification)} className="text-xs font-bold text-green-600 mt-1 flex items-center gap-1"><Copy className="w-3 h-3" />履歴をコピー</button>
        </div>
      )}
    </div>
  );
};

// ---------- 単位変換 ----------
const UNITS = {
  長さ: [["mm", 0.001], ["cm", 0.01], ["m", 1], ["km", 1000], ["インチ", 0.0254], ["フィート", 0.3048], ["ヤード", 0.9144], ["マイル", 1609.344], ["尺", 0.303030]],
  重さ: [["mg", 0.001], ["g", 1], ["kg", 1000], ["トン", 1e6], ["オンス", 28.3495], ["ポンド", 453.592], ["貫", 3750]],
  面積: [["cm²", 1e-4], ["m²", 1], ["ヘクタール", 1e4], ["km²", 1e6], ["坪", 3.305785], ["畳", 1.62], ["エーカー", 4046.856], ["ft²", 0.092903]],
  体積: [["mL", 0.001], ["L", 1], ["m³", 1000], ["合", 0.18039], ["升", 1.8039], ["ガロン(US)", 3.785412], ["カップ(US)", 0.236588]],
  速度: [["m/s", 1], ["km/h", 1 / 3.6], ["mph", 0.44704], ["ノット", 0.514444]],
  データ: [["B", 1], ["KB", 1024], ["MB", 1048576], ["GB", 1073741824], ["TB", 1099511627776]],
  温度: [["℃"], ["℉"], ["K"]],
};
const toBaseTemp = (v, u) => (u === "℃" ? v : u === "℉" ? ((v - 32) * 5) / 9 : v - 273.15);
const fromBaseTemp = (c, u) => (u === "℃" ? c : u === "℉" ? (c * 9) / 5 + 32 : c + 273.15);
export const Units = () => {
  const [cat, setCat] = useState("長さ");
  const [v, setV] = useState("1");
  const [from, setFrom] = useState(0);
  const list = UNITS[cat];
  const n = parseFloat(v);
  const conv = (idx) => {
    if (!Number.isFinite(n)) return "";
    const r = cat === "温度" ? fromBaseTemp(toBaseTemp(n, list[from][0]), list[idx][0]) : (n * list[from][1]) / list[idx][1];
    return parseFloat(r.toPrecision(8)).toLocaleString("ja-JP", { maximumFractionDigits: 8 });
  };
  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap gap-2">{Object.keys(UNITS).map((c) => <button key={c} onClick={() => { setCat(c); setFrom(0); }} className={`px-3 py-1.5 rounded-full text-xs font-bold ${cat === c ? "bg-green-500 text-white" : "bg-white border text-gray-500"}`}>{c}</button>)}</div>
      <div className={`${card} flex gap-2`}>
        <input type="number" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} className={`${inp} text-lg font-bold`} />
        <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className="bg-gray-100 rounded-xl px-2 text-sm font-bold outline-none">{list.map((u, i) => <option key={u[0]} value={i}>{u[0]}</option>)}</select>
      </div>
      <div className={`${card} divide-y`}>
        {list.map((u, i) => i !== from && <div key={u[0]} className="flex justify-between py-2.5 text-sm"><span className="text-gray-500 font-bold">{u[0]}</span><span className="font-black break-all text-right">{conv(i) || "-"}</span></div>)}
      </div>
    </div>
  );
};

// ---------- 日付計算 ----------
export const DateCalc = () => {
  const today = ymd(new Date());
  const [mode, setMode] = useState("diff");
  const [a, setA] = useState(today);
  const [b, setB] = useState(ymd(new Date(Date.now() + 100 * 86400000)));
  const [n, setN] = useState(30);
  const d = dayDiff(parseYmd(a), parseYmd(b));
  const res = useMemo(() => { const x = parseYmd(a); x.setDate(x.getDate() + Number(n || 0)); return x; }, [a, n]);
  return (
    <div className="p-4 space-y-3">
      <div className="flex bg-gray-200 rounded-xl p-1">{[["diff", "日数の差"], ["add", "○日後・前"]].map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={`flex-1 py-2 rounded-lg text-xs font-bold ${mode === k ? "bg-white shadow-sm" : "text-gray-500"}`}>{l}</button>)}</div>
      <div className={`${card} space-y-3`}>
        <label className="block text-xs font-bold text-gray-500">{mode === "diff" ? "開始日" : "基準日"}<input type="date" value={a} onChange={(e) => setA(e.target.value || today)} className={`${inp} mt-1`} /></label>
        {mode === "diff"
          ? <label className="block text-xs font-bold text-gray-500">終了日<input type="date" value={b} onChange={(e) => setB(e.target.value || today)} className={`${inp} mt-1`} /></label>
          : <label className="block text-xs font-bold text-gray-500">日数（マイナスで前）<input type="number" value={n} onChange={(e) => setN(e.target.value)} className={`${inp} mt-1`} /></label>}
      </div>
      <div className={`${card} text-center`}>
        {mode === "diff" ? (
          <>
            <div className="text-xs text-gray-400">{fmtDate(parseYmd(a))} → {fmtDate(parseYmd(b))}</div>
            <div className="text-4xl font-black text-green-600 my-1">{Math.abs(d).toLocaleString()}日</div>
            <div className="text-xs text-gray-500">{Math.floor(Math.abs(d) / 7)}週{Math.abs(d) % 7}日 ／ 約{(Math.abs(d) / 30.4375).toFixed(1)}か月 ／ 約{(Math.abs(d) / 365.25).toFixed(2)}年{d < 0 ? "（終了日が過去）" : ""}</div>
          </>
        ) : (
          <>
            <div className="text-xs text-gray-400">{fmtDate(parseYmd(a))} の {Math.abs(Number(n) || 0)}日{Number(n) < 0 ? "前" : "後"}</div>
            <div className="text-2xl font-black text-green-600 my-1">{fmtDate(res)}</div>
          </>
        )}
      </div>
    </div>
  );
};

// ---------- カウントダウン ----------
export const Countdown = () => {
  const [items, save] = useList("toolbox.countdown", []);
  const [name, setName] = useState("");
  const [date, setDate] = useState(ymd(new Date(Date.now() + 30 * 86400000)));
  const add = () => { if (!name.trim()) return; save([...items, { id: Date.now(), name: name.trim().slice(0, 30), date }]); setName(""); };
  const rows = items.map((i) => ({ ...i, left: dayDiff(new Date(), parseYmd(i.date)) })).sort((x, y) => Math.abs(x.left) - Math.abs(y.left)).sort((x, y) => (x.left < 0) - (y.left < 0));
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} space-y-2`}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="イベント名（例: 旅行・誕生日）" className={inp} />
        <div className="flex gap-2"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} /><button onClick={add} className="px-4 rounded-xl bg-green-500 text-white" aria-label="追加"><Plus className="w-5 h-5" /></button></div>
      </div>
      {rows.length === 0 && <div className="text-center text-xs text-gray-400 py-8">イベントを追加すると、あと何日か表示されます</div>}
      {rows.map((r) => (
        <div key={r.id} className="bg-white border rounded-2xl p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0"><div className="font-bold truncate">{r.name}</div><div className="text-[11px] text-gray-400">{fmtDate(parseYmd(r.date))}</div></div>
          <div className={`text-right ${r.left < 0 ? "text-gray-400" : "text-green-600"}`}>{r.left === 0 ? <span className="text-xl font-black">今日！</span> : <><span className="text-3xl font-black tabular-nums">{Math.abs(r.left)}</span><span className="text-xs font-bold"> 日{r.left < 0 ? "経過" : "後"}</span></>}</div>
          <button onClick={() => save(items.filter((x) => x.id !== r.id))} aria-label="削除" className="text-gray-300"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );
};

// ---------- 世界時計 ----------
const CITIES = [["東京", "Asia/Tokyo"], ["ソウル", "Asia/Seoul"], ["上海", "Asia/Shanghai"], ["バンコク", "Asia/Bangkok"], ["デリー", "Asia/Kolkata"], ["ドバイ", "Asia/Dubai"], ["ロンドン", "Europe/London"], ["パリ", "Europe/Paris"], ["ニューヨーク", "America/New_York"], ["シカゴ", "America/Chicago"], ["ロサンゼルス", "America/Los_Angeles"], ["ホノルル", "Pacific/Honolulu"], ["シドニー", "Australia/Sydney"], ["オークランド", "Pacific/Auckland"]];
const tzOffsetMin = (tz, at = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(at).map((x) => [x.type, x.value]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000) / 60000;
};
export const WorldClock = () => {
  const [sel, save] = useList("toolbox.worldclock", ["Asia/Tokyo", "America/New_York", "Europe/London"]);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const mine = -now.getTimezoneOffset();
  return (
    <div className="p-4 space-y-3">
      {sel.map((tz) => {
        const c = CITIES.find((x) => x[1] === tz);
        const diff = (tzOffsetMin(tz, now) - mine) / 60;
        return (
          <div key={tz} className="bg-white border rounded-2xl p-4 flex items-center gap-3">
            <div className="flex-1"><div className="font-bold">{c?.[0] || tz}</div><div className="text-[11px] text-gray-400">{new Intl.DateTimeFormat("ja-JP", { timeZone: tz, month: "numeric", day: "numeric", weekday: "short" }).format(now)}　{diff === 0 ? "この端末と同じ" : `${diff > 0 ? "+" : ""}${diff}時間`}</div></div>
            <div className="text-3xl font-black tabular-nums">{new Intl.DateTimeFormat("ja-JP", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now)}</div>
            <button onClick={() => save(sel.filter((x) => x !== tz))} aria-label="削除" className="text-gray-300"><Trash2 className="w-4 h-4" /></button>
          </div>
        );
      })}
      <select value="" onChange={(e) => e.target.value && save([...sel, e.target.value])} className={inp}>
        <option value="">＋ 都市を追加</option>
        {CITIES.filter((c) => !sel.includes(c[1])).map((c) => <option key={c[1]} value={c[1]}>{c[0]}</option>)}
      </select>
    </div>
  );
};

// ---------- 習慣トラッカー ----------
const streakOf = (days) => {
  let s = 0; const d = new Date();
  if (!days[ymd(d)]) d.setDate(d.getDate() - 1); // 今日まだなら昨日から数える
  while (days[ymd(d)]) { s++; d.setDate(d.getDate() - 1); }
  return s;
};
export const Habits = () => {
  const [hs, save] = useList("toolbox.habits", []);
  const [name, setName] = useState("");
  const today = ymd(new Date());
  const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  const toggle = (id, day) => save(hs.map((h) => (h.id === id ? { ...h, days: { ...h.days, [day]: !h.days[day] } } : h)));
  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && name.trim() && (save([...hs, { id: Date.now(), name: name.trim(), days: {} }]), setName(""))} placeholder="続けたい習慣（例: 散歩・読書）" className={inp} />
        <button onClick={() => { if (name.trim()) { save([...hs, { id: Date.now(), name: name.trim(), days: {} }]); setName(""); } }} className="px-4 rounded-xl bg-green-500 text-white" aria-label="追加"><Plus className="w-5 h-5" /></button></div>
      {hs.length === 0 && <div className="text-center text-xs text-gray-400 py-8">習慣を追加して、毎日チェックしましょう</div>}
      {hs.map((h) => (
        <div key={h.id} className={card}>
          <div className="flex items-center gap-2 mb-3"><span className="flex-1 font-bold truncate">{h.name}</span><span className="text-xs font-black text-orange-500">🔥 {streakOf(h.days)}日連続</span>
            <button onClick={() => window.confirm("削除しますか？") && save(hs.filter((x) => x.id !== h.id))} aria-label="削除" className="text-gray-300"><Trash2 className="w-4 h-4" /></button></div>
          <div className="flex justify-between">
            {last7.map((d) => { const k = ymd(d); const on = !!h.days[k]; return (
              <button key={k} onClick={() => toggle(h.id, k)} className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-gray-400">{WD[d.getDay()]}</span>
                <span className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 ${on ? "bg-green-500 border-green-500 text-white" : k === today ? "border-green-400 text-green-500" : "border-gray-200 text-gray-300"}`}>{on ? "✓" : d.getDate()}</span>
              </button>); })}
          </div>
        </div>
      ))}
    </div>
  );
};

// ---------- 家計簿 ----------
const CATS = ["食費", "日用品", "交通", "趣味", "交際", "住居・光熱", "その他"];
export const Ledger = ({ showNotification }) => {
  const [rows, save] = useList("toolbox.ledger", []);
  const [ym, setYm] = useState(ymd(new Date()).slice(0, 7));
  const [f, setF] = useState({ type: "out", amount: "", cat: CATS[0], memo: "" });
  const add = () => {
    const a = Math.round(Number(f.amount));
    if (!(a > 0)) return showNotification?.("金額を入力してください");
    save([{ id: Date.now(), date: ymd(new Date()), type: f.type, amount: a, cat: f.type === "in" ? "収入" : f.cat, memo: f.memo.trim().slice(0, 30) }, ...rows]);
    setF({ ...f, amount: "", memo: "" });
  };
  const month = rows.filter((r) => r.date.startsWith(ym));
  const out = month.filter((r) => r.type === "out"), inc = month.filter((r) => r.type === "in");
  const sum = (a) => a.reduce((s, r) => s + r.amount, 0);
  const by = Object.entries(out.reduce((m, r) => ({ ...m, [r.cat]: (m[r.cat] || 0) + r.amount }), {})).sort((a, b) => b[1] - a[1]);
  const shift = (d) => { const [y, m] = ym.split("-").map(Number); const x = new Date(y, m - 1 + d, 1); setYm(ymd(x).slice(0, 7)); };
  const yen = (n) => `¥${n.toLocaleString()}`;
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} space-y-2`}>
        <div className="flex bg-gray-100 rounded-lg p-0.5">{[["out", "支出"], ["in", "収入"]].map(([k, l]) => <button key={k} onClick={() => setF({ ...f, type: k })} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${f.type === k ? "bg-white shadow-sm" : "text-gray-500"}`}>{l}</button>)}</div>
        <div className="flex gap-2"><input type="number" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="金額" className={inp} />
          {f.type === "out" && <select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} className="bg-gray-100 rounded-xl px-2 text-sm font-bold outline-none">{CATS.map((c) => <option key={c}>{c}</option>)}</select>}</div>
        <div className="flex gap-2"><input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} placeholder="メモ（任意）" className={inp} /><button onClick={add} className="px-4 rounded-xl bg-green-500 text-white" aria-label="追加"><Plus className="w-5 h-5" /></button></div>
      </div>
      <div className="flex items-center justify-between"><button onClick={() => shift(-1)} className="px-3 py-1 text-lg">‹</button><div className="font-bold">{ym.replace("-", "年")}月</div><button onClick={() => shift(1)} className="px-3 py-1 text-lg">›</button></div>
      <div className={`${card} grid grid-cols-3 text-center`}>
        <div><div className="text-[10px] text-gray-400">収入</div><div className="font-black text-blue-500">{yen(sum(inc))}</div></div>
        <div><div className="text-[10px] text-gray-400">支出</div><div className="font-black text-red-500">{yen(sum(out))}</div></div>
        <div><div className="text-[10px] text-gray-400">収支</div><div className={`font-black ${sum(inc) - sum(out) < 0 ? "text-red-500" : "text-green-600"}`}>{yen(sum(inc) - sum(out))}</div></div>
      </div>
      {by.length > 0 && <div className={`${card} space-y-2`}>{by.map(([c, v]) => <div key={c}><div className="flex justify-between text-xs font-bold"><span>{c}</span><span>{yen(v)}（{Math.round((v / sum(out)) * 100)}%）</span></div><div className="h-2 bg-gray-100 rounded-full"><div className="h-2 bg-green-500 rounded-full" style={{ width: `${(v / by[0][1]) * 100}%` }} /></div></div>)}</div>}
      <div className="bg-white border rounded-2xl divide-y">
        {month.length === 0 && <div className="text-center text-xs text-gray-400 py-6">この月の記録はありません</div>}
        {month.map((r) => <div key={r.id} className="flex items-center gap-3 px-4 py-2.5"><div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{r.cat}{r.memo && <span className="font-normal text-gray-400"> ・{r.memo}</span>}</div><div className="text-[10px] text-gray-400">{r.date}</div></div><div className={`font-black ${r.type === "in" ? "text-blue-500" : ""}`}>{r.type === "in" ? "+" : "−"}{yen(r.amount)}</div><button onClick={() => save(rows.filter((x) => x.id !== r.id))} aria-label="削除" className="text-gray-300"><Trash2 className="w-4 h-4" /></button></div>)}
      </div>
      {month.length > 0 && <button onClick={() => copy("日付,種別,カテゴリ,金額,メモ\n" + month.map((r) => [r.date, r.type === "in" ? "収入" : "支出", r.cat, r.amount, `"${r.memo.replace(/"/g, '""')}"`].join(",")).join("\n"), showNotification)} className="text-xs font-bold text-green-600 flex items-center gap-1"><Copy className="w-3 h-3" />この月をCSVでコピー</button>}
    </div>
  );
};

// ---------- チーム分け ----------
export const Teams = ({ showNotification }) => {
  const [text, setText] = useState(store.get("toolbox.teams", "Aさん\nBさん\nCさん\nDさん\nEさん\nFさん"));
  const [k, setK] = useState(2);
  const [res, setRes] = useState([]);
  const names = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const run = () => {
    const g = Array.from({ length: Math.min(k, names.length) }, () => []);
    shuffle(names).forEach((n, i) => g[i % g.length].push(n));
    setRes(g);
  };
  return (
    <div className="p-4 space-y-3">
      <div className={card}>
        <div className="text-xs font-bold text-gray-500 mb-1">メンバー（1行に1人・{names.length}人）</div>
        <textarea value={text} onChange={(e) => { setText(e.target.value); store.set("toolbox.teams", e.target.value); }} rows={6} className={`${inp} resize-none`} />
        <div className="flex items-center gap-3 mt-3"><span className="flex-1 text-sm font-bold">チーム数</span>
          <button onClick={() => setK(Math.max(2, k - 1))} className="w-9 h-9 rounded-full bg-gray-100 font-bold">−</button><span className="w-6 text-center font-black">{k}</span><button onClick={() => setK(Math.min(10, k + 1))} className="w-9 h-9 rounded-full bg-gray-100 font-bold">＋</button></div>
        <button onClick={run} disabled={names.length < 2} className={`${btn} w-full mt-3 bg-green-500 text-white disabled:opacity-50`}>チーム分けする</button>
      </div>
      {res.map((g, i) => <div key={i} className={card}><div className="text-xs font-black text-green-600 mb-1">チーム {i + 1}（{g.length}人）</div><div className="text-sm font-bold">{g.join("、")}</div></div>)}
      {res.length > 0 && <button onClick={() => copy(res.map((g, i) => `チーム${i + 1}: ${g.join("、")}`).join("\n"), showNotification)} className="text-xs font-bold text-green-600 flex items-center gap-1"><Copy className="w-3 h-3" />結果をコピー（トークに貼り付け）</button>}
    </div>
  );
};

// ---------- サイコロ・コイン ----------
export const Dice = () => {
  const [cnt, setCnt] = useState(2);
  const [sides, setSides] = useState(6);
  const [out, setOut] = useState(null);
  const [coin, setCoin] = useState("");
  const roll = () => setOut(Array.from({ length: cnt }, () => rnd(sides) + 1));
  return (
    <div className="p-4 space-y-3">
      <div className={card}>
        <div className="flex items-center gap-3 mb-3"><span className="flex-1 text-sm font-bold">個数</span>
          <button onClick={() => setCnt(Math.max(1, cnt - 1))} className="w-9 h-9 rounded-full bg-gray-100 font-bold">−</button><span className="w-6 text-center font-black">{cnt}</span><button onClick={() => setCnt(Math.min(10, cnt + 1))} className="w-9 h-9 rounded-full bg-gray-100 font-bold">＋</button></div>
        <div className="flex gap-2 mb-3">{[4, 6, 8, 10, 12, 20, 100].map((s) => <button key={s} onClick={() => setSides(s)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${sides === s ? "bg-green-500 text-white" : "bg-gray-100"}`}>{s}面</button>)}</div>
        <button onClick={roll} className={`${btn} w-full bg-green-500 text-white`}>振る</button>
        {out && <div className="mt-4 text-center"><div className="flex flex-wrap justify-center gap-2">{out.map((v, i) => <span key={i} className="min-w-[3rem] h-12 px-2 rounded-xl bg-green-50 text-green-700 text-2xl font-black flex items-center justify-center">{v}</span>)}</div>{out.length > 1 && <div className="text-xs text-gray-500 mt-2">合計 {out.reduce((a, b) => a + b, 0)}</div>}</div>}
      </div>
      <div className={`${card} text-center`}>
        <button onClick={() => setCoin(rnd(2) ? "表" : "裏")} className={`${btn} w-full bg-amber-100 text-amber-700`}>コインを投げる</button>
        {coin && <div className="text-3xl font-black mt-3">{coin}</div>}
      </div>
    </div>
  );
};

// ---------- 目覚まし ----------
export const Alarms = () => {
  const [list, setList] = useState(loadAlarms);
  const [time, setTime] = useState("07:00");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState([]);
  const save = (n) => { setList(n); saveAlarms(n); };
  const add = () => { save([...list, { id: Date.now(), time, label: label.trim().slice(0, 20), days, on: true }].sort((a, b) => a.time.localeCompare(b.time))); setLabel(""); };
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} space-y-3`}>
        <div className="flex gap-2"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${inp} text-xl font-black w-36`} /><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ラベル（任意）" className={inp} /></div>
        <div className="flex justify-between">{WD.map((w, i) => <button key={w} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])} className={`w-9 h-9 rounded-full text-xs font-bold ${days.includes(i) ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500"}`}>{w}</button>)}</div>
        <div className="text-[10px] text-gray-400">曜日を選ばないと1回だけ鳴ります。音は「着信音」で選んだものです。</div>
        <button onClick={add} className={`${btn} w-full bg-green-500 text-white`}>目覚ましを追加</button>
      </div>
      {list.map((a) => (
        <div key={a.id} className="bg-white border rounded-2xl p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0"><div className={`text-3xl font-black tabular-nums ${a.on ? "" : "text-gray-300"}`}>{a.time}</div><div className="text-[11px] text-gray-400 truncate">{a.label || "目覚まし"}　{a.days?.length ? a.days.map((d) => WD[d]).join("") : "1回のみ"}</div></div>
          <button onClick={() => save(list.map((x) => (x.id === a.id ? { ...x, on: !x.on } : x)))} aria-label="オン/オフ" className={`w-11 h-6 rounded-full p-0.5 transition-colors ${a.on ? "bg-green-500" : "bg-gray-300"}`}><span className={`block w-5 h-5 rounded-full bg-white transition-transform ${a.on ? "translate-x-5" : ""}`} /></button>
          <button onClick={() => save(list.filter((x) => x.id !== a.id))} aria-label="削除" className="text-gray-300"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <p className="text-[10px] text-gray-400 leading-snug">⚠ アプリ（このページ）を開いている間だけ鳴ります。ブラウザを閉じる・スリープ中は鳴りません。大事な予定にはリマインダー（プッシュ通知）も併用してください。</p>
    </div>
  );
};

// ---------- ポモドーロ ----------
const PH = { work: ["集中", 25], short: ["休憩", 5], long: ["長い休憩", 15] };
export const Pomodoro = ({ showNotification }) => {
  const [phase, setPhase] = useState("work");
  const [round, setRound] = useState(1);
  const [endAt, setEndAt] = useState(null);
  const [remain, setRemain] = useState(PH.work[1] * 60000);
  const [done, setDone] = useState(() => store.get("toolbox.pomo." + ymd(new Date()), 0));
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 250); return () => { clearInterval(id); stopPreview(); }; }, []);
  const left = endAt ? Math.max(0, endAt - Date.now()) : remain;
  const next = () => {
    let np = "work", nr = round;
    if (phase === "work") { np = round % 4 === 0 ? "long" : "short"; const d = done + 1; setDone(d); store.set("toolbox.pomo." + ymd(new Date()), d); }
    else nr = phase === "long" ? 1 : round + 1;
    setPhase(np); setRound(nr); setEndAt(null); setRemain(PH[np][1] * 60000);
  };
  useEffect(() => {
    if (endAt && left <= 0) {
      showNotification?.(phase === "work" ? "お疲れさま！休憩しましょう" : "休憩おわり。次の集中へ");
      playPreview(getRingSettings().incoming, {});
      next();
    }
  });
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} text-center`}>
        <div className={`inline-block px-3 py-1 rounded-full text-xs font-black ${phase === "work" ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"}`}>{PH[phase][0]}（{round}/4）</div>
        <div className="text-6xl font-black tabular-nums my-4">{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}</div>
        <div className="flex gap-2">
          {endAt ? <button onClick={() => { setRemain(left); setEndAt(null); }} className={`${btn} flex-1 bg-amber-100 text-amber-700 flex items-center justify-center gap-1.5`}><Pause className="w-4 h-4" />一時停止</button>
            : <button onClick={() => { stopPreview(); setEndAt(Date.now() + remain); }} className={`${btn} flex-1 bg-green-500 text-white flex items-center justify-center gap-1.5`}><Play className="w-4 h-4" />スタート</button>}
          <button onClick={() => { setEndAt(null); setPhase("work"); setRound(1); setRemain(PH.work[1] * 60000); stopPreview(); }} className={`${btn} px-4 bg-gray-100 flex items-center gap-1.5`}><RotateCcw className="w-4 h-4" />最初から</button>
          <button onClick={next} className={`${btn} px-4 bg-gray-100`}>スキップ</button>
        </div>
        <div className="text-xs text-gray-500 mt-4">今日の集中: <b className="text-red-500">{done}</b> セット（{done * 25}分）</div>
        <button onClick={stopPreview} className="mt-2 text-[11px] text-gray-400 flex items-center gap-1 mx-auto"><BellOff className="w-3 h-3" />音を止める</button>
      </div>
      <p className="text-[10px] text-gray-400">25分集中 → 5分休憩を4回くり返し、そのあと15分休みます。ページを開いたままにしてください。</p>
    </div>
  );
};

// ---------- 定型文 ----------
export const Snippets = ({ showNotification }) => {
  const [items, save] = useList("toolbox.snippets", ["了解です！", "ありがとうございます。助かります！", "今から向かいます。少し遅れそうです。", "あとで連絡しますね。"]);
  const [t, setT] = useState("");
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} space-y-2`}>
        <textarea value={t} onChange={(e) => setT(e.target.value.slice(0, 300))} rows={3} placeholder="よく使う文章を登録" className={`${inp} resize-none`} />
        <button onClick={() => { if (t.trim()) { save([t.trim(), ...items]); setT(""); } }} className={`${btn} w-full bg-green-500 text-white`}>登録</button>
      </div>
      <p className="text-[11px] text-gray-400">タップでコピーします。トークの入力欄に貼り付けて使ってください。</p>
      {items.map((x, i) => <div key={i} className="bg-white border rounded-xl flex items-start gap-2 px-3 py-2.5"><button onClick={() => copy(x, showNotification)} className="flex-1 text-left text-sm whitespace-pre-wrap break-words">{x}</button><button onClick={() => save(items.filter((_, j) => j !== i))} aria-label="削除" className="text-gray-300 mt-0.5"><Trash2 className="w-4 h-4" /></button></div>)}
    </div>
  );
};

// ---------- 文字数カウント ----------
export const Counter = ({ showNotification }) => {
  const [t, setT] = useState("");
  const noSp = t.replace(/\s/g, "");
  const bytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(t).length : t.length;
  const zen2han = (s) => s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const stats = [["文字数", [...t].length], ["空白・改行を除く", [...noSp].length], ["行数", t ? t.split("\n").length : 0], ["UTF-8バイト", bytes], ["原稿用紙(400字)", ([...t].length / 400).toFixed(1) + "枚"]];
  return (
    <div className="p-4 space-y-3">
      <textarea value={t} onChange={(e) => setT(e.target.value)} rows={8} placeholder="ここに文章を入力・貼り付け" className={`${inp} bg-white resize-none`} />
      <div className="grid grid-cols-2 gap-2">{stats.map(([l, v]) => <div key={l} className="bg-white border rounded-xl p-3"><div className="text-[10px] text-gray-400">{l}</div><div className="text-xl font-black">{typeof v === "number" ? v.toLocaleString() : v}</div></div>)}</div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setT(t.replace(/\n+/g, " "))} className="px-3 py-2 rounded-lg bg-white border text-xs font-bold">改行を消す</button>
        <button onClick={() => setT(zen2han(t))} className="px-3 py-2 rounded-lg bg-white border text-xs font-bold">全角英数→半角</button>
        <button onClick={() => setT(t.split("\n").map((l) => l.trim()).filter(Boolean).join("\n"))} className="px-3 py-2 rounded-lg bg-white border text-xs font-bold">空行を詰める</button>
        <button onClick={() => copy(t, showNotification)} disabled={!t} className="px-3 py-2 rounded-lg bg-green-500 text-white text-xs font-bold disabled:opacity-40">コピー</button>
      </div>
    </div>
  );
};
