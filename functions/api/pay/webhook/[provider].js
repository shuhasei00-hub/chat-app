// POST /api/pay/webhook/{stripe|komoju|univapay|fincode}  （fincode と fincode_direct は共通で /fincode を登録）
// Webhook は「確認のきっかけ」としてだけ使い、入金可否は必ず事業者APIへ問い合わせて判断します
// （署名偽装・リプレイがあっても二重入金/不正入金になりません）。
import { confirmPayment } from "../../../_lib/pay.js";
import { PROVIDERS } from "../../../_lib/providers/index.js";
import { json } from "../../../_lib/util.js";

export const onRequestPost = async ({ env, request, params }) => {
  const provider = PROVIDERS[params.provider];
  if (!provider) return json({ error: "unknown provider" }, 404);
  if (provider.verifyWebhook && !provider.verifyWebhook(env, request)) return json({ error: "invalid token" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const ref = provider.refFromWebhook?.(body);
  if (!ref || !/^[a-f0-9]{32}$/.test(ref)) return json({ ok: true, ignored: true, receive: "0" });
  try {
    const r = await confirmPayment(env, ref, null);
    return json({ ok: true, status: r.status, receive: "0" }); // receive:"0" は fincode への「受信成功」応答
  } catch (e) {
    return json({ error: e.message }, e.status === 404 ? 200 : 500); // 500 → 事業者が再送してくれる
  }
};
