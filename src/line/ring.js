// 着信音・発信音と振動（アプリを開いている間）。アプリを閉じている間は Service Worker の通知が担当します。
// 音は「内蔵の音」または「自分で選んだ音声ファイルの好きな区間（ringtones.js で保存）」から選べます。
import { useEffect } from "react";
import { getPrefs } from "./prefs";
import {
  getRingSettings, isQuietNow, loadToneBuffer, parseToneRef, findPreset, toneRefFor, VIBRATE_PATTERNS,
} from "./ringtones";

let ctx = null;
let session = null; // 現在鳴っている着信音の状態
let preview = null; // 設定画面の試聴

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

const beep = (c, out, at, freq, dur, vol, type = "sine") => {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const d = Math.max(0.05, dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.02);
  g.gain.setValueAtTime(vol, at + Math.max(0.02, d - 0.03));
  g.gain.linearRampToValueAtTime(0, at + d);
  o.connect(g);
  g.connect(out);
  o.start(at);
  o.stop(at + d + 0.02);
  return o;
};

// 1回ぶん（1サイクル）鳴らす。戻り値: { length: 次のサイクルまでの秒数, nodes: 止めるためのノード }
const playOnce = async (c, out, s) => {
  const nodes = [];
  if (s.kind === "custom") {
    const buf = await loadToneBuffer(s.id).catch(() => null);
    if (buf) {
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      src.start(c.currentTime + 0.03);
      nodes.push(src);
      return { length: buf.duration + s.gap, nodes };
    }
    // 読み込めなければ標準音にもどす
    s = { ...s, kind: "preset", id: "default" };
  }
  const p = findPreset(s.id, s.outgoing);
  const t = c.currentTime + 0.05;
  p.steps.forEach(([off, f, d, v, type]) => nodes.push(beep(c, out, t + off, f, d, v, type)));
  return { length: p.length + 1.2, nodes };
};

const vibrateNow = (kind) => {
  if (kind !== "incoming" || !getPrefs().vibrate || !navigator.vibrate) return;
  const st = getRingSettings();
  if (isQuietNow(st.quiet) && st.quiet.silentVibrate) return;
  const pat = (VIBRATE_PATTERNS[st.vibratePattern] || VIBRATE_PATTERNS.normal).pattern;
  if (pat.length) navigator.vibrate(pat);
};

const stopSession = (s) => {
  if (!s) return;
  s.stopped = true;
  clearTimeout(s.timer);
  clearTimeout(s.auto);
  s.nodes.forEach((n) => { try { n.stop(); } catch { /* 無視 */ } });
  s.nodes = [];
  try { s.out?.disconnect(); } catch { /* 無視 */ }
};

// ref: "preset:xxx" | "custom:xxx"
const run = (ref, { outgoing = false, volume = 0.8, gap = 1.2, loop = true, onEnd, silent = false } = {}) => {
  const { kind, id } = parseToneRef(ref);
  const s = { stopped: false, timer: null, auto: null, nodes: [], out: null };
  const c = getCtx();
  if (silent || !c || c.state !== "running" || (kind === "preset" && findPreset(id, outgoing).steps.length === 0)) {
    if (onEnd) setTimeout(onEnd, 0);
    return s; // 無音（鳴らさない設定・おやすみ時間・まだ音を出せない状態）
  }
  const out = c.createGain();
  out.gain.value = Math.max(0, Math.min(1, volume)) * 1.25; // 0.8 を従来と同じ音量とする
  out.connect(c.destination);
  s.out = out;
  const cfg = { kind, id, outgoing, gap };
  const loopOnce = async () => {
    if (s.stopped) return;
    const r = await playOnce(c, out, cfg);
    if (s.stopped) { r.nodes.forEach((n) => { try { n.stop(); } catch { /* 無視 */ } }); return; }
    s.nodes = r.nodes;
    if (loop) s.timer = setTimeout(loopOnce, Math.max(500, r.length * 1000));
    else s.timer = setTimeout(() => { stopSession(s); onEnd?.(); }, Math.max(300, (r.length - cfg.gap) * 1000));
  };
  loopOnce();
  return s;
};

export const startRing = (kind = "incoming", callerId = null) => {
  stopRing();
  const st = getRingSettings();
  const quiet = isQuietNow(st.quiet);
  const ref = toneRefFor(kind, callerId);
  const sess = run(ref, {
    outgoing: kind !== "incoming",
    volume: st.volume,
    gap: st.gap,
    silent: quiet && kind === "incoming",
  });
  session = sess;
  if (st.autoStopSec > 0 && kind === "incoming") {
    sess.auto = setTimeout(() => { stopSession(sess); try { navigator.vibrate?.(0); } catch { /* 無視 */ } }, st.autoStopSec * 1000);
  }
  // 振動はサイクルごと（音の長さに依らず一定間隔 3.2 秒）
  vibrateNow(kind);
  sess.vib = kind === "incoming" ? setInterval(() => vibrateNow(kind), 3200) : null;
};

export const stopRing = () => {
  if (session) { clearInterval(session.vib); stopSession(session); }
  session = null;
  try { navigator.vibrate?.(0); } catch { /* 無視 */ }
};

// 画面が表示されている間だけ鳴らす（コンポーネントの表示/非表示に連動）
export const useRing = (kind = "incoming", callerId = null) => {
  useEffect(() => {
    startRing(kind, callerId);
    return stopRing;
  }, [kind, callerId]);
};

// ---------- 設定画面の試聴 ----------
export const stopPreview = () => { stopSession(preview); preview = null; };
export const playPreview = (ref, { outgoing = false, volume, onEnd } = {}) => {
  stopPreview();
  stopRing();
  const st = getRingSettings();
  preview = run(ref, { outgoing, volume: volume ?? st.volume, gap: 0.3, loop: false, onEnd: () => { preview = null; onEnd?.(); } });
  return preview;
};
export const previewVibrate = (key) => {
  const pat = (VIBRATE_PATTERNS[key] || VIBRATE_PATTERNS.normal).pattern;
  try { navigator.vibrate?.(pat.length ? pat : 0); } catch { /* 無視 */ }
};

// ---------- 目覚まし・タイマー用（おやすみ時間に関係なく鳴らす。止めるまで繰り返す） ----------
let alarmSess = null;
export const startAlarmSound = (ref) => {
  stopAlarmSound();
  const st = getRingSettings();
  alarmSess = run(ref || st.incoming, { volume: Math.max(0.5, st.volume), gap: st.gap });
  alarmSess.vib = setInterval(() => { try { navigator.vibrate?.([500, 250, 500]); } catch { /* 無視 */ } }, 2500);
  try { navigator.vibrate?.([500, 250, 500]); } catch { /* 無視 */ }
};
export const stopAlarmSound = () => {
  if (alarmSess) { clearInterval(alarmSess.vib); stopSession(alarmSess); }
  alarmSess = null;
  try { navigator.vibrate?.(0); } catch { /* 無視 */ }
};
