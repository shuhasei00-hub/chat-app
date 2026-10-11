// POST /api/push/prefs  { prefs, muted } — 通知設定とミュート中トークをサーバーにも反映
import { requireUser } from "../../_lib/auth.js";
import { savePrefs } from "../../_lib/push.js";
import { json } from "../../_lib/util.js";

export const onRequestPost = async ({ env, request }) => {
  try {
    const uid = await requireUser(env, request);
    const body = await request.json().catch(() => ({}));
    await savePrefs(env, uid, { prefs: body.prefs, muted: body.muted });
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message || "error" }, e.status || 500);
  }
};
