// POST /api/push/notify  { kind, chatId, sessionId? }   (Authorization: Bearer <Firebase ID token>)
//   kind = "message" : 直前に送ったメッセージを、トークの他の参加者へ通知
//   kind = "call"    : 発信中（ringing / group）の通話を、相手へ「着信」として通知（強い振動・タップ待ち）
//   kind = "missed"  : 応答前に発信者が切った → 相手へ「不在着信」（着信通知を置き換え）
//   kind = "test"    : 自分の端末へテスト通知
// クライアントが送る値は信用せず、Firestore 上の実データ（chats/{chatId}）で検証してから送ります。
import { requireUser } from "../../_lib/auth.js";
import { getDoc, getServerDoc, mergeServerDoc } from "../../_lib/firestore.js";
import { claimOnce, fanOut, pushConfigured, sendToUser } from "../../_lib/push.js";
import { HttpError, json } from "../../_lib/util.js";

const MAX_RECIPIENTS = 100;
const CALL_VIBRATE = [600, 300, 600, 300, 600, 300, 600, 300, 600, 300, 600];
const MSG_VIBRATE = [200, 100, 200];

const loadChat = async (env, uid, chatId) => {
  if (!chatId || typeof chatId !== "string" || chatId.includes("/")) throw new HttpError(400, "chatId が不正です");
  const chat = await getDoc(env, "chats", chatId);
  if (!chat || !(chat.participants || []).includes(uid)) throw new HttpError(403, "このトークの参加者ではありません");
  return chat;
};

// ブロックしている相手には送らない。名前の取得も兼ねる
const recipientsOf = async (env, chat, uid) => {
  const ids = (chat.participants || []).filter((p) => p !== uid).slice(0, MAX_RECIPIENTS);
  const docs = await Promise.all(ids.map((id) => getDoc(env, "users", id).catch(() => null)));
  return ids.filter((_, i) => !(docs[i]?.blockedUsers || []).includes(uid));
};

export const onRequestPost = async ({ env, request }) => {
  try {
    const uid = await requireUser(env, request);
    if (!pushConfigured(env)) return json({ ok: false, skipped: "not-configured" });
    const body = await request.json().catch(() => ({}));
    const kind = body.kind;

    if (kind === "test") {
      const r = await sendToUser(env, uid, {
        type: "message", title: "テスト通知", body: "通知は正常に届いています 🎉", tag: "test", url: "/", vibrate: MSG_VIBRATE, force: true,
      }, { kind: "test", ttl: 120, urgency: "high" });
      return json({ ok: r.sent > 0, ...r });
    }

    const chat = await loadChat(env, uid, body.chatId);
    const me = await getDoc(env, "users", uid).catch(() => null);
    const myName = me?.name || "メッセージ";
    const targets = await recipientsOf(env, chat, uid);
    const url = `/?chat=${encodeURIComponent(body.chatId)}`;

    if (kind === "message") {
      const lm = chat.lastMessage;
      const stamp = lm?.createdAt;
      if (!lm || lm.senderId !== uid || !stamp) throw new HttpError(409, "通知対象のメッセージがありません");
      if (Math.abs(Date.now() - Date.parse(stamp)) > 5 * 60 * 1000) throw new HttpError(409, "古いメッセージです");
      if (!(await claimOnce(env, `msg_${body.chatId}`, String(stamp)))) return json({ ok: true, skipped: "duplicate" });
      const text = String(lm.content ?? "").trim() || "メッセージが届きました";
      const sent = await fanOut(env, targets, {
        type: "message",
        title: chat.isGroup ? chat.name || "グループ" : myName,
        body: chat.isGroup ? `${myName}: ${text}` : text,
        tag: `chat-${body.chatId}`, url, vibrate: MSG_VIBRATE, renotify: true,
      }, { kind: "message", chatId: body.chatId, ttl: 3 * 24 * 3600, urgency: "high" });
      return json({ ok: true, sent });
    }

    if (kind === "call") {
      const cs = chat.callStatus;
      if (!cs || cs.callerId !== uid || !["ringing", "group"].includes(cs.status)) throw new HttpError(409, "発信中の通話がありません");
      if (Date.now() - Number(cs.timestamp || 0) > 90 * 1000) throw new HttpError(409, "古い発信です");
      if (!(await claimOnce(env, `call_${body.chatId}`, String(cs.sessionId)))) return json({ ok: true, skipped: "duplicate" });
      const video = cs.callType !== "audio";
      const group = cs.status === "group";
      await mergeServerDoc(env, ["push_calls", body.chatId], { sessionId: String(cs.sessionId), callerId: uid, state: cs.status, at: Date.now() });
      const sent = await fanOut(env, targets, {
        type: "call",
        title: group ? `${chat.name || "グループ"} で通話が始まりました` : `${myName} さんから${video ? "ビデオ" : "音声"}通話`,
        body: group ? "タップして参加" : "タップして応答",
        tag: `call-${body.chatId}`, url: `${url}&call=1`,
        requireInteraction: true, renotify: true, vibrate: CALL_VIBRATE,
        actions: [{ action: "open", title: group ? "参加する" : "応答する" }],
      }, { kind: "call", chatId: body.chatId, ttl: group ? 120 : 45, urgency: "high" });
      return json({ ok: true, sent });
    }

    if (kind === "missed") {
      const st = await getServerDoc(env, "push_calls", body.chatId);
      if (!st || st.callerId !== uid || st.state !== "ringing" || st.sessionId !== String(body.sessionId || "")) {
        throw new HttpError(409, "対象の発信がありません");
      }
      await mergeServerDoc(env, ["push_calls", body.chatId], { state: "missed" });
      const sent = await fanOut(env, targets, {
        type: "missed", title: "不在着信", body: `${myName} さんからの着信`,
        tag: `call-${body.chatId}`, url, renotify: true, vibrate: MSG_VIBRATE,
      }, { kind: "missed", chatId: body.chatId, ttl: 6 * 3600, urgency: "high" });
      return json({ ok: true, sent });
    }

    throw new HttpError(400, "kind が不正です");
  } catch (e) {
    return json({ error: e.message || "error" }, e.status || 500);
  }
};
