// Stripe Checkout — コンビニ払い(konbini)専用
// 流れ: Checkoutで氏名/メール入力 → 支払い票(ファミマ/ローソン/ミニストップ/セイコーマート)を発行
//       → 店頭で支払い → Stripeが入金を通知(webhook) → コイン加算
// env: STRIPE_SECRET_KEY（本番は sk_live_...、テストは sk_test_...）
import { basic, fetchJson, form } from "../util.js";

const API = "https://api.stripe.com/v1";
const STORE_NAMES = { familymart: "ファミリーマート", lawson: "ローソン", ministop: "ミニストップ", seicomart: "セイコーマート" };

// PaymentIntent の next_action から支払い票情報を取り出す
export const voucherFrom = (pi) => {
  const d = pi?.next_action?.konbini_display_details;
  if (!d) return null;
  const stores = Object.entries(d.stores || {}).map(([key, v]) => ({
    name: STORE_NAMES[key] || key,
    paymentCode: v?.payment_code || "",
    confirmationNumber: v?.confirmation_number || "",
  }));
  return { url: d.hosted_voucher_url || "", expiresAt: d.expires_at ? d.expires_at * 1000 : 0, stores };
};

export default {
  id: "stripe",
  name: "Stripe",
  desc: "コンビニ払い（ファミリーマート・ローソン・ミニストップ・セイコーマート）",
  methods: () => ["konbini"],
  enabled: (env) => !!env.STRIPE_SECRET_KEY,
  async create(env, { ref, pack, origin }) {
    const s = await fetchJson(`${API}/checkout/sessions`, {
      method: "POST",
      headers: { authorization: basic(env.STRIPE_SECRET_KEY), "content-type": "application/x-www-form-urlencoded", "idempotency-key": ref },
      body: form({
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency: "jpy", unit_amount: pack.yen, product_data: { name: `コイン ${pack.coins.toLocaleString()}枚` } } }],
        success_url: `${origin}/?pay=return&ref=${ref}`,
        cancel_url: `${origin}/?pay=cancel&ref=${ref}`,
        client_reference_id: ref,
        metadata: { ref },
        locale: "ja",
        payment_method_types: ["konbini"],
        payment_method_options: { konbini: { expires_after_days: 3 } }, // 支払い期限: 3日（1〜60日）
      }),
    }, "Stripe");
    return { url: s.url, providerId: s.id };
  },
  async check(env, payment) {
    const s = await fetchJson(`${API}/checkout/sessions/${payment.providerId}?expand[]=payment_intent`, { headers: { authorization: basic(env.STRIPE_SECRET_KEY) } }, "Stripe");
    if (s.payment_status === "paid" && s.amount_total === payment.yen && s.currency === "jpy") return { status: "paid" };
    if (s.status === "expired") return { status: "failed" };
    const pi = typeof s.payment_intent === "object" ? s.payment_intent : null;
    // 支払い票の期限切れ/失敗: PaymentIntent が requires_payment_method に戻る or canceled
    if (pi && ["canceled"].includes(pi.status)) return { status: "failed" };
    return { status: "pending", voucher: voucherFrom(pi) };
  },
  refFromWebhook: (body) => body?.data?.object?.client_reference_id || body?.data?.object?.metadata?.ref,
};
