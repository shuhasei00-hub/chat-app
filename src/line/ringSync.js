// 着信音のクラウド保存（アカウントに紐づけ）。
// ・ログアウト/ログイン、別の端末、ブラウザのデータ消去のあとでも、同じアカウントなら着信音と設定が戻ります。
// ・保存先: artifacts/{appId}/public/data/users/{uid}/ringtones/{toneId}（音声は 450KB ごとに chunks/ へ分割して保存）
//          artifacts/{appId}/public/data/users/{uid}/prefs/ring（設定と「削除した着信音」の記録）
// ・端末内（IndexedDB / localStorage）が常に先に使われ、クラウドは裏でバックアップ/復元されます。
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { getRingSettings, listTones, saveTone, deleteToneLocalOnly, getPendingDeletes, clearPendingDeletes, applyRemoteSettings } from "./ringtones";

const CHUNK = 450000;          // 1ドキュメントに入れるバイト数（base64 で約 600KB < Firestore の 1MiB 制限）
const MAX_CLOUD_BYTES = 6 * 1024 * 1024; // これより大きい音は端末内のみ

const toB64 = (buf) => {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64) => {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
};

let cfg = null;      // { db, appId, uid }
let running = false;
let again = false;
let timer = null;
export const syncState = { status: "idle", at: 0, error: "" }; // idle | syncing | ok | error | off
const setState = (p) => { Object.assign(syncState, p); try { window.dispatchEvent(new Event("ring-sync-state")); } catch { /* 無視 */ } };

const base = () => ["artifacts", cfg.appId, "public", "data", "users", cfg.uid];
const tonesCol = () => collection(cfg.db, ...base(), "ringtones");
const toneDoc = (id) => doc(cfg.db, ...base(), "ringtones", id);
const chunksCol = (id) => collection(cfg.db, ...base(), "ringtones", id, "chunks");
const prefDoc = () => doc(cfg.db, ...base(), "prefs", "ring");

const deleteRemoteTone = async (id) => {
  try {
    const cs = await getDocs(chunksCol(id));
    await Promise.all(cs.docs.map((d) => deleteDoc(d.ref)));
  } catch { /* 無視 */ }
  await deleteDoc(toneDoc(id));
};

const uploadTone = async (t) => {
  const buf = await t.blob.arrayBuffer();
  if (buf.byteLength > MAX_CLOUD_BYTES) return;
  const n = Math.ceil(buf.byteLength / CHUNK);
  for (let i = 0; i < n; i++) {
    await setDoc(doc(cfg.db, ...base(), "ringtones", t.id, "chunks", String(i).padStart(3, "0")), { d: toB64(buf.slice(i * CHUNK, (i + 1) * CHUNK)) });
  }
  // 本体（メタ情報）は最後に書く = メタがあれば音声は完全にそろっている
  await setDoc(toneDoc(t.id), { name: t.name, duration: t.duration, createdAt: t.createdAt, chunks: n, size: buf.byteLength });
};

const downloadTone = async (id, meta) => {
  const cs = await getDocs(chunksCol(id));
  const parts = cs.docs.sort((a, b) => (a.id < b.id ? -1 : 1)).map((d) => fromB64(d.data().d));
  if (parts.length !== meta.chunks) throw new Error("incomplete");
  await saveTone({ id, name: meta.name, duration: meta.duration, createdAt: meta.createdAt, blob: new Blob(parts, { type: "audio/wav" }) }, { silent: true });
};

const runSync = async () => {
  if (!cfg) return;
  if (running) { again = true; return; }
  running = true;
  setState({ status: "syncing", error: "" });
  try {
    // 1) 設定ドキュメント（設定・削除記録）
    const prefSnap = await getDoc(prefDoc());
    const cloud = prefSnap.exists() ? prefSnap.data() : null;
    const cloudDeleted = new Set(cloud?.deleted || []);
    const pending = getPendingDeletes();
    pending.forEach((id) => cloudDeleted.add(id));

    // 2) 他の端末で削除された着信音を、この端末からも消す
    const local0 = await listTones();
    for (const t of local0) if (cloudDeleted.has(t.id)) await deleteToneLocalOnly(t.id);

    // 3) クラウド側の整理（削除した着信音）
    const remoteSnap = await getDocs(tonesCol());
    const remote = new Map(remoteSnap.docs.map((d) => [d.id, d.data()]));
    for (const id of cloudDeleted) if (remote.has(id)) { await deleteRemoteTone(id); remote.delete(id); }

    // 4) クラウドにだけある着信音をこの端末へ
    const local = await listTones();
    const localIds = new Set(local.map((t) => t.id));
    for (const [id, meta] of remote) {
      if (localIds.has(id) || cloudDeleted.has(id)) continue;
      try { await downloadTone(id, meta); } catch (e) { console.warn("ringtone download failed", id, e); }
    }

    // 5) この端末にだけある着信音をクラウドへ
    for (const t of local) if (!remote.has(t.id) && !cloudDeleted.has(t.id)) { try { await uploadTone(t); } catch (e) { console.warn("ringtone upload failed", t.id, e); } }

    // 6) 設定: 新しいほうを採用
    const mine = getRingSettings();
    const cloudAt = cloud?.updatedAt || 0;
    const deletedArr = Array.from(cloudDeleted).slice(-100);
    if (cloud && cloudAt > (mine.updatedAt || 0)) {
      try { applyRemoteSettings(JSON.parse(cloud.json), cloudAt); } catch { /* 無視 */ }
      if (deletedArr.length !== (cloud.deleted || []).length) await setDoc(prefDoc(), { ...cloud, deleted: deletedArr });
    } else if ((mine.updatedAt || 0) > cloudAt || deletedArr.length !== (cloud?.deleted || []).length) {
      await setDoc(prefDoc(), { json: JSON.stringify(mine), updatedAt: mine.updatedAt || Date.now(), deleted: deletedArr });
    }
    clearPendingDeletes(pending);
    setState({ status: "ok", at: Date.now() });
  } catch (e) {
    console.warn("ring sync failed:", e);
    setState({ status: "error", error: e?.message || String(e) });
  } finally {
    running = false;
    if (again) { again = false; schedule(1500); }
  }
};

const schedule = (ms = 1500) => { clearTimeout(timer); timer = setTimeout(runSync, ms); };

const onChanged = () => schedule(1500);
const onVisible = () => { if (document.visibilityState === "visible") schedule(500); };

export const startRingSync = (c) => {
  stopRingSync();
  cfg = c;
  try { navigator.storage?.persist?.(); } catch { /* 無視 */ }   // ブラウザに勝手に消されにくくする
  window.addEventListener("ring-changed", onChanged);
  document.addEventListener("visibilitychange", onVisible);
  schedule(800);
};
export const stopRingSync = () => {
  clearTimeout(timer);
  window.removeEventListener("ring-changed", onChanged);
  document.removeEventListener("visibilitychange", onVisible);
  cfg = null;
  setState({ status: "off" });
};
export const syncNow = () => schedule(0);
