// PAY.JP v2 Checkout（外部リンク型決済）
// env: PAYJP_SECRET_KEY, PAYJP_WEBHOOK_TOKEN(任意。ダッシュボードの「発信元トークン」)
// ※ 認証方式・パスは PAY.JP v2 ドキュメント準拠で実装しています。ご自身のキーで動作確認してください。
import { fetchJson } from "../util.js";

const API = "https://api.pay.jp/v2";
const hdr = (env) => ({ authorization: `Bearer ${env.PAYJP_SECRET_KEY}`, "content-type": "application/json" });

export default {
  id: "payjp",
  name: "PAY.JP",
  desc: "クレジットカード（PAY.JP Checkout）",
  methods: () => ["card"],
  enabled: (env) => !!env.PAYJP_SECRET_KEY,
  async create(env, { ref, pack, origin }) {
    const s = await fetchJson(`${API}/checkout/sessions`, {
      method: "POST", headers: hdr(env),
      body: JSON.stringify({
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency: "jpy", unit_amount: pack.yen, product_data: { name: `コイン ${pack.coins}枚` } } }],
        success_url: `${origin}/?pay=return&ref=${ref}`,
        cancel_url: `${origin}/?pay=cancel&ref=${ref}`,
        metadata: { ref },
      }),
    }, "PAY.JP");
    return { url: s.url, providerId: s.id };
  },
  async check(env, payment) {
    const s = await fetchJson(`${API}/checkout/sessions/${payment.providerId}`, { headers: hdr(env) }, "PAY.JP");
    if (s.status === "complete") return "paid";
    if (s.status === "expired") return "failed";
    return "pending";
  },
  verifyWebhook: (env, request) => !env.PAYJP_WEBHOOK_TOKEN || request.headers.get("x-payjp-webhook-token") === env.PAYJP_WEBHOOK_TOKEN,
  refFromWebhook: (body) => body?.data?.metadata?.ref,
};
