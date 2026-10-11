// POST /api/push/subscribe  { subscription, prefs, muted, ua }  /  { action:"unsubscribe", endpoint }
import { requireUser } from "../../_lib/auth.js";
import { pushConfigured, removeSubscription, saveSubscription } from "../../_lib/push.js";
import { HttpError, json } from "../../_lib/util.js";

export const onRequestPost = async ({ env, request }) => {
  try {
    const uid = await requireUser(env, request);
    const body = await request.json().catch(() => ({}));
    if (body.action === "unsubscribe") {
      await removeSubscription(env, uid, body.endpoint);
      return json({ ok: true });
    }
    if (!pushConfigured(env)) throw new HttpError(503, "サーバーにVAPID鍵が設定されていません（README参照）");
    await saveSubscription(env, uid, body.subscription, { prefs: body.prefs, muted: body.muted, ua: body.ua });
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message || "error" }, e.status || 500);
  }
};
