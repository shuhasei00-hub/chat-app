// fincode byGMO — コンビニ払い（全国のコンビニ共通のバーコード方式）
// 公式OpenAPI(fincode API 1.4.0)で確認した仕様に基づいて実装しています。
//
//  ① fincode      … 決済ページ型。POST /v1/sessions で決済URLを発行し、利用者を fincode の支払い画面へ。
//  ② fincode_direct … 自画面型。POST /v1/payments(登録) → PUT /v1/payments/{id}(実行) でバーコード画像を取得し、アプリ内に表示。
//                    ※ 自画面でバーコードを表示するには、fincode/コンビニ事業者の追加審査・レギュレーション遵守が必要です。
//
// 入金判定: GET /v1/payments/{id}?pay_type=Konbini の status が CAPTURED（金額も照合）。Webhookは「確認のきっかけ」だけに使います。
// env: FINCODE_SECRET_KEY（シークレットキー）, FINCODE_ENV（"test"=既定 / "live"=本番）, FINCODE_WEBHOOK_SIGNATURE（任意。Webhook設定の署名）
import { HttpError } from "../util.js";

const BASE = { test: "https://api.test.fincode.jp", live: "https://api.fincode.jp" };
const base = (env) => (env.FINCODE_ENV === "live" ? BASE.live : BASE.test);
const hdr = (env) => ({ authorization: `Bearer ${env.FINCODE_SECRET_KEY}`, "content-type": "application/json; charset=utf-8" });
const TERM_DAYS = "3"; // 支払い期限日数（0〜14）
const FAILED = ["CANCELED", "EXPIRED", "FAILED"];
const KONBINI = { "00010": "セブン-イレブン", "00020": "ローソン", "00030": "ファミリーマート", "00080": "ミニストップ", "00760": "セイコーマート" };
export const KONBINI_NAMES = KONBINI;

// fincode のIDは30文字まで。ref(32桁)の先頭30文字をオーダーIDにする（client_field_1 に ref 全体も入れる）
export const orderIdOf = (ref) => String(ref).slice(0, 30);

// "yyyy/MM/dd HH:mm:ss.SSS"（日本時間）→ ミリ秒
export const parseJst = (s) => {
  if (!s) return 0;
  const t = Date.parse(String(s).replace(/\//g, "-").replace(" ", "T") + "+09:00");
  return Number.isFinite(t) ? t : 0;
};

const call = async (env, method, path, body) => {
  const res = await fetch(base(env) + path, { method, headers: hdr(env), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const e = data?.errors?.[0];
    const err = new HttpError(res.status === 404 ? 404 : 502, `fincode: ${res.status} ${e?.error_code || ""} ${e?.error_message || text.slice(0, 200)}`.trim());
    err.upstream = res.status;
    throw err;
  }
  return data;
};

// 利用者の端末情報（バーコード表示用）。クライアントが送ってきた値を検証して使う
const device = (d) => {
  const s = (v, max) => String(v ?? "").slice(0, max);
  const num = (v, re) => (re.test(String(v)) ? String(v) : "");
  const out = {
    device_name: s(d?.device_name, 20), win_width: num(d?.win_width, /^\d{1,5}$/), win_height: num(d?.win_height, /^\d{1,5}$/),
    pixel_ratio: num(d?.pixel_ratio, /^\d{1,2}\.\d{2}$/), win_size_type: ["1", "2"].includes(String(d?.win_size_type)) ? String(d.win_size_type) : "",
  };
  if (Object.values(out).some((v) => !v)) throw new HttpError(400, "端末情報が正しくありません");
  return out;
};

const status = async (env, payment) => {
  let p;
  try {
    p = await call(env, "GET", `/v1/payments/${encodeURIComponent(payment.providerId)}?pay_type=Konbini`);
  } catch (e) {
    if (e.upstream === 404) return { status: "pending" }; // 決済ページ型: 利用者がまだ支払い方法を確定していない
    throw e;
  }
  const total = Number(p.total_amount ?? p.amount);
  if (p.status === "CAPTURED" && total === payment.yen) return { status: "paid" };
  if (FAILED.includes(p.status)) return { status: "failed" };
  return { status: "pending" };
};

const common = {
  methods: () => ["konbini"],
  enabled: (env) => !!env.FINCODE_SECRET_KEY,
  check: status,
  // Webhook(payments.konbini.*)の署名ヘッダ。FINCODE_WEBHOOK_SIGNATURE を設定した場合のみ検証
  verifyWebhook: (env, request) => !env.FINCODE_WEBHOOK_SIGNATURE || request.headers.get("fincode-signature") === env.FINCODE_WEBHOOK_SIGNATURE,
  refFromWebhook: (b) => b?.client_field_1,
};

// ① 決済ページ型
export const fincode = {
  ...common,
  id: "fincode",
  name: "fincode（決済ページ）",
  desc: "コンビニ払い（セブン・ローソン・ファミマ・ミニストップ・セイコーマート）。fincodeの支払い画面でバーコードを表示",
  async create(env, { ref, pack, origin }) {
    const s = await call(env, "POST", "/v1/sessions", {
      transaction: { pay_type: ["Konbini"], amount: String(pack.yen), order_id: orderIdOf(ref), client_field_1: ref },
      konbini: { payment_term_day: TERM_DAYS, konbini_reception_mail_send_flag: "0" },
      // 決済後、fincode は success_url / cancel_url に POST でリダイレクトする → POSTを受けてアプリへ戻す専用ルート
      success_url: `${origin}/api/pay/return?ref=${ref}&r=success`,
      cancel_url: `${origin}/api/pay/return?ref=${ref}&r=cancel`,
      shop_service_name: "コインチャージ",
    });
    const url = s.link_url;
    if (!url) throw new HttpError(502, "fincode: 決済URLを取得できませんでした");
    return { url, providerId: orderIdOf(ref), extra: { voucher: { kind: "link", url, expiresAt: parseJst(s.expire), stores: [] } } };
  },
};

// ② 自画面型（アプリ内にバーコードを表示）
export const fincodeDirect = {
  ...common,
  id: "fincode_direct",
  name: "fincode（アプリ内バーコード）",
  desc: "コンビニ払い。バーコードをこのアプリ内に表示（全国の主要コンビニ共通）",
  needsDevice: true,
  async create(env, { ref, pack, customer }) {
    const dev = device(customer?.device);
    const oid = orderIdOf(ref);
    const reg = await call(env, "POST", "/v1/payments", { id: oid, pay_type: "Konbini", amount: String(pack.yen), client_field_1: ref });
    const ex = await call(env, "PUT", `/v1/payments/${encodeURIComponent(reg.id || oid)}`, {
      pay_type: "Konbini", access_id: reg.access_id, payment_term_day: TERM_DAYS, ...dev,
    });
    if (ex.result && ex.result !== "000") throw new HttpError(502, `fincode: バーコードを発行できませんでした (結果コード ${ex.result})`);
    if (!ex.barcode) throw new HttpError(502, "fincode: バーコード画像を取得できませんでした");
    return {
      url: "", providerId: reg.id || oid,
      extra: { voucher: { kind: "barcode", url: "", expiresAt: parseJst(ex.payment_term), stores: [], barcode: { data: ex.barcode, format: ex.barcode_format || "png", width: Number(ex.barcode_width) || 0, height: Number(ex.barcode_height) || 0 } } },
    };
  },
};
