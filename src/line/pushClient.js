// Web Push のクライアント側: 購読 / 通知の送信依頼 / 通知設定の同期
// （サーバー側は functions/api/push/*。VAPID鍵の設定が無い環境では何もせず静かに無効になります）
import { getMutedChats, getPrefs } from "./prefs";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const swUrl = () => `${process.env.PUBLIC_URL || ""}/sw.js`;

const b64uToBytes = (s) => {
  const p = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const sameKey = (buf, b64) => {
  if (!buf) return false;
  const a = new Uint8Array(buf);
  const b = b64uToBytes(b64);
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

const post = async (user, path, body) => {
  const token = await user.getIdToken();
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    keepalive: true,
  });
};

export const serverPrefs = () => {
  const p = getPrefs();
  return { message: p.message, call: p.call, reminder: p.reminder, preview: p.preview };
};

// 端末をこのアカウントのプッシュ宛先として登録（通知の許可が済んでいるとき）。起動のたびに呼んで同期します
export const syncPush = async (user) => {
  if (!user || !pushSupported()) return { ok: false, reason: "unsupported" };
  if (Notification.permission !== "granted") return { ok: false, reason: "permission" };
  try {
    await navigator.serviceWorker.register(swUrl());
    const reg = await navigator.serviceWorker.ready;
    const k = await fetch("/api/push/key").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!k?.enabled || !k.publicKey) return { ok: false, reason: "server" };
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options?.applicationServerKey, k.publicKey)) { await sub.unsubscribe().catch(() => {}); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(k.publicKey) });
    const res = await post(user, "/api/push/subscribe", {
      subscription: sub.toJSON(), prefs: serverPrefs(), muted: getMutedChats(), ua: navigator.userAgent.slice(0, 120),
    });
    return res.ok ? { ok: true } : { ok: false, reason: "server" };
  } catch (error) {
    return { ok: false, reason: "error", error };
  }
};

// 通知設定・ミュート中トークの変更をサーバーに反映
export const syncPushPrefs = async (user) => {
  if (!user) return;
  try { await post(user, "/api/push/prefs", { prefs: serverPrefs(), muted: getMutedChats() }); } catch { /* 無視 */ }
};

// ログアウト時: この端末への通知をこのアカウントから外す（次にログインする人に前の人の通知が届かないように）
export const unsubscribePush = async (user) => {
  if (!user || !pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await post(user, "/api/push/subscribe", { action: "unsubscribe", endpoint: sub.endpoint });
  } catch { /* 無視 */ }
};

// メッセージ送信後 / 発信後に呼ぶ（相手の端末へプッシュを送るようサーバーに依頼）。失敗してもアプリの動作には影響しません
export const pushNotify = (user, body) => {
  if (!user?.getIdToken) return;
  post(user, "/api/push/notify", body).catch(() => {});
};

export const sendTestPush = async (user) => {
  const r = await post(user, "/api/push/notify", { kind: "test" });
  return r.json().catch(() => ({}));
};

const closeByTag = async (tag) => {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    (await reg?.getNotifications?.({ tag }))?.forEach((n) => n.close());
  } catch { /* 無視 */ }
};
export const closeCallNotification = (chatId) => closeByTag(`call-${chatId}`);
export const closeChatNotifications = (chatId) => closeByTag(`chat-${chatId}`);

// 通知の許可をまだ聞いていなければ聞いてから購読する（リマインダー等、通知が前提の機能用）
export const ensurePushReady = async (user) => {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  if (Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch { /* 無視 */ }
  }
  if (Notification.permission !== "granted") return { ok: false, reason: "permission" };
  return syncPush(user);
};

// 通知が届く状態かどうかの診断（設定画面の「通知の状態」用）
export const getPushStatus = async () => {
  const ua = navigator.userAgent;
  const st = {
    supported: pushSupported(),
    permission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
    ios: /iPhone|iPad|iPod/.test(ua),
    standalone: !!(window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true),
    serverEnabled: null, // true: VAPID設定済み / false: 未設定 / null: サーバーに接続できない
    subscribed: false,
  };
  try {
    const k = await fetch("/api/push/key").then((r) => (r.ok ? r.json() : null));
    st.serverEnabled = k ? !!k.enabled : null;
  } catch { st.serverEnabled = null; }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    st.subscribed = !!(await reg?.pushManager?.getSubscription());
  } catch { /* 無視 */ }
  return st;
};
