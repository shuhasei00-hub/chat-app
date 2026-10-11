// プッシュ通知の共通処理（購読の保存 / ユーザー宛て送信 / 重複送信の防止）
import { commit, fieldPath, getServerDoc, mergeServerDoc, serverDocName, toFields, deleteServerDoc } from "./firestore.js";
import { b64uDecode, isAllowedEndpoint, sendWebPush } from "./webpush.js";
import { HttpError } from "./util.js";

export const pushConfigured = (env) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
// 購読のキー。Firestoreのフィールド名として使えるよう、先頭に英字を付ける
export const subKey = async (endpoint) =>
  "s" + hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint))).slice(0, 32);

const clean = (v, max) => String(v ?? "").slice(0, max);

export const sanitizePrefs = (p = {}) => ({
  message: p.message !== false,
  call: p.call !== false,
  reminder: p.reminder !== false,
  preview: p.preview !== false,
});
export const sanitizeMuted = (m) => (Array.isArray(m) ? m.map((x) => clean(x, 80)).slice(0, 500) : []);

// 購読を登録。同じ端末(endpoint)が別アカウントに残っていたら、そちらからは外す
export const saveSubscription = async (env, uid, subscription, { prefs, muted, ua } = {}) => {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new HttpError(400, "購読情報が不正です");
  if (!isAllowedEndpoint(env, endpoint)) throw new HttpError(400, "この通知サービスには対応していません");
  try {
    if (b64uDecode(p256dh).length !== 65 || b64uDecode(auth).length !== 16) throw new Error();
  } catch { throw new HttpError(400, "購読キーが不正です"); }

  const key = await subKey(endpoint);
  const idx = await getServerDoc(env, "push_endpoints", key);
  if (idx?.uid && idx.uid !== uid) {
    await commit(env, [{
      update: { name: serverDocName(env, "push_subs", idx.uid), fields: {} },
      updateMask: { fieldPaths: [fieldPath("subs", key)] },
    }]).catch(() => {});
  }
  await commit(env, [
    {
      update: {
        name: serverDocName(env, "push_subs", uid),
        fields: toFields({
          subs: { [key]: { endpoint, p256dh, auth, ua: clean(ua, 120), updatedAt: new Date() } },
          ...(prefs ? { prefs: sanitizePrefs(prefs) } : {}),
          ...(muted ? { muted: sanitizeMuted(muted) } : {}),
        }),
      },
      updateMask: { fieldPaths: [fieldPath("subs", key), ...(prefs ? ["prefs"] : []), ...(muted ? ["muted"] : [])] },
    },
    { update: { name: serverDocName(env, "push_endpoints", key), fields: toFields({ uid, updatedAt: new Date() }) } },
  ]);
  return key;
};

export const removeSubscription = async (env, uid, endpoint) => {
  if (!endpoint) return;
  const key = await subKey(endpoint);
  await commit(env, [{
    update: { name: serverDocName(env, "push_subs", uid), fields: {} },
    updateMask: { fieldPaths: [fieldPath("subs", key)] },
  }]).catch(() => {});
  await deleteServerDoc(env, "push_endpoints", key).catch(() => {});
};

export const savePrefs = (env, uid, { prefs, muted }) =>
  mergeServerDoc(env, ["push_subs", uid], {
    ...(prefs ? { prefs: sanitizePrefs(prefs) } : {}),
    ...(muted ? { muted: sanitizeMuted(muted) } : {}),
  });

const PREF_FOR = { message: "message", call: "call", missed: "call", reminder: "reminder", hook: "message" };

// uid の全端末へ送る。kind: message | call | missed | reminder | hook | test
export const sendToUser = async (env, uid, payload, { kind = "message", chatId, ttl = 60, urgency = "normal", topic } = {}) => {
  const doc = await getServerDoc(env, "push_subs", uid);
  const entries = Object.entries(doc?.subs || {});
  if (!entries.length) return { sent: 0, total: 0, skipped: "no-subscription" };
  const prefs = sanitizePrefs(doc.prefs || {});
  const prefName = PREF_FOR[kind];
  if (prefName && prefs[prefName] === false) return { sent: 0, total: entries.length, skipped: "disabled" };
  if ((kind === "message" || kind === "hook") && chatId && (doc.muted || []).includes(chatId)) return { sent: 0, total: entries.length, skipped: "muted" };

  const body = (kind === "message" || kind === "hook") && !prefs.preview ? "新着メッセージがあります" : payload.body;
  const data = { ...payload, kind, body: clean(body, 300), title: clean(payload.title, 80), ts: Date.now() };

  const dead = [];
  const results = await Promise.all(entries.map(async ([key, sub]) => {
    try {
      const r = await sendWebPush(env, sub, data, { ttl, urgency, topic });
      if (r.gone) dead.push(key);
      return r.ok;
    } catch { return false; }
  }));
  if (dead.length) {
    await commit(env, [{
      update: { name: serverDocName(env, "push_subs", uid), fields: {} },
      updateMask: { fieldPaths: dead.map((k) => fieldPath("subs", k)) },
    }]).catch(() => {});
  }
  return { sent: results.filter(Boolean).length, total: entries.length };
};

// 同じ出来事（メッセージ/着信）に対して二重に送らないための「早い者勝ち」。
// 完全な排他ではないが、連打・再送による通知スパムを実用上防げる。
export const claimOnce = async (env, scope, value) => {
  const cur = await getServerDoc(env, "push_state", scope);
  if (cur?.last === value) return false;
  await mergeServerDoc(env, ["push_state", scope], { last: value, at: new Date() });
  return true;
};

// 複数ユーザーへ送る（20件ずつ並列）。送れた端末の総数を返す
export const fanOut = async (env, ids, payload, opts) => {
  let sent = 0;
  for (let i = 0; i < ids.length; i += 20) {
    const rs = await Promise.all(ids.slice(i, i + 20).map((id) => sendToUser(env, id, payload, opts).catch(() => ({ sent: 0 }))));
    sent += rs.reduce((n, r) => n + (r.sent || 0), 0);
  }
  return sent;
};
