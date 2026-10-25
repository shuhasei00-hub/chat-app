// 便利ボックスの追加ツール その2（税計算・和暦・文字変換・色・健康記録・メトロノーム・環境音・画像リサイズ・録音・お絵描き・あみだ・暗記カード・チェックリスト）
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Copy, Play, Square, Mic, Download, RotateCcw, Check } from "lucide-react";
import { ymd } from "./common";
import { store, copy, card, btn, inp, rnd, shuffle, useList, parseYmd, WD } from "./ToolboxMore";

const yen = (n) => `¥${Math.round(n).toLocaleString()}`;
const dl = (blob, name) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : `${Math.round(n / 1024)}KB`);

// ---------- 税・割引 ----------
export const Tax = ({ showNotification }) => {
  const [price, setPrice] = useState("");
  const [rate, setRate] = useState(10);
  const [incl, setIncl] = useState(false);   // 入力が税込か
  const [off, setOff] = useState("0");        // 割引
  const [offType, setOffType] = useState("pct");
  const p = Math.max(0, Number(price) || 0);
  const exTax = incl ? Math.floor((p * 100) / (100 + rate)) : p;
  const inTax = incl ? p : Math.floor((p * (100 + rate)) / 100);
  const o = Math.max(0, Number(off) || 0);
  const afterIn = Math.max(0, offType === "pct" ? Math.floor(inTax * (1 - Math.min(100, o) / 100)) : inTax - o);
  const rows = [["税抜", exTax], ["消費税", inTax - exTax], ["税込", inTax]];
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} space-y-3`}>
        <div className="flex bg-gray-100 rounded-lg p-0.5">{[[false, "税抜で入力"], [true, "税込で入力"]].map(([k, l]) => <button key={l} onClick={() => setIncl(k)} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${incl === k ? "bg-white shadow-sm" : "text-gray-500"}`}>{l}</button>)}</div>
        <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="金額（円）" className={`${inp} text-lg font-bold`} />
        <div className="flex gap-2">{[10, 8, 0].map((r) => <button key={r} onClick={() => setRate(r)} className={`flex-1 py-2 rounded-lg text-xs font-bold ${rate === r ? "bg-green-500 text-white" : "bg-gray-100"}`}>{r}%</button>)}</div>
      </div>
      <div className={`${card} grid grid-cols-3 text-center`}>{rows.map(([l, v]) => <div key={l}><div className="text-[10px] text-gray-400">{l}</div><div className="font-black">{yen(v)}</div></div>)}</div>
      <div className={`${card} space-y-2`}>
        <div className="text-xs font-bold text-gray-500">割引（税込価格から）</div>
        <div className="flex gap-2"><input type="number" value={off} onChange={(e) => setOff(e.target.value)} className={inp} />
          <select value={offType} onChange={(e) => setOffType(e.target.value)} className="bg-gray-100 rounded-xl px-2 text-sm font-bold outline-none"><option value="pct">％引き</option><option value="yen">円引き</option></select></div>
        <div className="text-center"><div className="text-[11px] text-gray-400">割引後（税込）</div><div className="text-3xl font-black text-green-600">{yen(afterIn)}</div><div className="text-[11px] text-gray-400">{yen(inTax - afterIn)} おトク</div></div>
        <button onClick={() => copy(`税抜${yen(exTax)} / 税込${yen(inTax)} / 割引後${yen(afterIn)}`, showNotification)} className="text-xs font-bold text-green-600 flex items-center gap-1 mx-auto"><Copy className="w-3 h-3" />結果をコピー</button>
      </div>
      <p className="text-[10px] text-gray-400">端数は切り捨てです（お店によって違う場合があります）。</p>
    </div>
  );
};

// ---------- 和暦・年齢・干支 ----------
const ERAS = [["令和", 2019, 5, 1], ["平成", 1989, 1, 8], ["昭和", 1926, 12, 25], ["大正", 1912, 7, 30], ["明治", 1868, 1, 25]];
const eraOf = (d) => { for (const [n, y, m, dd] of ERAS) if (d >= new Date(y, m - 1, dd)) return `${n}${d.getFullYear() - y + 1 === 1 ? "元" : d.getFullYear() - y + 1}年`; return "明治以前"; };
const ETO = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const ZODIAC = [[1, 20, "みずがめ座"], [2, 19, "うお座"], [3, 21, "おひつじ座"], [4, 20, "おうし座"], [5, 21, "ふたご座"], [6, 22, "かに座"], [7, 23, "しし座"], [8, 23, "おとめ座"], [9, 23, "てんびん座"], [10, 24, "さそり座"], [11, 23, "いて座"], [12, 22, "やぎ座"]];
const starOf = (d) => { const m = d.getMonth() + 1, day = d.getDate(); let r = "やぎ座"; for (const [mm, dd, n] of ZODIAC) if (m > mm || (m === mm && day >= dd)) r = n; return r; };
export const Wareki = () => {
  const [d, setD] = useState("2000-01-01");
  const [era, setEra] = useState(0);
  const [ey, setEy] = useState(6);
  const dt = parseYmd(d);
  const now = new Date();
  let age = now.getFullYear() - dt.getFullYear();
  if (now < new Date(now.getFullYear(), dt.getMonth(), dt.getDate())) age--;
  let nb = new Date(now.getFullYear(), dt.getMonth(), dt.getDate());
  if (nb < new Date(now.getFullYear(), now.getMonth(), now.getDate())) nb = new Date(now.getFullYear() + 1, dt.getMonth(), dt.getDate());
  const days = Math.round((nb - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const seireki = ERAS[era][1] + Number(ey) - 1;
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} space-y-2`}>
        <label className="block text-xs font-bold text-gray-500">生年月日・調べたい日<input type="date" value={d} onChange={(e) => setD(e.target.value || "2000-01-01")} className={`${inp} mt-1`} /></label>
        <div className="grid grid-cols-2 gap-2 text-center">
          {[["和暦", eraOf(dt)], ["西暦", `${dt.getFullYear()}年`], ["年齢（今日）", `${Math.max(0, age)}歳`], ["曜日", `${WD[dt.getDay()]}曜日`], ["干支", `${ETO[(dt.getFullYear() - 4) % 12]}年`], ["星座", starOf(dt)]].map(([l, v]) => <div key={l} className="bg-gray-50 rounded-xl py-2"><div className="text-[10px] text-gray-400">{l}</div><div className="font-black">{v}</div></div>)}
        </div>
        <div className="text-center text-xs text-gray-500">次の誕生日（記念日）まで <b className="text-green-600">{days}</b> 日</div>
      </div>
      <div className={`${card} space-y-2`}>
        <div className="text-xs font-bold text-gray-500">和暦 → 西暦</div>
        <div className="flex gap-2 items-center">
          <select value={era} onChange={(e) => setEra(Number(e.target.value))} className="bg-gray-100 rounded-xl px-2 py-2.5 text-sm font-bold outline-none">{ERAS.map((e, i) => <option key={e[0]} value={i}>{e[0]}</option>)}</select>
          <input type="number" min={1} value={ey} onChange={(e) => setEy(Math.max(1, Number(e.target.value) || 1))} className={inp} /><span className="text-sm font-bold">年 →</span>
          <span className="text-xl font-black text-green-600 whitespace-nowrap">{seireki}年</span>
        </div>
      </div>
    </div>
  );
};

// ---------- 文字変換 ----------
const toKata = (s) => s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const toHira = (s) => s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const toHan = (s) => s.replace(/[Ａ-Ｚａ-ｚ０-９！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, " ");
const toZen = (s) => s.replace(/[A-Za-z0-9!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/ /g, "　");
const OPS = [
  ["ひらがな→カタカナ", toKata], ["カタカナ→ひらがな", toHira], ["全角→半角", toHan], ["半角→全角", toZen],
  ["大文字", (s) => s.toUpperCase()], ["小文字", (s) => s.toLowerCase()],
  ["前後の空白を消す", (s) => s.split("\n").map((l) => l.trim()).join("\n")],
  ["重複行を消す", (s) => [...new Set(s.split("\n"))].join("\n")],
  ["行を並べ替え", (s) => s.split("\n").sort((a, b) => a.localeCompare(b, "ja")).join("\n")],
  ["行をシャッフル", (s) => shuffle(s.split("\n")).join("\n")],
  ["行を逆順", (s) => s.split("\n").reverse().join("\n")],
  ["URLエンコード", (s) => encodeURIComponent(s)],
  ["URLデコード", (s) => { try { return decodeURIComponent(s); } catch { return s; } }],
];
export const TextConv = ({ showNotification }) => {
  const [t, setT] = useState("");
  const [undo, setUndo] = useState([]);
  const apply = (f) => { setUndo([t, ...undo].slice(0, 10)); setT(f(t)); };
  return (
    <div className="p-4 space-y-3">
      <textarea value={t} onChange={(e) => setT(e.target.value)} rows={7} placeholder="変換したい文章を入力・貼り付け" className={`${inp} bg-white resize-none`} />
      <div className="flex flex-wrap gap-2">{OPS.map(([l, f]) => <button key={l} onClick={() => apply(f)} className="px-3 py-2 rounded-lg bg-white border text-xs font-bold">{l}</button>)}</div>
      <div className="flex gap-2">
        <button onClick={() => { if (undo.length) { setT(undo[0]); setUndo(undo.slice(1)); } }} disabled={!undo.length} className={`${btn} flex-1 bg-gray-100 disabled:opacity-40`}>元にもどす</button>
        <button onClick={() => copy(t, showNotification)} disabled={!t} className={`${btn} flex-1 bg-green-500 text-white disabled:opacity-40`}>コピー</button>
      </div>
    </div>
  );
};

// ---------- 色 ----------
const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (r, g, b) => "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const rgb2hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]; };
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
export const ColorTool = ({ showNotification }) => {
  const [hex, setHex] = useState("#22c55e");
  const rgb = hex2rgb(hex) || [0, 0, 0];
  const hsl = rgb2hsl(rgb);
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return ((x + 0.05) / (y + 0.05)); };
  const shades = [-40, -25, -12, 0, 12, 25, 40].map((d) => rgb2hex(...rgb.map((c) => (d < 0 ? c * (1 + d / 100) : c + (255 - c) * (d / 100)))));
  const rows = [["HEX", hex.toUpperCase()], ["RGB", `rgb(${rgb.join(", ")})`], ["HSL", `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`]];
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} space-y-3`}>
        <div className="flex gap-3 items-center"><input type="color" value={hex2rgb(hex) ? hex : "#000000"} onChange={(e) => setHex(e.target.value)} className="w-16 h-16 rounded-xl border bg-transparent p-0" /><input value={hex} onChange={(e) => setHex(e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value)} className={`${inp} font-mono text-lg`} maxLength={7} /></div>
        <div className="flex rounded-xl overflow-hidden h-10">{shades.map((c) => <button key={c} onClick={() => setHex(c)} className="flex-1" style={{ background: c }} aria-label={c} />)}</div>
      </div>
      <div className="bg-white border rounded-2xl divide-y">{rows.map(([l, v]) => <button key={l} onClick={() => copy(v, showNotification)} className="w-full flex justify-between px-4 py-3 text-sm"><span className="text-gray-400 font-bold">{l}</span><span className="font-mono font-bold">{v}</span></button>)}</div>
      <div className={`${card} grid grid-cols-2 gap-2`}>
        {[["#ffffff", "白文字"], ["#000000", "黒文字"]].map(([c, l]) => { const r = cr(rgb, hex2rgb(c)); return <div key={c} className="rounded-xl p-3 text-center" style={{ background: hex, color: c }}><div className="font-black">{l}</div><div className="text-[11px] opacity-90">コントラスト {r.toFixed(1)}:1 {r >= 4.5 ? "◎読みやすい" : r >= 3 ? "△大きい文字なら" : "×読みにくい"}</div></div>; })}
      </div>
    </div>
  );
};

// ---------- 水分記録 ----------
export const Water = () => {
  const [log, save] = useList("toolbox.water", {});
  const [goal, setGoal] = useState(() => store.get("toolbox.waterGoal", 2000));
  const today = ymd(new Date());
  const total = log[today] || 0;
  const add = (n) => save({ ...log, [today]: Math.max(0, total + n) });
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  const pct = Math.min(100, Math.round((total / goal) * 100));
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} text-center`}>
        <div className="relative w-36 h-36 mx-auto">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90"><circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" /><circle cx="18" cy="18" r="15.9" fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct} 100`} /></svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><div className="text-2xl font-black">{total}<span className="text-xs">ml</span></div><div className="text-[10px] text-gray-400">目標 {goal}ml（{pct}%）</div></div>
        </div>
        <div className="flex gap-2 mt-4">{[150, 200, 350, 500].map((n) => <button key={n} onClick={() => add(n)} className="flex-1 py-2.5 rounded-xl bg-sky-50 text-sky-600 text-xs font-bold">+{n}</button>)}</div>
        <button onClick={() => add(-200)} className="mt-2 text-[11px] text-gray-400">−200ml 取り消す</button>
      </div>
      <div className={`${card}`}>
        <div className="flex items-end justify-between h-24 gap-1.5">{days.map((d) => { const v = log[ymd(d)] || 0; return <div key={ymd(d)} className="flex-1 flex flex-col items-center gap-1"><div className="w-full flex-1 flex items-end"><div className={`w-full rounded-t ${v >= goal ? "bg-sky-400" : "bg-sky-200"}`} style={{ height: `${Math.min(100, (v / goal) * 100)}%` }} /></div><span className="text-[10px] text-gray-400">{WD[d.getDay()]}</span></div>; })}</div>
        <div className="flex items-center gap-2 mt-3 text-xs"><span className="flex-1 font-bold text-gray-500">1日の目標</span><select value={goal} onChange={(e) => { setGoal(Number(e.target.value)); store.set("toolbox.waterGoal", Number(e.target.value)); }} className="bg-gray-100 rounded-lg px-2 py-1.5 font-bold outline-none">{[1000, 1500, 2000, 2500, 3000].map((g) => <option key={g} value={g}>{g}ml</option>)}</select></div>
      </div>
    </div>
  );
};

// ---------- 体重記録 ----------
export const Weight = () => {
  const [rows, save] = useList("toolbox.weight", []);
  const [v, setV] = useState("");
  const add = () => { const n = parseFloat(v); if (!(n > 0 && n < 400)) return; const day = ymd(new Date()); save([...rows.filter((r) => r.d !== day), { d: day, w: n }].sort((a, b) => a.d.localeCompare(b.d))); setV(""); };
  const last = rows.slice(-30);
  const ws = last.map((r) => r.w);
  const mn = Math.min(...ws) - 0.5, mx = Math.max(...ws) + 0.5;
  const pts = last.map((r, i) => [last.length === 1 ? 150 : (i / (last.length - 1)) * 300, 70 - ((r.w - mn) / (mx - mn || 1)) * 60]);
  const diff = rows.length > 1 ? rows[rows.length - 1].w - rows[0].w : 0;
  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2"><input type="number" inputMode="decimal" step="0.1" value={v} onChange={(e) => setV(e.target.value)} placeholder="今日の体重（kg）" className={inp} /><button onClick={add} className="px-4 rounded-xl bg-green-500 text-white" aria-label="記録"><Plus className="w-5 h-5" /></button></div>
      {rows.length > 0 && (
        <div className={card}>
          <div className="flex justify-between text-xs mb-2"><span className="font-black text-lg">{rows[rows.length - 1].w}kg</span><span className={`font-bold ${diff > 0 ? "text-red-500" : "text-green-600"}`}>{rows.length > 1 ? `最初から ${diff > 0 ? "+" : ""}${diff.toFixed(1)}kg` : ""}</span></div>
          <svg viewBox="0 0 300 80" className="w-full h-24"><polyline fill="none" stroke="#22c55e" strokeWidth="2" points={pts.map((p) => p.join(",")).join(" ")} />{pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#22c55e" />)}</svg>
          <div className="flex justify-between text-[10px] text-gray-400"><span>{last[0].d.slice(5)}</span><span>{last[last.length - 1].d.slice(5)}</span></div>
        </div>
      )}
      <div className="bg-white border rounded-2xl divide-y">{[...rows].reverse().slice(0, 14).map((r) => <div key={r.d} className="flex items-center px-4 py-2.5 text-sm"><span className="flex-1 text-gray-500">{r.d}</span><span className="font-black mr-3">{r.w}kg</span><button onClick={() => save(rows.filter((x) => x.d !== r.d))} aria-label="削除" className="text-gray-300"><Trash2 className="w-4 h-4" /></button></div>)}{rows.length === 0 && <div className="text-center text-xs text-gray-400 py-6">まだ記録がありません</div>}</div>
    </div>
  );
};

// ---------- メトロノーム ----------
export const Metronome = () => {
  const [bpm, setBpm] = useState(100);
  const [beats, setBeats] = useState(4);
  const [on, setOn] = useState(false);
  const [beat, setBeat] = useState(-1);
  const taps = useRef([]);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const st = useRef({ ctx: null, next: 0, i: 0, timer: null });
  useEffect(() => {
    if (!on) return undefined;
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = new C();
    ctx.resume?.();
    const s = st.current;
    s.ctx = ctx; s.i = 0; s.next = ctx.currentTime + 0.05;
    const tick = () => {
      while (s.next < ctx.currentTime + 0.12) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        const accent = s.i % beats === 0;
        o.frequency.value = accent ? 1500 : 1000;
        g.gain.setValueAtTime(0.0001, s.next);
        g.gain.exponentialRampToValueAtTime(accent ? 0.6 : 0.35, s.next + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, s.next + 0.06);
        o.connect(g); g.connect(ctx.destination);
        o.start(s.next); o.stop(s.next + 0.08);
        const idx = s.i % beats, when = (s.next - ctx.currentTime) * 1000;
        setTimeout(() => setBeat(idx), Math.max(0, when));
        s.next += 60 / bpmRef.current; s.i++;
      }
    };
    tick();
    s.timer = setInterval(tick, 25);
    return () => { clearInterval(s.timer); try { ctx.close(); } catch { /* 無視 */ } setBeat(-1); };
  }, [on, beats]);
  const tap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now];
    if (taps.current.length >= 2) { const a = taps.current; setBpm(Math.max(40, Math.min(220, Math.round(60000 / ((a[a.length - 1] - a[0]) / (a.length - 1)))))); }
  };
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} text-center`}>
        <div className="text-6xl font-black tabular-nums">{bpm}</div><div className="text-xs text-gray-400 -mt-1">BPM</div>
        <div className="flex justify-center gap-2 my-4">{Array.from({ length: beats }, (_, i) => <span key={i} className={`w-5 h-5 rounded-full transition-colors ${beat === i ? (i === 0 ? "bg-red-500" : "bg-green-500") : "bg-gray-200"}`} />)}</div>
        <input type="range" min={40} max={220} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="w-full accent-green-500" />
        <div className="flex gap-2 mt-3">
          <button onClick={() => setOn(!on)} className={`${btn} flex-1 text-white flex items-center justify-center gap-1.5 ${on ? "bg-red-500" : "bg-green-500"}`}>{on ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}{on ? "停止" : "スタート"}</button>
          <button onClick={tap} className={`${btn} px-6 bg-gray-100`}>タップ</button>
        </div>
        <div className="flex items-center gap-3 mt-3 text-sm"><span className="flex-1 font-bold text-left">拍子</span>{[2, 3, 4, 5, 6, 7].map((b) => <button key={b} onClick={() => setBeats(b)} className={`w-8 h-8 rounded-full text-xs font-bold ${beats === b ? "bg-green-500 text-white" : "bg-gray-100"}`}>{b}</button>)}</div>
      </div>
      <p className="text-[10px] text-gray-400">タップを数回くり返すと、テンポを測れます。</p>
    </div>
  );
};

// ---------- 環境音（ノイズ）＋スリープタイマー ----------
const makeNoise = (ctx, type) => {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === "white") d[i] = w * 0.5;
      else if (type === "pink") { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
      else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    // ループのつなぎ目をクロスフェード（loopEnd を f サンプル手前にして、先頭に末尾をまぜる）
    const f = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[len - f + i] * (1 - a); }
  }
  return buf;
};
const SOUNDS = [["white", "ホワイトノイズ"], ["pink", "ピンクノイズ（雨音ふう）"], ["brown", "ブラウンノイズ（ごうごう）"], ["wave", "波（ゆっくり）"]];
export const Ambient = () => {
  const [kind, setKind] = useState("pink");
  const [on, setOn] = useState(false);
  const [vol, setVol] = useState(0.5);
  const [sleep, setSleep] = useState(0);
  const [left, setLeft] = useState(0);
  const nodes = useRef({});
  useEffect(() => {
    if (!on) return undefined;
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = new C(); ctx.resume?.();
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, kind === "wave" ? "brown" : kind);
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = src.buffer.duration - 0.05;
    const g = ctx.createGain();
    let lfo = null, mod = null;
    if (kind === "wave") { // 音量をゆっくり揺らして波のように（基本 55% + 揺れ 45%）
      g.gain.value = vol * 0.55;
      mod = ctx.createGain(); mod.gain.value = vol * 0.45;
      lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
      lfo.connect(mod); mod.connect(g.gain); lfo.start();
    } else g.gain.value = vol;
    src.connect(g); g.connect(ctx.destination); src.start();
    nodes.current = { ctx, g, mod };
    return () => { try { src.stop(); lfo?.stop(); ctx.close(); } catch { /* 無視 */ } };
  }, [on, kind]);
  useEffect(() => {
    const { g, mod } = nodes.current;
    if (!g) return;
    if (kind === "wave") { g.gain.value = vol * 0.55; if (mod) mod.gain.value = vol * 0.45; } else g.gain.value = vol;
  }, [vol, kind, on]);
  useEffect(() => {
    if (!on || !sleep) { setLeft(0); return undefined; }
    const end = Date.now() + sleep * 60000;
    const id = setInterval(() => {
      const r = end - Date.now();
      setLeft(Math.max(0, r));
      const g = nodes.current.g;
      if (r < 15000 && g && kind !== "wave") g.gain.value = Math.max(0, vol * (r / 15000)); // 最後の15秒でフェードアウト
      if (r <= 0) setOn(false);
    }, 500);
    return () => clearInterval(id);
  }, [on, sleep, vol, kind]);
  return (
    <div className="p-4 space-y-3">
      <div className="bg-white border rounded-2xl divide-y">{SOUNDS.map(([k, l]) => <button key={k} onClick={() => setKind(k)} className="w-full flex items-center gap-3 px-4 py-3 text-left"><span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${kind === k ? "bg-green-500 border-green-500" : "border-gray-300"}`}>{kind === k && <Check className="w-3 h-3 text-white" />}</span><span className="text-sm font-bold">{l}</span></button>)}</div>
      <div className={`${card} space-y-3`}>
        <div className="flex items-center gap-3"><span className="text-xs font-bold text-gray-500 w-10">音量</span><input type="range" min={0.05} max={1} step={0.05} value={vol} onChange={(e) => setVol(Number(e.target.value))} className="flex-1 accent-green-500" /></div>
        <div className="flex items-center gap-2"><span className="text-xs font-bold text-gray-500 w-10">タイマー</span>{[[0, "なし"], [15, "15分"], [30, "30分"], [60, "60分"]].map(([m, l]) => <button key={m} onClick={() => setSleep(m)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${sleep === m ? "bg-green-500 text-white" : "bg-gray-100"}`}>{l}</button>)}</div>
        <button onClick={() => setOn(!on)} className={`${btn} w-full text-white flex items-center justify-center gap-1.5 ${on ? "bg-red-500" : "bg-green-500"}`}>{on ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}{on ? `停止${left ? `（あと${Math.ceil(left / 60000)}分）` : ""}` : "再生"}</button>
      </div>
      <p className="text-[10px] text-gray-400">眠る前や作業中の集中用に。タイマーを使うと、時間になると自動でフェードアウトして止まります。画面を閉じると止まります。</p>
    </div>
  );
};

// ---------- 画像リサイズ ----------
export const ImageResize = () => {
  const [file, setFile] = useState(null);
  const [bmp, setBmp] = useState(null);
  const [maxSide, setMaxSide] = useState(1080);
  const [q, setQ] = useState(0.8);
  const [fmt, setFmt] = useState("image/jpeg");
  const [out, setOut] = useState(null);
  const [err, setErr] = useState("");
  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setErr(""); setOut(null);
    try { const b = await createImageBitmap(f); setFile(f); setBmp(b); } catch { setErr("この画像は読み込めませんでした"); }
  };
  useEffect(() => {
    if (!bmp) return undefined;
    let dead = false;
    const sc = maxSide ? Math.min(1, maxSide / Math.max(bmp.width, bmp.height)) : 1;
    const w = Math.max(1, Math.round(bmp.width * sc)), h = Math.max(1, Math.round(bmp.height * sc));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const g = cv.getContext("2d");
    if (fmt === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); }
    g.drawImage(bmp, 0, 0, w, h);
    cv.toBlob((b) => { if (!dead && b) setOut({ blob: b, w, h, url: URL.createObjectURL(b) }); }, fmt, q);
    return () => { dead = true; };
  }, [bmp, maxSide, q, fmt]);
  useEffect(() => () => { if (out?.url) URL.revokeObjectURL(out.url); }, [out]);
  const ext = fmt === "image/png" ? "png" : fmt === "image/webp" ? "webp" : "jpg";
  return (
    <div className="p-4 space-y-3">
      <label className={`${btn} block text-center bg-green-500 text-white cursor-pointer`}>画像を選ぶ<input type="file" accept="image/*" className="hidden" onChange={pick} /></label>
      {err && <div className="text-xs text-red-500">{err}</div>}
      {bmp && (
        <>
          <div className={`${card} space-y-3`}>
            <div className="flex flex-wrap gap-2">{[[320, "320"], [640, "640"], [1080, "1080"], [1600, "1600"], [0, "元のまま"]].map(([v, l]) => <button key={v} onClick={() => setMaxSide(v)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${maxSide === v ? "bg-green-500 text-white" : "bg-gray-100"}`}>{l}</button>)}</div>
            <div className="flex gap-2">{[["image/jpeg", "JPEG"], ["image/webp", "WebP"], ["image/png", "PNG"]].map(([v, l]) => <button key={v} onClick={() => setFmt(v)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${fmt === v ? "bg-green-500 text-white" : "bg-gray-100"}`}>{l}</button>)}</div>
            {fmt !== "image/png" && <div><div className="flex justify-between text-xs font-bold text-gray-500"><span>画質</span><span>{Math.round(q * 100)}%</span></div><input type="range" min={0.3} max={1} step={0.05} value={q} onChange={(e) => setQ(Number(e.target.value))} className="w-full accent-green-500" /></div>}
          </div>
          {out && (
            <div className={`${card} text-center space-y-2`}>
              <img src={out.url} alt="" className="max-h-56 mx-auto rounded-lg border" />
              <div className="text-xs text-gray-500">{bmp.width}×{bmp.height}（{kb(file.size)}） → <b className="text-green-600">{out.w}×{out.h}（{kb(out.blob.size)}）</b></div>
              <button onClick={() => dl(out.blob, `${file.name.replace(/\.[^.]+$/, "")}_resized.${ext}`)} className={`${btn} w-full bg-green-500 text-white flex items-center justify-center gap-1.5`}><Download className="w-4 h-4" />保存する</button>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-gray-400">画像はこの端末の中だけで処理され、アップロードされません。写真を小さくして送りたいときに便利です。</p>
    </div>
  );
};

// ---------- 音声メモ（録音） ----------
export const Recorder = () => {
  const [recs, setRecs] = useState([]);
  const [rec, setRec] = useState(false);
  const [sec, setSec] = useState(0);
  const [err, setErr] = useState("");
  const mr = useRef(null);
  useEffect(() => { if (!rec) return undefined; const id = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(id); }, [rec]);
  useEffect(() => () => { try { mr.current?.stream?.getTracks().forEach((t) => t.stop()); } catch { /* 無視 */ } }, []);
  const start = async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); const b = new Blob(chunks, { type: r.mimeType || "audio/webm" }); setRecs((x) => [{ id: Date.now(), url: URL.createObjectURL(b), blob: b, at: new Date(), sec: 0 }, ...x]); };
      r.start(); mr.current = r; setSec(0); setRec(true);
    } catch (e) { setErr("マイクを使えませんでした。ブラウザのマイク許可を確認してください"); }
  };
  const stop = () => { try { mr.current?.stop(); } catch { /* 無視 */ } setRec(false); };
  const ext = (b) => (b.type.includes("mp4") ? "m4a" : b.type.includes("ogg") ? "ogg" : "webm");
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} text-center`}>
        <div className="text-4xl font-black tabular-nums my-2">{String(Math.floor(sec / 60)).padStart(2, "0")}:{String(sec % 60).padStart(2, "0")}</div>
        <button onClick={rec ? stop : start} className={`${btn} w-full text-white flex items-center justify-center gap-1.5 ${rec ? "bg-red-500 animate-pulse" : "bg-green-500"}`}>{rec ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}{rec ? "録音を止める" : "録音スタート"}</button>
        {err && <div className="text-xs text-red-500 mt-2">{err}</div>}
      </div>
      {recs.map((r) => (
        <div key={r.id} className={`${card} space-y-2`}>
          <div className="flex items-center text-xs text-gray-500"><span className="flex-1 font-bold">{r.at.toLocaleTimeString("ja-JP")} の録音（{kb(r.blob.size)}）</span><button onClick={() => dl(r.blob, `memo_${ymd(r.at)}_${r.at.getHours()}${String(r.at.getMinutes()).padStart(2, "0")}.${ext(r.blob)}`)} aria-label="保存" className="text-green-600 mr-3"><Download className="w-4 h-4" /></button><button onClick={() => { URL.revokeObjectURL(r.url); setRecs(recs.filter((x) => x.id !== r.id)); }} aria-label="削除" className="text-gray-300"><Trash2 className="w-4 h-4" /></button></div>
          <audio src={r.url} controls className="w-full h-9" />
        </div>
      ))}
      <p className="text-[10px] text-gray-400">録音はこのページを閉じると消えます。残したいものは「保存」を押してください。</p>
    </div>
  );
};

// ---------- お絵描き ----------
export const Draw = () => {
  const cv = useRef(null);
  const [color, setColor] = useState("#111827");
  const [size, setSize] = useState(4);
  const [eraser, setEraser] = useState(false);
  const hist = useRef([]);
  const drawing = useRef(false);
  const last = useRef(null);
  useEffect(() => { const c = cv.current; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); hist.current = [g.getImageData(0, 0, c.width, c.height)]; }, []);
  const pos = (e) => { const r = cv.current.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * cv.current.width, ((e.clientY - r.top) / r.height) * cv.current.height]; };
  const down = (e) => { e.preventDefault(); cv.current.setPointerCapture?.(e.pointerId); drawing.current = true; last.current = pos(e); move(e); };
  const move = (e) => {
    if (!drawing.current) return;
    const g = cv.current.getContext("2d"); const p = pos(e);
    g.strokeStyle = eraser ? "#ffffff" : color; g.lineWidth = eraser ? size * 3 : size; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(last.current[0], last.current[1]); g.lineTo(p[0] + 0.01, p[1]); g.stroke(); last.current = p;
  };
  const up = () => { if (!drawing.current) return; drawing.current = false; const c = cv.current; hist.current = [...hist.current, c.getContext("2d").getImageData(0, 0, c.width, c.height)].slice(-20); };
  const undo = () => { if (hist.current.length < 2) return; hist.current = hist.current.slice(0, -1); cv.current.getContext("2d").putImageData(hist.current[hist.current.length - 1], 0, 0); };
  const clear = () => { const c = cv.current; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); hist.current = [...hist.current, g.getImageData(0, 0, c.width, c.height)].slice(-20); };
  return (
    <div className="p-4 space-y-3">
      <canvas ref={cv} width={720} height={900} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} className="w-full bg-white border rounded-2xl shadow-sm" style={{ touchAction: "none", aspectRatio: "720/900", maxHeight: "60vh" }} />
      <div className={`${card} space-y-3`}>
        <div className="flex items-center gap-2 flex-wrap">
          {["#111827", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"].map((c) => <button key={c} onClick={() => { setColor(c); setEraser(false); }} aria-label={c} className={`w-8 h-8 rounded-full border-2 ${color === c && !eraser ? "border-gray-800" : "border-transparent"}`} style={{ background: c }} />)}
          <button onClick={() => setEraser(!eraser)} className={`px-3 h-8 rounded-full text-xs font-bold ${eraser ? "bg-gray-800 text-white" : "bg-gray-100"}`}>消しゴム</button>
        </div>
        <div className="flex items-center gap-3"><span className="text-xs font-bold text-gray-500">太さ</span><input type="range" min={1} max={30} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1 accent-green-500" /></div>
        <div className="flex gap-2">
          <button onClick={undo} className={`${btn} flex-1 bg-gray-100 flex items-center justify-center gap-1`}><RotateCcw className="w-4 h-4" />1つ戻す</button>
          <button onClick={clear} className={`${btn} flex-1 bg-gray-100`}>全部消す</button>
          <button onClick={() => cv.current.toBlob((b) => b && dl(b, `drawing_${Date.now()}.png`))} className={`${btn} flex-1 bg-green-500 text-white flex items-center justify-center gap-1`}><Download className="w-4 h-4" />保存</button>
        </div>
      </div>
    </div>
  );
};

// ---------- あみだくじ ----------
export const Amida = () => {
  const [names, setNames] = useState(store.get("toolbox.amida", "Aさん\nBさん\nCさん\nDさん"));
  const [goals, setGoals] = useState("当たり\nハズレ\nハズレ\nハズレ");
  const [game, setGame] = useState(null);
  const ns = names.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8);
  const gs = goals.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8);
  const n = ns.length;
  const ok = n >= 2 && gs.length === n;
  const build = () => {
    const ROWS = 12; const rungs = [];
    for (let r = 0; r < ROWS; r++) { let prev = false; for (let c = 0; c < n - 1; c++) { const has = !prev && rnd(100) < 45; if (has) rungs.push([r, c]); prev = has; } }
    const set = new Set(rungs.map(([r, c]) => `${r}:${c}`));
    const path = (s) => { let c = s; const pts = [[c, -1]]; for (let r = 0; r < ROWS; r++) { pts.push([c, r]); if (set.has(`${r}:${c}`)) { c++; pts.push([c, r]); } else if (c > 0 && set.has(`${r}:${c - 1}`)) { c--; pts.push([c, r]); } } pts.push([c, ROWS]); return { pts, end: c }; };
    setGame({ ROWS, rungs, paths: Array.from({ length: n }, (_, i) => path(i)), shown: new Set(), order: shuffle(gs) });
  };
  const COL = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];
  const W = 320, H = 260, X = (c) => (n === 1 ? W / 2 : 20 + (c * (W - 40)) / (n - 1)), Y = (r) => 30 + (r + 1) * ((H - 60) / ((game?.ROWS || 12) + 1));
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} grid grid-cols-2 gap-2`}>
        <label className="text-xs font-bold text-gray-500">参加者（{n}人）<textarea value={names} onChange={(e) => { setNames(e.target.value); store.set("toolbox.amida", e.target.value); setGame(null); }} rows={5} className={`${inp} mt-1 resize-none`} /></label>
        <label className="text-xs font-bold text-gray-500">ゴール（{gs.length}個）<textarea value={goals} onChange={(e) => { setGoals(e.target.value); setGame(null); }} rows={5} className={`${inp} mt-1 resize-none`} /></label>
        <button onClick={build} disabled={!ok} className={`${btn} col-span-2 bg-green-500 text-white disabled:opacity-50`}>{ok ? "あみだくじを作る" : "参加者とゴールを同じ数にしてください"}</button>
      </div>
      {game && (
        <div className={card}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {ns.map((_, c) => <line key={c} x1={X(c)} y1={30} x2={X(c)} y2={H - 30} stroke="#9ca3af" strokeWidth="2" />)}
            {game.rungs.map(([r, c], i) => <line key={i} x1={X(c)} y1={Y(r)} x2={X(c + 1)} y2={Y(r)} stroke="#9ca3af" strokeWidth="2" />)}
            {ns.map((nm, c) => <text key={c} x={X(c)} y={18} textAnchor="middle" fontSize="10" fontWeight="bold" fill={game.shown.has(c) ? COL[c] : "#374151"} onClick={() => { const s = new Set(game.shown); s.add(c); setGame({ ...game, shown: s }); }} style={{ cursor: "pointer" }}>{nm.slice(0, 5)}</text>)}
            {game.order.map((g, c) => <text key={c} x={X(c)} y={H - 12} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#374151">{g.slice(0, 5)}</text>)}
            {[...game.shown].map((c) => <polyline key={c} fill="none" stroke={COL[c]} strokeWidth="3.5" strokeLinejoin="round" points={game.paths[c].pts.map(([cc, rr]) => `${X(cc)},${rr < 0 ? 30 : rr >= game.ROWS ? H - 30 : Y(rr)}`).join(" ")} />)}
          </svg>
          <div className="text-[11px] text-gray-400 text-center mb-2">名前をタップすると、その人の道すじとゴールが出ます</div>
          <div className="space-y-1">{[...game.shown].map((c) => <div key={c} className="flex justify-between text-sm font-bold"><span style={{ color: COL[c] }}>{ns[c]}</span><span>→ {game.order[game.paths[c].end]}</span></div>)}</div>
          <button onClick={() => setGame({ ...game, shown: new Set(ns.map((_, i) => i)) })} className="mt-2 text-xs font-bold text-green-600">全員の結果を見る</button>
        </div>
      )}
    </div>
  );
};

// ---------- 暗記カード ----------
export const Flash = () => {
  const [cards, save] = useList("toolbox.flash", []);
  const [q, setQ] = useState(""); const [a, setA] = useState("");
  const [run, setRun] = useState(null); // {deck, i, flip, ok, ng}
  const add = () => { if (!q.trim() || !a.trim()) return; save([{ id: Date.now(), q: q.trim(), a: a.trim() }, ...cards]); setQ(""); setA(""); };
  const start = (list) => setRun({ deck: shuffle(list), i: 0, flip: false, ok: 0, ng: [] });
  if (run) {
    const done = run.i >= run.deck.length;
    const c = run.deck[run.i];
    const next = (good) => setRun({ ...run, i: run.i + 1, flip: false, ok: run.ok + (good ? 1 : 0), ng: good ? run.ng : [...run.ng, c] });
    return (
      <div className="p-4 space-y-3">
        {done ? (
          <div className={`${card} text-center space-y-3`}><div className="text-xs text-gray-400">けっか</div><div className="text-4xl font-black text-green-600">{run.ok} / {run.deck.length}</div>
            {run.ng.length > 0 && <button onClick={() => start(run.ng)} className={`${btn} w-full bg-amber-100 text-amber-700`}>まちがえた {run.ng.length} 枚をもう一度</button>}
            <button onClick={() => setRun(null)} className={`${btn} w-full bg-gray-100`}>おわる</button></div>
        ) : (
          <>
            <div className="text-xs text-gray-400 text-center">{run.i + 1} / {run.deck.length}</div>
            <button onClick={() => setRun({ ...run, flip: !run.flip })} className={`${card} w-full min-h-[200px] flex items-center justify-center text-xl font-black text-center break-words ${run.flip ? "bg-green-50 text-green-700" : ""}`}>{run.flip ? c.a : c.q}</button>
            <div className="text-[11px] text-gray-400 text-center">タップで{run.flip ? "もんだい" : "こたえ"}を見る</div>
            {run.flip && <div className="flex gap-2"><button onClick={() => next(false)} className={`${btn} flex-1 bg-red-50 text-red-500`}>× まだ</button><button onClick={() => next(true)} className={`${btn} flex-1 bg-green-500 text-white`}>○ わかった</button></div>}
            <button onClick={() => setRun(null)} className="w-full text-xs text-gray-400">やめる</button>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} space-y-2`}>
        <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 100))} placeholder="もんだい（表）" className={inp} />
        <input value={a} onChange={(e) => setA(e.target.value.slice(0, 100))} placeholder="こたえ（裏）" className={inp} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()} />
        <button onClick={add} className={`${btn} w-full bg-green-500 text-white`}>カードを追加</button>
      </div>
      <button onClick={() => start(cards)} disabled={cards.length < 1} className={`${btn} w-full bg-indigo-500 text-white disabled:opacity-40`}>テスト開始（{cards.length}枚）</button>
      <div className="bg-white border rounded-2xl divide-y">{cards.length === 0 && <div className="text-center text-xs text-gray-400 py-6">英単語・用語・資格の勉強などに使えます</div>}
        {cards.map((c) => <div key={c.id} className="flex items-center px-4 py-2.5 gap-3"><div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{c.q}</div><div className="text-xs text-gray-400 truncate">{c.a}</div></div><button onClick={() => save(cards.filter((x) => x.id !== c.id))} aria-label="削除" className="text-gray-300"><Trash2 className="w-4 h-4" /></button></div>)}</div>
    </div>
  );
};

// ---------- チェックリスト（買い物・持ち物） ----------
const TEMPLATES = { 旅行の持ち物: ["財布", "スマホ・充電器", "身分証", "着替え", "洗面用具", "常備薬", "傘"], 買い物: ["牛乳", "卵", "パン", "野菜", "洗剤"], 引っ越し: ["住所変更（役所）", "電気・ガス・水道", "ネット回線", "郵便の転送", "免許証の住所変更"] };
export const Checklist = () => {
  const [lists, save] = useList("toolbox.lists", [{ id: 1, name: "買い物", items: TEMPLATES["買い物"].map((t, i) => ({ id: i, t, done: false })) }]);
  const [cur, setCur] = useState(lists[0]?.id ?? null);
  const [text, setText] = useState("");
  const [newName, setNewName] = useState("");
  const list = lists.find((l) => l.id === cur) || lists[0];
  const upd = (fn) => save(lists.map((l) => (l.id === list.id ? fn(l) : l)));
  const addList = (name, items = []) => { const id = Date.now(); save([...lists, { id, name, items: items.map((t, i) => ({ id: i, t, done: false })) }]); setCur(id); setNewName(""); };
  const done = list?.items.filter((i) => i.done).length || 0;
  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">{lists.map((l) => <button key={l.id} onClick={() => setCur(l.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${list?.id === l.id ? "bg-green-500 text-white" : "bg-white border text-gray-500"}`}>{l.name}</button>)}</div>
      <div className="flex gap-2"><input value={newName} onChange={(e) => setNewName(e.target.value.slice(0, 20))} placeholder="新しいリスト名" className={inp} /><button onClick={() => newName.trim() && addList(newName.trim())} className="px-4 rounded-xl bg-gray-800 text-white" aria-label="リスト追加"><Plus className="w-5 h-5" /></button></div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">{Object.entries(TEMPLATES).map(([n, it]) => <button key={n} onClick={() => addList(n, it)} className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 whitespace-nowrap">＋ {n}</button>)}</div>
      {list && (
        <>
          <div className="flex gap-2"><input value={text} onChange={(e) => setText(e.target.value.slice(0, 60))} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && text.trim()) { upd((l) => ({ ...l, items: [...l.items, { id: Date.now(), t: text.trim(), done: false }] })); setText(""); } }} placeholder="項目を追加" className={inp} />
            <button onClick={() => { if (text.trim()) { upd((l) => ({ ...l, items: [...l.items, { id: Date.now(), t: text.trim(), done: false }] })); setText(""); } }} className="px-4 rounded-xl bg-green-500 text-white" aria-label="追加"><Plus className="w-5 h-5" /></button></div>
          <div className="flex items-center text-[11px] text-gray-400"><span className="flex-1">{done} / {list.items.length} 完了</span><button onClick={() => upd((l) => ({ ...l, items: l.items.map((i) => ({ ...i, done: false })) }))} className="font-bold text-gray-500 mr-3">チェックをはずす</button><button onClick={() => window.confirm(`「${list.name}」を削除しますか？`) && (save(lists.filter((l) => l.id !== list.id)), setCur(null))} className="font-bold text-red-500">リスト削除</button></div>
          <div className="h-1.5 bg-gray-200 rounded-full"><div className="h-1.5 bg-green-500 rounded-full transition-all" style={{ width: `${list.items.length ? (done / list.items.length) * 100 : 0}%` }} /></div>
          <div className="bg-white border rounded-2xl divide-y">{list.items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
              <button onClick={() => upd((l) => ({ ...l, items: l.items.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)) }))} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${i.done ? "bg-green-500 border-green-500" : "border-gray-300"}`}>{i.done && <Check className="w-3.5 h-3.5 text-white" />}</button>
              <span className={`flex-1 text-sm break-words min-w-0 ${i.done ? "line-through text-gray-400" : ""}`}>{i.t}</span>
              <button onClick={() => upd((l) => ({ ...l, items: l.items.filter((x) => x.id !== i.id) }))} aria-label="削除" className="text-gray-300"><Trash2 className="w-4 h-4" /></button>
            </div>))}{list.items.length === 0 && <div className="text-center text-xs text-gray-400 py-6">項目がありません</div>}</div>
        </>
      )}
    </div>
  );
};
