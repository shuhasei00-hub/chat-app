// POST /api/reminders  — リマインダー（指定時刻にプッシュ通知）。実行は Worker の Cron（worker/index.js の scheduled）
//   { action:"create", text, dueAt(ms), url? } → { id }
//   { action:"list" }                           → { reminders:[{id,text,dueAt}] }
//   { action:"delete", id }
import { requireUser } from "../_lib/auth.js";
import { deleteServerDoc, getServerDoc, queryServer, setServerDoc } from "../_lib/firestore.js";
import { HttpError, json } from "../_lib/util.js";

const MAX_PENDING = 50;

export const onRequestPost = async ({ env, request }) => {
  try {
    const uid = await requireUser(env, request);
    const body = await request.json().catch(() => ({}));

    if (body.action === "list") {
      const rs = await queryServer(env, "reminders", { field: "uid", value: uid, limit: 100 });
      return json({ reminders: rs.map((r) => ({ id: r.__id, text: r.text, dueAt: r.dueAt })).sort((a, b) => a.dueAt - b.dueAt) });
    }

    if (body.action === "create") {
      const text = String(body.text || "").trim().slice(0, 200);
      const dueAt = Math.floor(Number(body.dueAt));
      if (!text) throw new HttpError(400, "内容を入力してください");
      if (!Number.isFinite(dueAt) || dueAt < Date.now() - 60 * 1000 || dueAt > Date.now() + 366 * 86400 * 1000) {
        throw new HttpError(400, "日時が正しくありません（過去、または1年以上先）");
      }
      const mine = await queryServer(env, "reminders", { field: "uid", value: uid, limit: MAX_PENDING + 1 });
      if (mine.length >= MAX_PENDING) throw new HttpError(400, `登録できるリマインダーは${MAX_PENDING}件までです`);
      const id = [...crypto.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const url = typeof body.url === "string" && body.url.startsWith("/") && !body.url.startsWith("//") ? body.url.slice(0, 200) : "/?open=reminders";
      await setServerDoc(env, ["reminders", id], { uid, text, dueAt, url, createdAt: new Date() });
      return json({ id });
    }

    if (body.action === "delete") {
      const id = String(body.id || "");
      if (!/^[a-f0-9]{20}$/.test(id)) throw new HttpError(400, "id が不正です");
      const r = await getServerDoc(env, "reminders", id);
      if (r && r.uid === uid) await deleteServerDoc(env, "reminders", id);
      return json({ ok: true });
    }

    throw new HttpError(400, "action が不正です");
  } catch (e) {
    return json({ error: e.message || "error" }, e.status || 500);
  }
};
