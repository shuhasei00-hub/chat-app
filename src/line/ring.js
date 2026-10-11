// 着信音・発信音と振動（アプリを開いている間）。アプリを閉じている間は Service Worker の通知が担当します。
import { useEffect } from "react";
import { getPrefs } from "./prefs";

let ctx = null;
let timer = null;

const getCtx = () => {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
};
// ブラウザは「ユーザー操作の後」でないと音を出せないので、最初のタップ/クリックで解禁しておく
if (typeof window !== "undefined") {
  const unlock = () => { getCtx(); };
  ["pointerdown", "touchstart", "click", "keydown"].forEach((ev) => window.addEventListener(ev, unlock, { once: true, passive: true }));
}

const beep = (c, at, freq, dur, vol = 0.12) => {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.02);
  g.gain.setValueAtTime(vol, at + dur - 0.03);
  g.gain.linearRampToValueAtTime(0, at + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
};

const cycle = (kind) => {
  const c = getCtx();
  if (c && c.state === "running") {
    const t = c.currentTime + 0.05;
    if (kind === "incoming") { // ピロロロ ピロロロ
      [0, 0.22, 0.44, 0.66].forEach((o, i) => beep(c, t + o, i % 2 ? 740 : 988, 0.18));
      [1.1, 1.32, 1.54, 1.76].forEach((o, i) => beep(c, t + o, i % 2 ? 740 : 988, 0.18));
    } else { // プルル…（呼び出し中）
      beep(c, t, 440, 0.9, 0.06);
      beep(c, t + 1.1, 440, 0.9, 0.06);
    }
  }
  if (kind === "incoming" && getPrefs().vibrate && navigator.vibrate) navigator.vibrate([500, 250, 500, 250, 500]);
};

export const startRing = (kind = "incoming") => {
  stopRing();
  cycle(kind);
  timer = setInterval(() => cycle(kind), 3200);
};

export const stopRing = () => {
  if (timer) clearInterval(timer);
  timer = null;
  try { navigator.vibrate?.(0); } catch { /* 無視 */ }
};

// 画面が表示されている間だけ鳴らす（コンポーネントの表示/非表示に連動）
export const useRing = (kind = "incoming") => {
  useEffect(() => {
    startRing(kind);
    return stopRing;
  }, [kind]);
};
