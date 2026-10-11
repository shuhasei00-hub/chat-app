// POST /api/hooks/manage  — 外部サイト連携（Incoming Webhook）の作成・一覧・削除
//   { action:"create", chatId, name } → { token, url }
//   { action:"list" }                 → { hooks:[{token, chatId, name, createdAt}] }
//   { action:"delete", token }
import { requireUser } from "../../_lib/auth.js";
import { deleteServerDoc, getDoc, getServerDoc, queryServer, setServerDoc } from "../../_lib/firestore.js";
import { HttpError, appOrigin, json } from "../../_lib/util.js";

const MAX_HOOKS = 10;
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

export const onRequestPost = async ({ env, request }) => {
  try {
    const uid = await requireUser(env, request);
    const body = await request.json().catch(() => ({}));

    if (body.action === "list") {
      const hooks = await queryServer(env, "hooks", { field: "uid", value: uid, limit: 50 });
      return json({
        hooks: hooks.map((h) => ({ token: h.__id, chatId: h.chatId, name: h.name, createdAt: h.createdAt })),
        origin: appOrigin(env, request),
      });
    }

    if (body.action === "create") {
      const chatId = String(body.chatId || "");
      if (!chatId || chatId.includes("/")) throw new HttpError(400, "トークを選んでください");
      const chat = await getDoc(env, "chats", chatId);
      if (!chat || !(chat.participants || []).includes(uid)) throw new HttpError(403, "このトークの参加者ではありません");
      const mine = await queryServer(env, "hooks", { field: "uid", value: uid, limit: MAX_HOOKS + 1 });
      if (mine.length >= MAX_HOOKS) throw new HttpError(400, `連携は最大${MAX_HOOKS}件までです`);
      const name = String(body.name || "").trim().slice(0, 30) || "外部連携";
      const token = randomToken();
      await setServerDoc(env, ["hooks", token], { uid, chatId, name, createdAt: new Date() });
      return json({ token, url: `${appOrigin(env, request)}/api/hooks/${token}` });
    }

    if (body.action === "delete") {
      const token = String(body.token || "");
      if (!/^[a-f0-9]{32}$/.test(token)) throw new HttpError(400, "token が不正です");
      const h = await getServerDoc(env, "hooks", token);
      if (!h || h.uid !== uid) throw new HttpError(404, "見つかりません");
      await deleteServerDoc(env, "hooks", token);
      return json({ ok: true });
    }

    throw new HttpError(400, "action が不正です");
  } catch (e) {
    return json({ error: e.message || "error" }, e.status || 500);
  }
};
