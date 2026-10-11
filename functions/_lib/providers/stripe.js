// Stripe Checkout — カード / コンビニ(konbini) / PayPay など
// env: STRIPE_SECRET_KEY, STRIPE_METHODS(任意, 既定 "card,konbini"。PayPayを有効化したら "card,konbini,paypay")
import { basic, csvEnv, fetchJson, form } from "../util.js";

const API = "https://api.stripe.com/v1";

export default {
  id: "stripe",
  name: "Stripe",
  desc: "クレジットカード・コンビニ払い・PayPay",
  methods: (env) => csvEnv(env.STRIPE_METHODS, "card,konbini"),
  enabled: (env) => !!env.STRIPE_SECRET_KEY,
  async create(env, { ref, pack, origin }) {
    const types = csvEnv(env.STRIPE_METHODS, "card,konbini");
    const body = {
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "jpy", unit_amount: pack.yen, product_data: { name: `コイン ${pack.coins.toLocaleString()}枚` } } }],
      success_url: `${origin}/?pay=return&ref=${ref}`,
      cancel_url: `${origin}/?pay=cancel&ref=${ref}`,
      client_reference_id: ref,
      metadata: { ref },
      locale: "ja",
      payment_method_types: types,
    };
    if (types.includes("konbini")) body.payment_method_options = { konbini: { expires_after_days: 3 } };
    const s = await fetchJson(`${API}/checkout/sessions`, {
      method: "POST",
      headers: { authorization: basic(env.STRIPE_SECRET_KEY), "content-type": "application/x-www-form-urlencoded", "idempotency-key": ref },
      body: form(body),
    }, "Stripe");
    return { url: s.url, providerId: s.id };
  },
  async check(env, payment) {
    const s = await fetchJson(`${API}/checkout/sessions/${payment.providerId}`, { headers: { authorization: basic(env.STRIPE_SECRET_KEY) } }, "Stripe");
    if (s.payment_status === "paid" && s.amount_total === payment.yen && s.currency === "jpy") return "paid";
    if (s.status === "expired") return "failed";
    return "pending"; // コンビニは店頭で支払うまで unpaid
  },
  refFromWebhook: (body) => body?.data?.object?.client_reference_id || body?.data?.object?.metadata?.ref,
};
