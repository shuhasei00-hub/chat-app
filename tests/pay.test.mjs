// 決済パイプライン（発行→入金確認→コイン加算）の結合テスト。Firestore と fincode は fetch をモック。
// 確認すること: 支払い記録がブラウザから書けない場所(server/data/payments)にあること / 二重入金しないこと /
//              偽Webhookでは入金されないこと / 他人の支払いは確認できないこと
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import worker from "../worker/index.js";

const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = {
  FIREBASE_API_KEY: "k", FIREBASE_PROJECT_ID: "p", APP_ID: "app", APP_URL: "https://chat.example.com",
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: "sa@p.iam.gserviceaccount.com", private_key: rsa.privateKey.export({ type: "pkcs8", format: "pem" }) }),
  FINCODE_SECRET_KEY: "m_test_x", FINCODE_WEBHOOK_SIGNATURE: "SIG",
};
const ROOT = "projects/p/databases/(default)/documents";
const PUB = `${ROOT}/artifacts/app/public/data`;
const SRV = `${ROOT}/artifacts/app/server/data`;

// --- 最小の Firestore モック（前提条件 exists / updateTime、increment、updateMask に対応）---
const store = new Map(); // name -> { fields, ver }
const fsErr = (status, st) => new Response(JSON.stringify({ error: { status: st, message: st } }), { status });
const firestore = (url, init) => {
  const path = decodeURIComponent(url.pathname.replace("/v1/", ""));
  if (path.endsWith(":commit")) {
    const { writes } = JSON.parse(init.body);
    for (const w of writes) {
      const name = (w.update || {}).name || w.delete; const cur = store.get(name);
      if (w.currentDocument?.exists === false && cur) return fsErr(409, "ALREADY_EXISTS");
      if (w.currentDocument?.exists === true && !cur) return fsErr(404, "NOT_FOUND");
      if (w.currentDocument?.updateTime && (!cur || `v${cur.ver}` !== w.currentDocument.updateTime)) return fsErr(409, "ABORTED"); // 古い版への更新は拒否
    }
    for (const w of writes) {
      const { name, fields = {} } = w.update;
      const cur = store.get(name) || { fields: {}, ver: 0 };
      if (w.updateMask) {
        for (const fp of w.updateMask.fieldPaths) cur.fields[fp] = fields[fp];
        for (const t of w.updateTransforms || []) cur.fields[t.fieldPath] = { integerValue: String(Number(cur.fields[t.fieldPath]?.integerValue || 0) + Number(t.increment.integerValue)) };
        store.set(name, { fields: cur.fields, ver: cur.ver + 1 });
      } else store.set(name, { fields, ver: 1 });
    }
    return new Response("{}");
  }
  const d = store.get(path);
  return d ? new Response(JSON.stringify({ name: path, fields: d.fields, updateTime: `v${d.ver}` })) : fsErr(404, "NOT_FOUND");
};

let fincodeStatus = null; // null = 404（まだ支払い方法が確定していない）
const origFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "identitytoolkit.googleapis.com") { const { idToken } = JSON.parse(init.body); return new Response(JSON.stringify({ users: [{ localId: idToken.slice(6) }] })); }
  if (url.hostname === "oauth2.googleapis.com") return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }));
  if (url.hostname === "firestore.googleapis.com") return firestore(url, init);
  if (url.hostname === "api.test.fincode.jp") {
    if (url.pathname === "/v1/sessions") { const b = JSON.parse(init.body); return new Response(JSON.stringify({ id: "lk_1", link_url: "https://secure.test.fincode.jp/v1/links/lk_1", expire: "2026/10/14 00:00:00.000", transaction: b.transaction })); }
    if (url.pathname.startsWith("/v1/payments/")) return fincodeStatus ? new Response(JSON.stringify({ status: fincodeStatus, total_amount: 1000 })) : new Response(JSON.stringify({ errors: [{ error_code: "x" }] }), { status: 404 });
  }
  throw new Error("unexpected fetch " + url);
};
test.after(() => { globalThis.fetch = origFetch; });

const call = async (method, path, { token, body, headers } = {}) => {
  const res = await worker.fetch(new Request("https://chat.example.com" + path, {
    method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer token-${token}` } : {}), ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined,
  }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const wallet = (uid) => Number(store.get(`${PUB}/users/${uid}`)?.fields.wallet?.integerValue || 0);
store.set(`${PUB}/users/alice`, { fields: { wallet: { integerValue: "100" } }, ver: 1 });
store.set(`${PUB}/users/bob`, { fields: { wallet: { integerValue: "100" } }, ver: 1 });

let ref;
test("発行: 支払い記録は server/data/payments に作られ、public/data には作られない", async () => {
  const r = await call("POST", "/api/pay/checkout", { token: "alice", body: { provider: "fincode", packId: "p1000" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  ref = r.data.ref;
  assert.ok(store.has(`${SRV}/payments/${ref}`), "server/data/payments にある");
  assert.ok(!store.has(`${PUB}/payments/${ref}`), "ブラウザが書ける public/data には作らない");
  assert.equal(store.get(`${SRV}/payments/${ref}`).fields.uid.stringValue, "alice");
});

test("未払い(404)の間は pending、他人は確認できない、偽Webhook(未払い)では入金されない", async () => {
  assert.equal((await call("POST", "/api/pay/confirm", { token: "alice", body: { ref } })).data.status, "pending");
  assert.equal((await call("POST", "/api/pay/confirm", { token: "bob", body: { ref } })).status, 403);
  const hook = await call("POST", "/api/pay/webhook/fincode", { headers: { "fincode-signature": "SIG" }, body: { order_id: ref.slice(0, 30), client_field_1: ref, status: "CAPTURED" } });
  assert.equal(hook.data.receive, "0");
  assert.equal(hook.data.status, "pending", "本文が CAPTURED と言っていても、fincode に問い合わせて未払いなら入金しない");
  assert.equal(wallet("alice"), 100);
  assert.equal((await call("POST", "/api/pay/webhook/fincode", { headers: { "fincode-signature": "bad" }, body: { client_field_1: ref } })).status, 401);
});

test("入金: CAPTURED でコイン加算。確認・Webhookを何度/同時に呼んでも1回だけ", async () => {
  fincodeStatus = "CAPTURED";
  const rs = await Promise.all([
    call("POST", "/api/pay/confirm", { token: "alice", body: { ref } }),
    call("POST", "/api/pay/confirm", { token: "alice", body: { ref } }),
    call("POST", "/api/pay/webhook/fincode", { headers: { "fincode-signature": "SIG" }, body: { client_field_1: ref } }),
    call("POST", "/api/pay/webhook/fincode", { headers: { "fincode-signature": "SIG" }, body: { client_field_1: ref } }),
  ]);
  rs.forEach((r) => assert.ok(r.status < 500, JSON.stringify(r)));
  await call("POST", "/api/pay/confirm", { token: "alice", body: { ref } });
  assert.equal(wallet("alice"), 100 + 1100, "1,000円=1,100コインが1回だけ加算");
  assert.equal(wallet("bob"), 100);
  assert.equal(store.get(`${SRV}/payments/${ref}`).fields.status.stringValue, "paid");
  assert.ok(store.has(`${PUB}/wallet_tx/pay_${ref}`));
});

test("期限切れ(EXPIRED)は failed になり、入金されない", async () => {
  fincodeStatus = null;
  const r = await call("POST", "/api/pay/checkout", { token: "bob", body: { provider: "fincode", packId: "p500" } });
  fincodeStatus = "EXPIRED";
  assert.equal((await call("POST", "/api/pay/confirm", { token: "bob", body: { ref: r.data.ref } })).data.status, "failed");
  assert.equal(wallet("bob"), 100);
});
