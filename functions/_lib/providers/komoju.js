// KOMOJU — コンビニ各社 / Pay-easy / 銀行振込 / PayPay / カード など
// env: KOMOJU_SECRET_KEY, KOMOJU_PAYMENT_TYPES(任意, 既定 "konbini,credit_card,pay_easy,bank_transfer,paypay")
import { basic, csvEnv, fetchJson } from "../util.js";

const API = "https://komoju.com/api/v1";
const DEFAULT = "konbini,credit_card,pay_easy,bank_transfer,paypay";

export default {
  id: "komoju",
  name: "KOMOJU",
  desc: "コンビニ各社・Pay-easy・銀行振込・PayPay・カード",
  methods: (env) => csvEnv(env.KOMOJU_PAYMENT_TYPES, DEFAULT),
  enabled: (env) => !!env.KOMOJU_SECRET_KEY,
  async create(env, { ref, pack, origin }) {
    const s = await fetchJson(`${API}/sessions`, {
      method: "POST",
      headers: { authorization: basic(env.KOMOJU_SECRET_KEY), "content-type": "application/json" },
      body: JSON.stringify({
        amount: pack.yen, currency: "JPY", default_locale: "ja",
        return_url: `${origin}/?pay=return&ref=${ref}`,
        payment_types: csvEnv(env.KOMOJU_PAYMENT_TYPES, DEFAULT),
        payment_data: { external_order_num: ref },
        metadata: { ref },
      }),
    }, "KOMOJU");
    return { url: s.session_url, providerId: s.id };
  },
  async check(env, payment) {
    const s = await fetchJson(`${API}/sessions/${payment.providerId}`, { headers: { authorization: basic(env.KOMOJU_SECRET_KEY) } }, "KOMOJU");
    const st = s.payment?.status;
    if (st === "captured" && Number(s.payment.amount) === payment.yen) return "paid";
    if (s.status === "expired" || ["expired", "cancelled", "failed"].includes(st)) return "failed";
    return "pending"; // コンビニは authorized(支払い待ち) → captured(入金済み)
  },
  refFromWebhook: (body) => body?.data?.external_order_num || body?.data?.payment_data?.external_order_num || body?.data?.metadata?.ref,
};
