// Square Checkout API（決済リンク）
// env: SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENV("production" か "sandbox"。既定 sandbox)
import { fetchJson } from "../../util.js";

const base = (env) => (env.SQUARE_ENV === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com");
const hdr = (env) => ({ authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "content-type": "application/json", "square-version": "2025-01-23" });

export default {
  id: "square",
  name: "Square",
  desc: "クレジットカード・Apple Pay / Google Pay",
  methods: () => ["card"],
  enabled: (env) => !!(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID),
  async create(env, { ref, pack, origin }) {
    const d = await fetchJson(`${base(env)}/v2/online-checkout/payment-links`, {
      method: "POST", headers: hdr(env),
      body: JSON.stringify({
        idempotency_key: ref,
        order: {
          location_id: env.SQUARE_LOCATION_ID, reference_id: ref,
          line_items: [{ name: `コイン ${pack.coins}枚`, quantity: "1", base_price_money: { amount: pack.yen, currency: "JPY" } }],
        },
        checkout_options: { redirect_url: `${origin}/?pay=return&ref=${ref}`, ask_for_shipping_address: false },
      }),
    }, "Square");
    return { url: d.payment_link.url, providerId: d.payment_link.order_id };
  },
  async check(env, payment) {
    const d = await fetchJson(`${base(env)}/v2/orders/${payment.providerId}`, { headers: hdr(env) }, "Square");
    const o = d.order || {};
    if (o.reference_id !== payment.ref) return { status: "pending" };
    const paidUp = (o.tenders || []).length > 0 && Number(o.net_amount_due_money?.amount ?? 1) === 0;
    if ((o.state === "COMPLETED" || paidUp) && Number(o.total_money?.amount) === payment.yen) return { status: "paid" };
    if (o.state === "CANCELED") return { status: "failed" };
    return { status: "pending" };
  },
  refFromWebhook: () => null, // Squareは return 時の確認ボタン/自動確認で確定
};
