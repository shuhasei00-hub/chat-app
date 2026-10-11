// UnivaPay — コンビニ払い（セブン・ファミマ・ローソン・ミニストップ・セイコーマート・デイリー・Pay-easy）
// 決済ページへ飛ばさず、サーバーから直接「支払い票」を発行します（氏名・メール・電話・店舗をアプリ側で入力）。
// 流れ: POST /tokens(コンビニ) → POST /charges → 状態 awaiting で支払い番号が metadata に入る → 店頭で支払い → successful
// env: UNIVAPAY_SECRET, UNIVAPAY_APP_TOKEN（ダッシュボードの「店舗のアプリトークン」と「シークレット」）
// ※ 公式ドキュメントで確認できた範囲で実装しています。テストモードで必ず動作確認してください。
import { HttpError, fetchJson } from "../util.js";

const API = "https://api.univapay.com";
export const STORES = {
  seven_eleven: "セブン-イレブン", family_mart: "ファミリーマート", lawson: "ローソン",
  mini_stop: "ミニストップ", seico_mart: "セイコーマート", daily_yamazaki: "デイリーヤマザキ", pay_easy: "Pay-easy(ATM/ネット銀行)",
};
const headers = (env) => ({ authorization: `Bearer ${env.UNIVAPAY_SECRET}.${env.UNIVAPAY_APP_TOKEN}`, "content-type": "application/json" });
const FAILED = ["failed", "error", "canceled", "cancelled", "expired"];

const voucherFrom = (charge, store) => {
  const m = charge?.metadata || {};
  const code = m.internal_convenience_payment_number;
  if (!code) return null;
  return {
    url: m.internal_convenience_payment_url || "", // セブン-イレブンのみ
    expiresAt: charge.capture_at ? Date.parse(charge.capture_at) || 0 : 0,
    stores: [{ name: STORES[store] || "コンビニ", paymentCode: String(code), confirmationNumber: store === "pay_easy" ? "58091" : "" }],
  };
};

export default {
  id: "univapay",
  name: "UnivaPay",
  desc: "コンビニ払い（セブン・ファミマ・ローソンほか）・Pay-easy　※氏名・メール・電話が必要",
  methods: () => ["konbini", "pay_easy"],
  needsCustomer: true,
  stores: STORES,
  enabled: (env) => !!(env.UNIVAPAY_SECRET && env.UNIVAPAY_APP_TOKEN),
  async create(env, { ref, pack, customer }) {
    const c = customer || {};
    const store = c.store;
    const phone = String(c.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "");
    if (!STORES[store]) throw new HttpError(400, "コンビニを選択してください");
    if (!c.name || String(c.name).length > 40) throw new HttpError(400, "氏名を入力してください");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email || "")) throw new HttpError(400, "メールアドレスが正しくありません");
    if (phone.length < 9 || phone.length > 11) throw new HttpError(400, "電話番号が正しくありません");
    const t = await fetchJson(`${API}/tokens`, {
      method: "POST", headers: headers(env),
      body: JSON.stringify({
        payment_type: "konbini", type: "one_time", email: c.email,
        data: { customer_name: c.name, phone_number: { country_code: "81", local_number: phone }, convenience_store: store, expiration_period: "P3D" },
      }),
    }, "UnivaPay");
    const ch = await fetchJson(`${API}/charges`, {
      method: "POST", headers: headers(env),
      body: JSON.stringify({ transaction_token_id: t.id, amount: pack.yen, currency: "jpy", merchant_transaction_id: ref, metadata: { ref } }),
    }, "UnivaPay");
    return { url: "", providerId: `${ch.store_id}/${ch.id}`, extra: { store } };
  },
  async check(env, payment) {
    const [storeId, id] = String(payment.providerId).split("/");
    const ch = await fetchJson(`${API}/stores/${storeId}/charges/${id}`, { headers: headers(env) }, "UnivaPay");
    if (ch.status === "successful" && Number(ch.charged_amount) === payment.yen) return { status: "paid" };
    if (FAILED.includes(ch.status)) return { status: "failed" };
    return { status: "pending", voucher: voucherFrom(ch, payment.store) };
  },
  // webhook(charge_updated / charge_finished)の本文は課金オブジェクトと同形。署名検証は行わず、必ずAPIで再確認します
  refFromWebhook: (b) => b?.merchant_transaction_id || b?.data?.merchant_transaction_id || b?.metadata?.ref || b?.data?.metadata?.ref,
};
