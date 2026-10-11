// POST /api/pay/checkout  { provider, packId }  (Authorization: Bearer <Firebase ID token>)
import { requireUser } from "../../_lib/auth.js";
import { createDoc } from "../../_lib/firestore.js";
import { findPack } from "../../_lib/packs.js";
import { PROVIDERS } from "../../_lib/providers/index.js";
import { HttpError, appOrigin, json } from "../../_lib/util.js";

export const onRequestPost = async ({ env, request }) => {
  try {
    const uid = await requireUser(env, request);
    const body = await request.json().catch(() => ({}));
    const provider = PROVIDERS[body.provider];
    const pack = findPack(body.packId);
    if (!provider || !provider.enabled(env)) throw new HttpError(400, "この決済方法は現在ご利用いただけません");
    if (!pack) throw new HttpError(400, "チャージ額が正しくありません");

    const ref = crypto.randomUUID().replace(/-/g, "");
    const { url, providerId, extra } = await provider.create(env, { ref, pack, origin: appOrigin(env, request), customer: body.customer });
    await createDoc(env, ["payments", ref], {
      uid, provider: provider.id, providerId, packId: pack.id, yen: pack.yen, coins: pack.coins,
      status: "pending", url, ...(extra || {}), createdAt: new Date(),
    });
    return json({ ref, url, direct: !url });
  } catch (e) {
    return json({ error: e.message || "error" }, e.status || 500);
  }
};
