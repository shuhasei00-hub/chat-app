// PayPal Checkout (Orders v2, JPY)
// env: PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV("live" か "sandbox"。既定 sandbox)
import { basic, fetchJson } from "../../util.js";

const base = (env) => (env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

const token = async (env) => {
  const d = await fetchJson(`${base(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: basic(env.PAYPAL_CLIENT_ID, env.PAYPAL_SECRET), "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  }, "PayPal認証");
  return d.access_token;
};

const capturedOk = (order, yen) => {
  const cap = order.purchase_units?.[0]?.payments?.captures?.[0];
  return cap?.status === "COMPLETED" && Number(cap.amount?.value) === yen && cap.amount?.currency_code === "JPY";
};

export default {
  id: "paypal",
  name: "PayPal",
  desc: "PayPalアカウント・カード",
  methods: () => ["paypal", "card"],
  enabled: (env) => !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET),
  async create(env, { ref, pack, origin }) {
    const t = await token(env);
    const o = await fetchJson(`${base(env)}/v2/checkout/orders`, {
      method: "POST",
      headers: { authorization: `Bearer ${t}`, "content-type": "application/json", "paypal-request-id": ref },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ reference_id: ref, custom_id: ref, description: `コイン ${pack.coins}枚`, amount: { currency_code: "JPY", value: String(pack.yen) } }],
        payment_source: { paypal: { experience_context: {
          return_url: `${origin}/?pay=return&ref=${ref}`, cancel_url: `${origin}/?pay=cancel&ref=${ref}`,
          user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", locale: "ja-JP",
        } } },
      }),
    }, "PayPal");
    const link = (o.links || []).find((l) => l.rel === "payer-action") || (o.links || []).find((l) => l.rel === "approve");
    if (!link) throw new Error("PayPal: 支払いURLが取得できませんでした");
    return { url: link.href, providerId: o.id };
  },
  async check(env, payment) {
    const t = await token(env);
    const h = { authorization: `Bearer ${t}`, "content-type": "application/json" };
    let o = await fetchJson(`${base(env)}/v2/checkout/orders/${payment.providerId}`, { headers: h }, "PayPal");
    if (o.status === "APPROVED") {
      // お客様が承認済み → ここで売上確定（capture）。確定はサーバー側の一度きり
      o = await fetchJson(`${base(env)}/v2/checkout/orders/${payment.providerId}/capture`, { method: "POST", headers: { ...h, "paypal-request-id": `cap-${payment.providerId}` }, body: "{}" }, "PayPal capture");
    }
    if (o.status === "COMPLETED" && capturedOk(o, payment.yen)) return { status: "paid" };
    if (o.status === "VOIDED") return { status: "failed" };
    return { status: "pending" };
  },
  refFromWebhook: (body) => body?.resource?.custom_id || body?.resource?.purchase_units?.[0]?.custom_id,
};
