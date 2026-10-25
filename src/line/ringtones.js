// 着信音の設定・保存（IndexedDB）・音声のトリミング。
// 長い音声ファイルでも、好きな区間（最大 MAX_SEC 秒）を切り出して着信音にできます。
// 切り出した音は 16bit モノラル WAV に変換して端末内（IndexedDB）に保存します（サーバーには送りません）。

export const MAX_SEC = 30;            // 着信音として保存できる最大の長さ（秒）
export const MAX_FILE_MB = 100;       // 読み込める元ファイルの上限（デコード時のメモリ対策）
export const MAX_TONES = 20;          // 保存できる着信音の数
const DB_NAME = "chatRingtones";
const STORE = "tones";
const SET_KEY = "ringSettings";

// ---------- 内蔵の着信音（音声ファイル不要・プログラムで生成） ----------
// steps: [開始秒, 周波数Hz, 長さ秒, 音量(0-1), 波形]
const seq = (notes, start, step, dur, type = "sine", vol = 0.12) => notes.map((f, i) => [start + i * step, f, dur, vol, type]);
const N = { C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, E6: 1319, G4: 392, E4: 330, C4: 262 };

export const PRESETS_IN = [
  { id: "default", name: "標準（ピロロロ）", length: 2.0, steps: [...seq([988, 740, 988, 740], 0, 0.22, 0.18), ...seq([988, 740, 988, 740], 1.1, 0.22, 0.18)] },
  { id: "bell", name: "ベル", length: 2.4, steps: [[0, 1568, 1.0, 0.1, "sine"], [0, 2349, 0.8, 0.05, "sine"], [0.9, 1568, 1.0, 0.1, "sine"], [0.9, 2349, 0.8, 0.05, "sine"], [1.8, 1568, 0.6, 0.1, "sine"]] },
  { id: "melody", name: "メロディ", length: 2.6, steps: seq([N.C5, N.E5, N.G5, N.C6, N.G5, N.E5, N.G5, N.E5], 0, 0.3, 0.26, "triangle", 0.16) },
  { id: "digital", name: "デジタル", length: 1.6, steps: [...seq([1200, 1200, 1200], 0, 0.14, 0.08, "square", 0.05), ...seq([1200, 1200, 1200], 0.6, 0.14, 0.08, "square", 0.05), ...seq([1200, 1200, 1200], 1.2, 0.14, 0.08, "square", 0.05)] },
  { id: "soft", name: "やさしい", length: 2.4, steps: seq([N.E5, N.G5, N.C6], 0, 0.5, 0.7, "sine", 0.1) },
  { id: "alarm", name: "目覚まし", length: 1.2, steps: [...seq([880, 0, 880, 0, 880], 0, 0.15, 0.1, "sawtooth", 0.06).filter((s) => s[1])] },
];

export const PRESETS_OUT = [
  { id: "default", name: "標準（プルル）", length: 2.0, steps: [[0, 440, 0.9, 0.06, "sine"], [1.1, 440, 0.9, 0.06, "sine"]] },
  { id: "soft", name: "やさしい", length: 2.4, steps: [[0, 523, 0.6, 0.05, "sine"], [0.7, 659, 0.6, 0.05, "sine"]] },
  { id: "off", name: "鳴らさない", length: 0, steps: [] },
];

export const VIBRATE_PATTERNS = {
  normal: { name: "標準", pattern: [500, 250, 500, 250, 500] },
  long: { name: "ゆったり長め", pattern: [900, 400, 900, 400] },
  short: { name: "短くトントン", pattern: [150, 100, 150, 100, 150, 100, 150] },
  heartbeat: { name: "ドクンドクン", pattern: [120, 80, 320, 600] },
  off: { name: "振動しない", pattern: [] },
};

// ---------- 設定（端末ごと・localStorage） ----------
export const DEFAULT_RING = {
  incoming: "preset:default",      // preset:<id> | custom:<id>
  outgoing: "preset:default",
  volume: 0.8,                     // 0.0〜1.0
  gap: 1.2,                        // カスタム音の繰り返し間隔（秒）
  vibratePattern: "normal",
  autoStopSec: 60,                 // 着信音を自動で止めるまでの秒数（0=止めない）
  perUser: {},                     // { 相手のuid: "preset:xxx" | "custom:xxx" }
  quiet: { on: false, from: "22:00", to: "07:00", silentVibrate: false }, // おやすみ時間帯
};

export const getRingSettings = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SET_KEY) || "{}");
    return { ...DEFAULT_RING, ...s, quiet: { ...DEFAULT_RING.quiet, ...(s.quiet || {}) }, perUser: { ...(s.perUser || {}) } };
  } catch { return { ...DEFAULT_RING, quiet: { ...DEFAULT_RING.quiet }, perUser: {} }; }
};
const notifyChanged = () => { try { window.dispatchEvent(new Event("ring-changed")); } catch { /* 無視 */ } };
export const setRingSettings = (patch, { silent = false } = {}) => {
  const next = { ...getRingSettings(), ...patch, updatedAt: Date.now() };
  try { localStorage.setItem(SET_KEY, JSON.stringify(next)); } catch { /* 無視 */ }
  if (!silent) notifyChanged();
  return next;
};
// クラウドから取り込んだ設定を反映（更新時刻はクラウドのものをそのまま使う）
export const applyRemoteSettings = (obj, at) => {
  const next = { ...DEFAULT_RING, ...obj, quiet: { ...DEFAULT_RING.quiet, ...(obj?.quiet || {}) }, perUser: { ...(obj?.perUser || {}) }, updatedAt: at };
  try { localStorage.setItem(SET_KEY, JSON.stringify(next)); } catch { /* 無視 */ }
  try { window.dispatchEvent(new Event("ring-settings-applied")); } catch { /* 無視 */ }
};

// 端末で削除した着信音の記録（クラウドへ反映するまで保持）
const PEND_KEY = "ringPendingDeletes";
export const getPendingDeletes = () => { try { return JSON.parse(localStorage.getItem(PEND_KEY)) || []; } catch { return []; } };
export const clearPendingDeletes = (ids) => {
  try { localStorage.setItem(PEND_KEY, JSON.stringify(getPendingDeletes().filter((x) => !ids.includes(x)))); } catch { /* 無視 */ }
};

// "HH:MM" の範囲に今が入っているか（日をまたぐ 22:00→07:00 に対応）
export const isQuietNow = (q = getRingSettings().quiet, now = new Date()) => {
  if (!q?.on) return false;
  const toMin = (s) => { const [h, m] = String(s || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const cur = now.getHours() * 60 + now.getMinutes();
  const a = toMin(q.from), b = toMin(q.to);
  if (a === b) return false;
  return a < b ? cur >= a && cur < b : cur >= a || cur < b;
};

// ---------- IndexedDB ----------
const openDb = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === "undefined") return reject(new Error("このブラウザは保存に対応していません"));
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: "id" }); };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error || new Error("保存領域を開けませんでした"));
});
const tx = async (mode, fn) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(out?.result); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error || new Error("保存に失敗しました（容量不足の可能性）")); };
  });
};

export const listTones = async () => {
  try { return ((await tx("readonly", (s) => s.getAll())) || []).sort((a, b) => b.createdAt - a.createdAt); }
  catch { return []; }
};
export const getTone = async (id) => { try { return await tx("readonly", (s) => s.get(id)); } catch { return null; } };
export const saveTone = async (tone, { silent = false } = {}) => {
  await tx("readwrite", (s) => s.put(tone));
  try { navigator.storage?.persist?.(); } catch { /* 無視 */ }
  if (!silent) notifyChanged();
};
export const deleteTone = async (id) => {
  await deleteToneLocalOnly(id);
  try { localStorage.setItem(PEND_KEY, JSON.stringify([...new Set([...getPendingDeletes(), id])])); } catch { /* 無視 */ }
  notifyChanged();
};
export const deleteToneLocalOnly = async (id) => {
  await tx("readwrite", (s) => s.delete(id));
  // その音を使っている設定を標準に戻す
  const st = getRingSettings();
  const key = `custom:${id}`;
  const patch = {};
  if (st.incoming === key) patch.incoming = "preset:default";
  if (st.outgoing === key) patch.outgoing = "preset:default";
  const pu = Object.fromEntries(Object.entries(st.perUser).filter(([, v]) => v !== key));
  if (Object.keys(pu).length !== Object.keys(st.perUser).length) patch.perUser = pu;
  if (Object.keys(patch).length) setRingSettings(patch);
  bufferCache.delete(id);
};

// ---------- デコード・波形・WAV 変換 ----------
const AC = () => (typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null);

export const decodeArrayBuffer = async (ab) => {
  const C = AC();
  if (!C) throw new Error("このブラウザは音声の読み込みに対応していません");
  const c = new C();
  try {
    // Safari 旧版はコールバック形式のみ対応のため両対応にする
    return await new Promise((res, rej) => {
      const p = c.decodeAudioData(ab.slice(0), res, rej);
      if (p && p.catch) p.catch(rej);
    });
  } finally { try { c.close(); } catch { /* 無視 */ } }
};

export const decodeFile = async (file) => {
  if (!file) throw new Error("ファイルがありません");
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`ファイルが大きすぎます（${MAX_FILE_MB}MBまで）`);
  const ab = await file.arrayBuffer();
  try { return await decodeArrayBuffer(ab); }
  catch { throw new Error("この音声ファイルは読み込めませんでした（mp3 / m4a / wav / ogg などを選んでください）"); }
};

// 波形表示用: n 本の棒の高さ(0-1)
export const getPeaks = (buf, n = 120) => {
  const ch = buf.getChannelData(0);
  const size = Math.max(1, Math.floor(ch.length / n));
  const peaks = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let m = 0;
    const from = i * size, to = Math.min(ch.length, from + size);
    const stride = Math.max(1, Math.floor((to - from) / 200)); // 長い音声でも速く
    for (let j = from; j < to; j += stride) { const v = Math.abs(ch[j]); if (v > m) m = v; }
    peaks[i] = m;
  }
  const max = Math.max(...peaks, 0.0001);
  return peaks.map((p) => p / max);
};

const writeStr = (v, o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
export const encodeWav = (buf) => {
  const data = buf.getChannelData(0);
  const rate = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  writeStr(out, 0, "RIFF"); out.setUint32(4, 36 + data.length * 2, true); writeStr(out, 8, "WAVE");
  writeStr(out, 12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  writeStr(out, 36, "data"); out.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    out.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([out], { type: "audio/wav" });
};

// buf の [start, end] 秒を切り出し、モノラル/32kHz にそろえて WAV にする。fade 秒のフェードイン/アウト付き。
export const trimToWav = async (buf, start, end, { fade = 0.05, rate = 32000, gain = 1 } = {}) => {
  const len = Math.max(0.1, Math.min(MAX_SEC, end - start));
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OC) throw new Error("このブラウザは音声の加工に対応していません");
  const frames = Math.max(1, Math.round(len * rate));
  const off = new OC(1, frames, rate);
  const src = off.createBufferSource();
  src.buffer = buf;
  const g = off.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(gain, Math.min(fade, len / 2));
  g.gain.setValueAtTime(gain, Math.max(0, len - fade));
  g.gain.linearRampToValueAtTime(0, len);
  src.connect(g); g.connect(off.destination); // 多チャンネルは自動でモノラルにミックスダウン
  src.start(0, Math.max(0, start), len);
  const rendered = await new Promise((res, rej) => {
    const p = off.startRendering();
    if (p && p.then) p.then(res, rej); else off.oncomplete = (e) => res(e.renderedBuffer);
  });
  return { blob: encodeWav(rendered), duration: len };
};

// ---------- 再生用バッファ（キャッシュ） ----------
const bufferCache = new Map();
export const loadToneBuffer = async (id) => {
  if (bufferCache.has(id)) return bufferCache.get(id);
  const t = await getTone(id);
  if (!t?.blob) return null;
  const buf = await decodeArrayBuffer(await t.blob.arrayBuffer());
  bufferCache.set(id, buf);
  return buf;
};

// "preset:xxx" / "custom:xxx" を解決する
export const parseToneRef = (ref) => {
  const [kind, id] = String(ref || "preset:default").split(":");
  return { kind: kind === "custom" ? "custom" : "preset", id: id || "default" };
};
export const findPreset = (id, outgoing = false) => (outgoing ? PRESETS_OUT : PRESETS_IN).find((p) => p.id === id) || (outgoing ? PRESETS_OUT[0] : PRESETS_IN[0]);

export const toneRefFor = (kind, callerId) => {
  const st = getRingSettings();
  if (kind === "incoming" && callerId && st.perUser[callerId]) return st.perUser[callerId];
  return kind === "incoming" ? st.incoming : st.outgoing;
};
