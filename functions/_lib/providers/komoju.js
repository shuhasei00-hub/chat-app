// KOMOJU — コンビニ払い（全国のコンビニ）/ Pay-easy
// 流れ: 決済ページでコンビニ等を選択 → 支払い票/払込番号を発行 → 店頭で支払い → webhook → コイン加算
// env: KOMOJU_SECRET_KEY, KOMOJU_PAYMENT_TYPES(任意。既定 "konbini,pay_easy")
import { basic, csvEnv, fetchJson } from "../util.js";

const API = "https://komoju.com/api/v1";
const DEFAULT = "konbini,pay_easy";
const STORE_NAMES = {
  "family-mart": "ファミリーマート", familymart: "ファミリーマート", lawson: "ローソン", ministop: "ミニストップ",
  seven_eleven: "セブン-イレブン", "seven-eleven": "セブン-イレブン", seicomart: "セイコーマート", daily_yamazaki: "デイリーヤマザキ",
};

// payment_details から支払い票情報を取り出す（項目が無い場合は決済ページへのリンクだけ表示）
const voucherFrom = (payment) => {
  const d = payment?.payment_details;
  if (!d) return null;
  const store = d.convenience_store || d.store || "";
  const code = d.receipt || d.payment_code || "";
  return {
    url: d.instructions_url || "",
    expiresAt: payment.expired_at ? Date.parse(payment.expired_at) || 0 : 0,
    stores: code ? [{ name: STORE_NAMES[store] || store || "コンビニ", paymentCode: String(code), confirmationNumber: String(d.confirmation_code || "") }] : [],
  };
};

export default {
  id: "komoju",
  name: "KOMOJU",
  desc: "コンビニ払い（セブン・ファミマ・ローソンほか）・Pay-easy",
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
    if (st === "captured" && Number(s.payment.amount) === payment.yen) return { status: "paid" };
    if (s.status === "expired" || ["expired", "cancelled", "failed"].includes(st)) return { status: "failed" };
    return { status: "pending", voucher: voucherFrom(s.payment) }; // コンビニは authorized(支払い待ち) → captured(入金済み)
  },
  refFromWebhook: (body) => body?.data?.external_order_num || body?.data?.payment_data?.external_order_num || body?.data?.metadata?.ref,
};
