// POST /api/hooks/{token} — 外部サイト/サービスからトークへメッセージを投稿（Incoming Webhook）
//   JSON  : { "text": "本文", "title": "任意の見出し", "username": "表示名" }   ※ Slack形式 {text} / Discord形式 {content} も可
//   Form  : text=本文   /   Plain text : 本文だけ
// 認証は URL 内のトークのみ（URLは秘密にしてください。漏れたら設定画面で削除）。
import { commit, docName, fieldPath, getDoc, getServerDoc, mergeServerDoc, toFields } from "../../_lib/firestore.js";
import { fanOut } from "../../_lib/push.js";
import { HttpError, json } from "../../_lib/util.js";

const MAX_TEXT = 2000;

const readBody = async (request) => {
  const type = request.headers.get("content-type") || "";
  const raw = (await request.text()).slice(0, 20000);
  if (type.includes("json")) {
    let d;
    try { d = JSON.parse(raw); } catch { throw new HttpError(400, "JSONが不正です"); }
    return d && typeof d === "object" ? d : { text: String(d) };
  }
  if (type.includes("x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(raw));
  return { text: raw };
};

export const onRequestPost = async ({ env, request, params }) => {
  try {
    const token = String(params?.token || "");
    if (!/^[a-f0-9]{32}$/.test(token)) throw new HttpError(404, "not found");
    const hook = await getServerDoc(env, "hooks", token);
    if (!hook) throw new HttpError(404, "not found");

    // 連投防止（1秒に1回）
    const now = Date.now();
    const st = await getServerDoc(env, "push_state", `hook_${token}`);
    if (st?.last && now - Number(st.last) < 1000) throw new HttpError(429, "リクエストが多すぎます（1秒に1回まで）");
    await mergeServerDoc(env, ["push_state", `hook_${token}`], { last: now });

    const d = await readBody(request);
    let text = d.text ?? d.content ?? d.message ?? d.body;
    if ((text === undefined || text === null) && !d.title) text = "📨 " + JSON.stringify(d);
    text = String(text ?? "").trim();
    const title = String(d.title || "").trim().slice(0, 80);
    const link = /^https?:\/\//i.test(String(d.url || "")) ? String(d.url).slice(0, 500) : "";
    if (!text && !title) throw new HttpError(400, "text が空です");
    const content = [title && `【${title}】`, text, link].filter(Boolean).join("\n").slice(0, MAX_TEXT);

    const chat = await getDoc(env, "chats", hook.chatId);
    if (!chat) throw new HttpError(404, "トークが見つかりません");
    const participants = chat.participants || [];
    const senderName = String(d.username || hook.name || "外部連携").slice(0, 30);
    const senderId = `hook_${token.slice(0, 8)}`;
    const msgId = [...crypto.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const at = new Date();

    await commit(env, [
      {
        update: {
          name: docName(env, "chats", hook.chatId, "messages", msgId),
          fields: toFields({ senderId, senderName, isBot: true, content, type: "text", createdAt: at, readBy: [] }),
        },
        currentDocument: { exists: false },
      },
      {
        update: {
          name: docName(env, "chats", hook.chatId),
          fields: toFields({ lastMessage: { content: content.slice(0, 200), senderId, type: "text", createdAt: at }, updatedAt: at }),
        },
        updateMask: { fieldPaths: ["lastMessage", "updatedAt"] },
        updateTransforms: participants.map((p) => ({ fieldPath: fieldPath("unreadCounts", p), increment: { integerValue: "1" } })),
        currentDocument: { exists: true },
      },
    ]);

    await fanOut(env, participants, {
      type: "message", title: chat.isGroup ? `${chat.name || "グループ"}` : senderName,
      body: chat.isGroup ? `${senderName}: ${content}` : content,
      tag: `chat-${hook.chatId}`, url: `/?chat=${encodeURIComponent(hook.chatId)}`, vibrate: [200, 100, 200],
    }, { kind: "hook", chatId: hook.chatId, ttl: 3 * 24 * 3600, urgency: "high" }).catch(() => 0);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message || "error" }, e.status || 500);
  }
};
