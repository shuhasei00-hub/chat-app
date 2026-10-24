// 便利ボックス: ToDo / タイマー・ストップウォッチ / 割り勘 / パスワード作成 / ルーレット
// （すべて端末内で完結。データは localStorage に保存します）
import React, { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Check, Copy, RefreshCw, Play, Pause, RotateCcw, BellOff } from "lucide-react";
import { CheckSquare, Timer as TimerIcon, Receipt, KeyRound, Target, Calculator, Ruler, CalendarDays, Hourglass, Globe, Flame, Wallet, Users, Dices, AlarmClock, MessageSquare, Type } from "lucide-react";
import { PageHeader } from "./common";
import { Calc, Units, DateCalc, Countdown, WorldClock, Habits, Ledger, Teams, Dice, Alarms, Pomodoro, Snippets, Counter } from "./ToolboxMore";
import { playPreview, stopPreview } from "./ring";
import { getRingSettings } from "./ringtones";

const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 無視 */ } },
};
const copy = (t, note) => navigator.clipboard?.writeText(t).then(() => note?.("コピーしました")).catch(() => {});
const card = "bg-white rounded-2xl border p-4";
const btn = "py-3 rounded-xl font-bold text-sm";

// ---------- ToDo ----------
const Todo = () => {
  const [items, setItems] = useState(() => store.get("toolbox.todo", []));
  const [text, setText] = useState("");
  const save = (n) => { setItems(n); store.set("toolbox.todo", n); };
  const add = () => { const t = text.trim(); if (!t) return; save([{ id: Date.now(), t, done: false }, ...items]); setText(""); };
  const left = items.filter((i) => !i.done).length;
  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 100))} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()} placeholder="やることを入力" className="flex-1 bg-white border rounded-xl px-4 py-3 text-sm outline-none" />
        <button onClick={add} aria-label="追加" className="w-12 rounded-xl bg-green-500 text-white flex items-center justify-center"><Plus className="w-5 h-5" /></button>
      </div>
      <div className="text-[11px] text-gray-400 flex justify-between"><span>残り {left} 件</span>
        {items.some((i) => i.done) && <button onClick={() => save(items.filter((i) => !i.done))} className="text-red-500 font-bold">完了を削除</button>}
      </div>
      {items.length === 0 && <div className="text-center text-xs text-gray-400 py-10">ToDoはありません</div>}
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.id} className="bg-white border rounded-xl flex items-center gap-3 px-3 py-2.5">
            <button onClick={() => save(items.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)))} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${i.done ? "bg-green-500 border-green-500" : "border-gray-300"}`}>{i.done && <Check className="w-3.5 h-3.5 text-white" />}</button>
            <span className={`flex-1 text-sm break-words min-w-0 ${i.done ? "line-through text-gray-400" : ""}`}>{i.t}</span>
            <button onClick={() => save(items.filter((x) => x.id !== i.id))} aria-label="削除" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- タイマー / ストップウォッチ ----------
const mmss = (ms, tenth) => {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000), s = Math.floor((t % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${tenth ? "." + Math.floor((t % 1000) / 100) : ""}`;
};
const Timer = ({ showNotification }) => {
  const [mode, setMode] = useState("timer");
  const [min, setMin] = useState(3);
  const [endAt, setEndAt] = useState(null);      // タイマー終了時刻
  const [remain, setRemain] = useState(null);    // 一時停止中の残り
  const [swStart, setSwStart] = useState(null);  // ストップウォッチ開始時刻
  const [swBase, setSwBase] = useState(0);
  const [laps, setLaps] = useState([]);
  const [, tick] = useState(0);
  const [ringing, setRinging] = useState(false);
  const fired = useRef(false);

  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 100); return () => { clearInterval(id); stopPreview(); }; }, []);
  const left = endAt ? endAt - Date.now() : remain ?? min * 60000;
  useEffect(() => {
    if (endAt && left <= 0 && !fired.current) {
      fired.current = true;
      setEndAt(null); setRemain(null); setRinging(true);
      showNotification?.("タイマーが終わりました");
      try { navigator.vibrate?.([400, 200, 400, 200, 400]); } catch { /* 無視 */ }
      playPreview(getRingSettings().incoming, { onEnd: () => setRinging(false) });
    }
  });
  const startT = () => { fired.current = false; setEndAt(Date.now() + (remain ?? min * 60000)); setRemain(null); };
  const pauseT = () => { setRemain(Math.max(0, endAt - Date.now())); setEndAt(null); };
  const resetT = () => { setEndAt(null); setRemain(null); fired.current = false; stopPreview(); setRinging(false); };
  const swElapsed = swBase + (swStart ? Date.now() - swStart : 0);

  return (
    <div className="p-4 space-y-4">
      <div className="flex bg-gray-200 rounded-xl p-1">
        {[["timer", "タイマー"], ["sw", "ストップウォッチ"]].map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={`flex-1 py-2 rounded-lg text-xs font-bold ${mode === k ? "bg-white shadow-sm" : "text-gray-500"}`}>{l}</button>)}
      </div>
      {mode === "timer" ? (
        <div className={`${card} text-center`}>
          <div className="text-5xl font-black tabular-nums my-4">{mmss(left)}</div>
          {!endAt && remain === null && (
            <div className="flex flex-wrap justify-center gap-2 mb-4">
              {[1, 3, 5, 10, 15, 30].map((m) => <button key={m} onClick={() => setMin(m)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${min === m ? "bg-green-500 text-white" : "bg-gray-100"}`}>{m}分</button>)}
              <input type="number" min={1} max={180} value={min} onChange={(e) => setMin(Math.max(1, Math.min(180, Number(e.target.value) || 1)))} className="w-16 bg-gray-100 rounded-full px-3 py-1.5 text-xs font-bold text-center outline-none" />
            </div>
          )}
          <div className="flex gap-2">
            {endAt ? <button onClick={pauseT} className={`${btn} flex-1 bg-amber-100 text-amber-700 flex items-center justify-center gap-1.5`}><Pause className="w-4 h-4" />一時停止</button>
              : <button onClick={startT} className={`${btn} flex-1 bg-green-500 text-white flex items-center justify-center gap-1.5`}><Play className="w-4 h-4" />{remain !== null ? "再開" : "スタート"}</button>}
            <button onClick={resetT} className={`${btn} px-5 bg-gray-100 flex items-center gap-1.5`}><RotateCcw className="w-4 h-4" />リセット</button>
          </div>
          {ringing && <button onClick={resetT} className={`${btn} w-full mt-3 bg-red-500 text-white flex items-center justify-center gap-1.5`}><BellOff className="w-4 h-4" />アラームを止める</button>}
          <p className="text-[10px] text-gray-400 mt-3">終了時は、設定した着信音で知らせます（アプリを開いたままにしてください）</p>
        </div>
      ) : (
        <div className={`${card} text-center`}>
          <div className="text-5xl font-black tabular-nums my-4">{mmss(swElapsed, true)}</div>
          <div className="flex gap-2">
            {swStart ? <button onClick={() => { setSwBase(swElapsed); setSwStart(null); }} className={`${btn} flex-1 bg-amber-100 text-amber-700`}>停止</button>
              : <button onClick={() => setSwStart(Date.now())} className={`${btn} flex-1 bg-green-500 text-white`}>スタート</button>}
            <button onClick={() => swStart && setLaps([swElapsed, ...laps])} disabled={!swStart} className={`${btn} px-5 bg-gray-100 disabled:opacity-40`}>ラップ</button>
            <button onClick={() => { setSwStart(null); setSwBase(0); setLaps([]); }} className={`${btn} px-5 bg-gray-100`}>リセット</button>
          </div>
          {laps.length > 0 && <div className="mt-3 text-left text-sm divide-y">{laps.map((l, i) => <div key={i} className="flex justify-between py-1.5 tabular-nums"><span className="text-gray-400">#{laps.length - i}</span><span className="font-bold">{mmss(l, true)}</span></div>)}</div>}
        </div>
      )}
    </div>
  );
};

// ---------- 割り勘 ----------
const Split = ({ showNotification }) => {
  const [total, setTotal] = useState("");
  const [people, setPeople] = useState(4);
  const [round, setRound] = useState(10);
  const [boss, setBoss] = useState("0"); // 幹事が多く払う額
  const t = Math.max(0, Number(total) || 0);
  const b = Math.max(0, Number(boss) || 0);
  const rest = Math.max(0, t - b);
  const each = Math.ceil(rest / Math.max(1, people) / round) * round; // みんなの負担（切り上げ）
  const bossPays = Math.max(0, t - each * (people - 1));            // 幹事は残り全部（端数・上乗せ分を含む）
  const yen = (n) => `¥${Math.round(n).toLocaleString()}`;
  const text = `合計 ${yen(t)} / ${people}人\n1人 ${yen(each)}${people > 1 && bossPays !== each ? `（幹事は ${yen(bossPays)}）` : ""}`;
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} space-y-3`}>
        <label className="block text-xs font-bold text-gray-500">合計金額（円）
          <input type="number" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="12000" className="mt-1 w-full bg-gray-50 border rounded-xl px-4 py-3 text-lg font-bold outline-none" />
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-500 flex-1">人数</span>
          <button onClick={() => setPeople(Math.max(1, people - 1))} className="w-9 h-9 rounded-full bg-gray-100 font-bold">−</button>
          <span className="w-8 text-center font-black text-lg">{people}</span>
          <button onClick={() => setPeople(Math.min(99, people + 1))} className="w-9 h-9 rounded-full bg-gray-100 font-bold">＋</button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-500 flex-1">切り上げ単位</span>
          <select value={round} onChange={(e) => setRound(Number(e.target.value))} className="bg-gray-100 rounded-lg px-2 py-1.5 text-sm font-bold outline-none">
            {[[1, "1円"], [10, "10円"], [100, "100円"], [500, "500円"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <label className="block text-xs font-bold text-gray-500">幹事が先に払う額（任意）
          <input type="number" inputMode="numeric" value={boss} onChange={(e) => setBoss(e.target.value)} className="mt-1 w-full bg-gray-50 border rounded-xl px-4 py-2.5 text-sm outline-none" />
        </label>
      </div>
      <div className={`${card} text-center`}>
        <div className="text-xs text-gray-400">1人あたり</div>
        <div className="text-4xl font-black text-green-600 my-1">{yen(each)}</div>
        {people > 1 && t > 0 && bossPays !== each && <div className="text-xs text-gray-500">幹事の負担 {yen(bossPays)}</div>}
        <button onClick={() => copy(text, showNotification)} disabled={!t} className="mt-3 text-xs font-bold text-green-600 flex items-center gap-1 mx-auto disabled:opacity-40"><Copy className="w-3 h-3" />結果をコピー（トークに貼り付け）</button>
      </div>
    </div>
  );
};

// ---------- パスワード作成 ----------
const CHARS = { lower: "abcdefghijkmnopqrstuvwxyz", upper: "ABCDEFGHJKLMNPQRSTUVWXYZ", num: "23456789", sym: "!@#$%^&*-_=+?" };
const rnd = (n) => { const a = new Uint32Array(1); const lim = Math.floor(0x100000000 / n) * n; do { crypto.getRandomValues(a); } while (a[0] >= lim); return a[0] % n; };
const Pass = ({ showNotification }) => {
  const [len, setLen] = useState(16);
  const [opt, setOpt] = useState({ lower: true, upper: true, num: true, sym: false });
  const [pw, setPw] = useState("");
  const gen = (l = len, o = opt) => {
    const sets = Object.keys(o).filter((k) => o[k]).map((k) => CHARS[k]);
    if (!sets.length) return setPw("");
    const all = sets.join("");
    const out = sets.map((s) => s[rnd(s.length)]); // 各種類を最低1文字
    while (out.length < l) out.push(all[rnd(all.length)]);
    for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    setPw(out.join("").slice(0, l));
  };
  useEffect(() => { gen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (k) => { const o = { ...opt, [k]: !opt[k] }; if (!Object.values(o).some(Boolean)) return; setOpt(o); gen(len, o); };
  const bits = Math.round(len * Math.log2(Object.keys(opt).filter((k) => opt[k]).map((k) => CHARS[k]).join("").length || 1));
  return (
    <div className="p-4 space-y-3">
      <div className={card}>
        <div className="font-mono text-lg break-all text-center py-3 select-all">{pw}</div>
        <div className="flex gap-2">
          <button onClick={() => copy(pw, showNotification)} className={`${btn} flex-1 bg-green-500 text-white flex items-center justify-center gap-1.5`}><Copy className="w-4 h-4" />コピー</button>
          <button onClick={() => gen()} className={`${btn} px-5 bg-gray-100 flex items-center gap-1.5`}><RefreshCw className="w-4 h-4" />再作成</button>
        </div>
        <div className="text-[11px] text-gray-400 text-center mt-2">強さの目安: {bits}bit {bits >= 80 ? "（強い）" : bits >= 60 ? "（まずまず）" : "（弱め）"}</div>
      </div>
      <div className={`${card} space-y-3`}>
        <div className="flex justify-between text-sm font-bold"><span>文字数</span><span>{len}</span></div>
        <input type="range" min={8} max={48} value={len} onChange={(e) => { const l = Number(e.target.value); setLen(l); gen(l); }} className="w-full accent-green-500" />
        <div className="flex flex-wrap gap-2">
          {[["lower", "小文字"], ["upper", "大文字"], ["num", "数字"], ["sym", "記号"]].map(([k, l]) => <button key={k} onClick={() => toggle(k)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${opt[k] ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500"}`}>{l}</button>)}
        </div>
        <p className="text-[10px] text-gray-400">紛らわしい文字（0/O, 1/l/I）は除いています。作成はこの端末内だけで行われ、送信されません。</p>
      </div>
    </div>
  );
};

// ---------- ルーレット ----------
const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444", "#64748b"];
const Roulette = () => {
  const [text, setText] = useState(store.get("toolbox.roulette", "ラーメン\nカレー\n寿司\n焼肉"));
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState("");
  const opts = text.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const n = opts.length;
  const spin = () => {
    if (spinning || n < 2) return;
    const pick = rnd(n);
    const seg = 360 / n;
    // ポインタは真上。pick 番目の区間の中心が真上に来る角度まで回す
    const target = 360 * 6 + (360 - (pick * seg + seg / 2));
    setResult(""); setSpinning(true);
    setAngle((a) => a - (a % 360) + target);
    setTimeout(() => { setSpinning(false); setResult(opts[pick]); }, 4200);
  };
  const R = 100;
  const pt = (deg) => [R + R * Math.sin((deg * Math.PI) / 180), R - R * Math.cos((deg * Math.PI) / 180)];
  return (
    <div className="p-4 space-y-3">
      <div className={`${card} flex flex-col items-center`}>
        <div className="relative w-64 h-64">
          <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-10 w-0 h-0 border-x-[10px] border-x-transparent border-t-[18px] border-t-gray-800" />
          <svg viewBox="0 0 200 200" className="w-full h-full" style={{ transform: `rotate(${angle}deg)`, transition: spinning ? "transform 4.2s cubic-bezier(.15,.6,.1,1)" : "none" }}>
            {n >= 2 ? opts.map((o, i) => {
              const a0 = (i * 360) / n, a1 = ((i + 1) * 360) / n;
              const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
              const mid = (a0 + a1) / 2, [tx, ty] = [R + R * 0.62 * Math.sin((mid * Math.PI) / 180), R - R * 0.62 * Math.cos((mid * Math.PI) / 180)];
              return (
                <g key={i}>
                  <path d={`M${R},${R} L${x0},${y0} A${R},${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1} Z`} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth="1" />
                  <text x={tx} y={ty} fill="#fff" fontSize="9" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${mid} ${tx} ${ty})`}>{o.slice(0, 7)}</text>
                </g>
              );
            }) : <circle cx={R} cy={R} r={R} fill="#e5e7eb" />}
          </svg>
        </div>
        <button onClick={spin} disabled={spinning || n < 2} className={`${btn} w-full mt-4 bg-green-500 text-white disabled:opacity-50`}>{spinning ? "回転中…" : "まわす"}</button>
        {result && <div className="mt-3 text-center"><div className="text-[11px] text-gray-400">けっか</div><div className="text-2xl font-black text-green-600 break-all">{result}</div></div>}
      </div>
      <div className={card}>
        <div className="text-xs font-bold text-gray-500 mb-1">候補（1行に1つ・2〜12個）</div>
        <textarea value={text} onChange={(e) => { setText(e.target.value); store.set("toolbox.roulette", e.target.value); }} rows={5} className="w-full bg-gray-50 border rounded-xl p-3 text-sm outline-none resize-none" />
      </div>
    </div>
  );
};

const GROUPS = [
  ["毎日の記録", [
    ["todo", "ToDo", CheckSquare, "bg-emerald-50 text-emerald-600", Todo],
    ["habit", "習慣", Flame, "bg-orange-50 text-orange-500", Habits],
    ["ledger", "家計簿", Wallet, "bg-yellow-50 text-yellow-600", Ledger],
    ["countdown", "カウントダウン", Hourglass, "bg-pink-50 text-pink-500", Countdown],
    ["snippet", "定型文", MessageSquare, "bg-sky-50 text-sky-500", Snippets],
  ]],
  ["時間", [
    ["alarm", "目覚まし", AlarmClock, "bg-amber-50 text-amber-600", Alarms],
    ["timer", "タイマー", TimerIcon, "bg-red-50 text-red-500", Timer],
    ["pomo", "ポモドーロ", Target, "bg-rose-50 text-rose-500", Pomodoro],
    ["world", "世界時計", Globe, "bg-blue-50 text-blue-500", WorldClock],
    ["date", "日付計算", CalendarDays, "bg-indigo-50 text-indigo-500", DateCalc],
  ]],
  ["計算・変換", [
    ["calc", "電卓", Calculator, "bg-gray-100 text-gray-700", Calc],
    ["units", "単位変換", Ruler, "bg-lime-50 text-lime-600", Units],
    ["split", "割り勘", Receipt, "bg-green-50 text-green-600", Split],
    ["count", "文字数", Type, "bg-slate-100 text-slate-600", Counter],
    ["pass", "パスワード", KeyRound, "bg-violet-50 text-violet-500", Pass],
  ]],
  ["みんなで遊ぶ・決める", [
    ["roulette", "ルーレット", Target, "bg-fuchsia-50 text-fuchsia-500", Roulette],
    ["teams", "チーム分け", Users, "bg-cyan-50 text-cyan-600", Teams],
    ["dice", "サイコロ・コイン", Dices, "bg-teal-50 text-teal-600", Dice],
  ]],
];
const ALL = GROUPS.flatMap(([, items]) => items);

const ToolboxView = ({ setView, showNotification }) => {
  const [tool, setTool] = useState(null);
  const cur = ALL.find((t) => t[0] === tool);
  const Cmp = cur?.[4];
  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title={cur ? cur[1] : "便利ボックス"} onBack={() => (cur ? setTool(null) : setView("services"))} />
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-24">
        {Cmp ? <Cmp showNotification={showNotification} /> : (
          <div className="px-4 pb-6">
            {GROUPS.map(([title, items]) => (
              <div key={title} className="mt-5">
                <div className="text-xs font-bold text-gray-400 mb-3">{title}</div>
                <div className="grid grid-cols-4 gap-3">
                  {items.map(([id, label, Icon, color]) => (
                    <button key={id} onClick={() => setTool(id)} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
                      <span className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color}`}><Icon className="w-6 h-6" /></span>
                      <span className="text-[11px] font-bold text-gray-700 text-center leading-tight">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolboxView;
