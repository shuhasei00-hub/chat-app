// fincode 連携の単体テスト（fetch をモック。公式OpenAPIで確認した形のレスポンスを使用）
import test from "node:test";
import assert from "node:assert/strict";
import { fincode, fincodeDirect, parseJst, orderIdOf } from "../functions/_lib/providers/fincode.js";
import { onRequestPost as payReturn } from "../functions/api/pay/return.js";

const env = { FINCODE_SECRET_KEY: "m_test_xxx", APP_URL: "https://chat.example.com" };
const REF = "0123456789abcdef0123456789abcdef";
const OID = REF.slice(0, 30);
const pack = { id: "p1000", yen: 1000, coins: 1100 };
const dev = { device_name: "iPhone", win_width: "375", win_height: "812", pixel_ratio: "2.00", win_size_type: "2" };

const mock = (handler) => { const calls = []; globalThis.fetch = async (url, init = {}) => { const c = { url: String(url), method: init.method || "GET", headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined }; calls.push(c); const r = await handler(c); return new Response(JSON.stringify(r.body ?? {}), { status: r.status || 200 }); }; return calls; };

test("決済ページ型: /v1/sessions に仕様どおりのボディで発行し、決済URLを返す", async () => {
  const calls = mock(() => ({ body: { id: "lk_x", link_url: "https://secure.test.fincode.jp/v1/links/lk_x", expire: "2026/10/13 12:00:00.000" } }));
  const r = await fincode.create(env, { ref: REF, pack, origin: "https://chat.example.com" });
  assert.equal(calls[0].url, "https://api.test.fincode.jp/v1/sessions");
  assert.equal(calls[0].headers.authorization, "Bearer m_test_xxx");
  assert.deepEqual(calls[0].body.transaction, { pay_type: ["Konbini"], amount: "1000", order_id: OID, client_field_1: REF });
  assert.equal(calls[0].body.konbini.konbini_reception_mail_send_flag, "0");
  assert.match(calls[0].body.success_url, /\/api\/pay\/return\?ref=0123/);
  assert.equal(r.url, "https://secure.test.fincode.jp/v1/links/lk_x");
  assert.equal(r.providerId, OID);
  assert.equal(r.extra.voucher.kind, "link");
});

test("自画面型: 登録→実行でバーコードを取得（端末情報つき）", async () => {
  const calls = mock((c) => c.method === "POST"
    ? { body: { id: OID, access_id: "a_" + "x".repeat(22) } }
    : { body: { id: OID, status: "AWAITING_CUSTOMER_PAYMENT", result: "000", barcode: "QUJD", barcode_format: "png", barcode_width: "300", barcode_height: "80", payment_term: "2026/10/15 23:59:59.000" } });
  const r = await fincodeDirect.create(env, { ref: REF, pack, customer: { device: dev } });
  assert.equal(calls[0].url, "https://api.test.fincode.jp/v1/payments");
  assert.deepEqual(calls[0].body, { id: OID, pay_type: "Konbini", amount: "1000", client_field_1: REF });
  assert.equal(calls[1].method, "PUT");
  assert.equal(calls[1].url, `https://api.test.fincode.jp/v1/payments/${OID}`);
  assert.equal(calls[1].body.access_id, "a_" + "x".repeat(22));
  assert.equal(calls[1].body.win_size_type, "2");
  assert.equal(r.url, "");
  assert.equal(r.extra.voucher.barcode.data, "QUJD");
  assert.equal(r.extra.voucher.expiresAt, Date.parse("2026-10-15T23:59:59+09:00"));
});

test("自画面型: 端末情報が不正なら発行しない / 結果コードがエラーなら失敗", async () => {
  mock(() => ({ body: {} }));
  await assert.rejects(fincodeDirect.create(env, { ref: REF, pack, customer: { device: { ...dev, win_width: "abc" } } }), /端末情報/);
  mock((c) => c.method === "POST" ? { body: { id: OID, access_id: "a" } } : { body: { result: "002", barcode: "" } });
  await assert.rejects(fincodeDirect.create(env, { ref: REF, pack, customer: { device: dev } }), /結果コード 002/);
});

test("入金判定: CAPTURED かつ金額一致のときだけ paid", async () => {
  const pay = { providerId: OID, yen: 1000 };
  mock(() => ({ body: { status: "CAPTURED", total_amount: 1000 } }));
  assert.equal((await fincode.check(env, pay)).status, "paid");
  mock(() => ({ body: { status: "CAPTURED", total_amount: 500 } }));
  assert.equal((await fincode.check(env, pay)).status, "pending", "金額不一致は入金にしない");
  mock(() => ({ body: { status: "AWAITING_CUSTOMER_PAYMENT", total_amount: 1000 } }));
  assert.equal((await fincode.check(env, pay)).status, "pending");
  for (const st of ["EXPIRED", "CANCELED", "FAILED"]) { mock(() => ({ body: { status: st } })); assert.equal((await fincode.check(env, pay)).status, "failed"); }
});

test("決済ページ型: 利用者がまだ支払い方法を確定していない(404)間は pending", async () => {
  const calls = mock(() => ({ status: 404, body: { errors: [{ error_code: "E01000001", error_message: "not found" }] } }));
  assert.equal((await fincode.check(env, { providerId: OID, yen: 1000 })).status, "pending");
  assert.equal(calls[0].url, `https://api.test.fincode.jp/v1/payments/${OID}?pay_type=Konbini`);
});

test("本番切替: FINCODE_ENV=live で本番URL", async () => {
  const calls = mock(() => ({ body: { status: "UNPROCESSED" } }));
  await fincode.check({ ...env, FINCODE_ENV: "live" }, { providerId: OID, yen: 1 });
  assert.ok(calls[0].url.startsWith("https://api.fincode.jp/"));
});

test("Webhook: 署名検証と ref の取り出し", () => {
  const req = (sig) => ({ headers: new Headers(sig ? { "fincode-signature": sig } : {}) });
  assert.equal(fincode.verifyWebhook(env, req()), true, "署名未設定なら検証しない");
  const e2 = { ...env, FINCODE_WEBHOOK_SIGNATURE: "SIG" };
  assert.equal(fincode.verifyWebhook(e2, req("SIG")), true);
  assert.equal(fincode.verifyWebhook(e2, req("bad")), false);
  assert.equal(fincode.verifyWebhook(e2, req()), false);
  assert.equal(fincode.refFromWebhook({ order_id: OID, client_field_1: REF, status: "CAPTURED" }), REF);
});

test("戻り口: POSTで来ても 303 でアプリへ戻す（refは32桁hexのみ）", async () => {
  const r = await payReturn({ env, request: new Request(`https://chat.example.com/api/pay/return?ref=${REF}&r=success`, { method: "POST" }) });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), `https://chat.example.com/?pay=return&ref=${REF}`);
  const r2 = await payReturn({ env, request: new Request(`https://chat.example.com/api/pay/return?ref=%3Cscript%3E&r=cancel`, { method: "POST" }) });
  assert.equal(r2.headers.get("location"), "https://chat.example.com/?pay=cancel");
});

test("ユーティリティ", () => { assert.equal(orderIdOf(REF).length, 30); assert.equal(parseJst(""), 0); });
