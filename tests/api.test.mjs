// Worker のルーター経由で、通知〜Webhook〜リマインダーまで通しで検証する結合テスト。
// Firestore REST / Google認証 / プッシュサービス / 外部サイトは fetch をモックしています。
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import worker from "../worker/index.js";
import { processReminders } from "../functions/_lib/cron.js";
import { b64uEncode } from "../functions/_lib/webpush.js";

// ---------- 環境 ----------
const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const vapid = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const vjwk = vapid.privateKey.export({ format: "jwk" });
const VAPID_PUB = b64uEncode(Buffer.concat([Buffer.from([4]), Buffer.from(vjwk.x, "base64url"), Buffer.from(vjwk.y, "base64url")]));
const env = {
  FIREBASE_API_KEY: "k", FIREBASE_PROJECT_ID: "p", APP_ID: "app", APP_URL: "https://chat.example.com",
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: "sa@p.iam.gserviceaccount.com", private_key: rsa.privateKey.export({ type: "pkcs8", format: "pem" }) }),
  VAPID_PUBLIC_KEY: VAPID_PUB, VAPID_PRIVATE_KEY: vjwk.d, VAPID_SUBJECT: "mailto:t@example.com",
};
const ROOT = "projects/p/databases/(default)/documents";
const PUB = `${ROOT}/artifacts/app/public/data`;
const SRV = `${ROOT}/artifacts/app/server/data`;

// ---------- Firestore インメモリモック ----------
const store = new Map(); // name -> fields
const splitPath = (p) => { const out = []; let cur = "", q = false; for (const ch of p) { if (ch === "`") q = !q; else if (ch === "." && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
const setPath = (fields, segs, val) => { let o = fields; segs.slice(0, -1).forEach((s) => { o[s] = o[s] || { mapValue: { fields: {} } }; o[s].mapValue.fields = o[s].mapValue.fields || {}; o = o[s].mapValue.fields; }); if (val === undefined) delete o[segs.at(-1)]; else o[segs.at(-1)] = val; };
const getPath = (fields, segs) => { let o = { mapValue: { fields } }; for (const s of segs) { o = o?.mapValue?.fields?.[s]; if (!o) return undefined; } return o; };
const val2js = (v) => ("integerValue" in v ? Number(v.integerValue) : "stringValue" in v ? v.stringValue : "doubleValue" in v ? v.doubleValue : "timestampValue" in v ? v.timestampValue : null);
const fsErr = (status, st) => new Response(JSON.stringify({ error: { status: st, message: st } }), { status });

const firestore = (url, init) => {
  const path = decodeURIComponent(url.pathname.replace("/v1/", ""));
  if (path.endsWith(":commit")) {
    const { writes } = JSON.parse(init.body);
    for (const w of writes) { // 前提条件チェック
      const name = (w.update || {}).name || w.delete;
      if (w.currentDocument?.exists === false && store.has(name)) return fsErr(409, "ALREADY_EXISTS");
      if (w.currentDocument?.exists === true && !store.has(name)) return fsErr(w.delete ? 400 : 404, "NOT_FOUND");
    }
    for (const w of writes) {
      if (w.delete) { store.delete(w.delete); continue; }
      const { name, fields = {} } = w.update;
      if (w.updateMask) {
        const cur = store.get(name) || {};
        for (const fp of w.updateMask.fieldPaths) { const segs = splitPath(fp); setPath(cur, segs, getPath(fields, segs)); }
        for (const t of w.updateTransforms || []) {
          const segs = splitPath(t.fieldPath);
          const old = getPath(cur, segs);
          setPath(cur, segs, { integerValue: String((old ? Number(old.integerValue) : 0) + Number(t.increment.integerValue)) });
        }
        store.set(name, cur);
      } else store.set(name, fields);
    }
    return new Response("{}");
  }
  if (path.endsWith(":runQuery")) {
    const parent = path.slice(0, -":runQuery".length);
    const q = JSON.parse(init.body).structuredQuery;
    const f = q.where.fieldFilter;
    const rows = [...store.entries()].filter(([n]) => n.startsWith(`${parent}/${q.from[0].collectionId}/`) && !n.slice(parent.length + q.from[0].collectionId.length + 2).includes("/"))
      .filter(([, fl]) => { const v = val2js(fl[f.field.fieldPath] || { nullValue: null }); const t = val2js(f.value); return f.op === "EQUAL" ? v === t : f.op === "LESS_THAN_OR_EQUAL" ? v !== null && v <= t : false; });
    return new Response(JSON.stringify(rows.length ? rows.map(([name, fields]) => ({ document: { name, fields, updateTime: "t" } })) : [{ readTime: "t" }]));
  }
  const d = store.get(path);
  return d ? new Response(JSON.stringify({ name: path, fields: d, updateTime: "2026-01-01T00:00:00Z" })) : fsErr(404, "NOT_FOUND");
};

// ---------- fetch モック ----------
const pushes = []; // 送られたプッシュ
const origFetch = globalThis.fetch;
const pages = {};
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "identitytoolkit.googleapis.com") {
    const { idToken } = JSON.parse(init.body);
    return idToken.startsWith("token-") ? new Response(JSON.stringify({ users: [{ localId: idToken.slice(6) }] })) : new Response("{}", { status: 400 });
  }
  if (url.hostname === "oauth2.googleapis.com") return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }));
  if (url.hostname === "firestore.googleapis.com") return firestore(url, init);
  if (url.hostname === "fcm.googleapis.com") { pushes.push({ url: url.toString(), headers: Object.fromEntries(new Headers(init.headers)), body: init.body }); return new Response("", { status: url.pathname.includes("dead") ? 410 : 201 }); }
  if (pages[url.toString()]) return pages[url.toString()]();
  if (url.hostname === "api.mymemory.translated.net") return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: "Hello" } }));
  if (url.hostname === "api.frankfurter.app") return new Response(JSON.stringify({ base: "JPY", date: "2026-10-09", rates: { USD: 0.0067 } }));
  throw new Error("unexpected fetch " + url);
};
test.after(() => { globalThis.fetch = origFetch; });

// ---------- ヘルパー ----------
const call = async (method, path, { token, body, raw } = {}) => {
  const res = await worker.fetch(new Request("https://chat.example.com" + path, {
    method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer token-${token}` } : {}) },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const decryptFor = (device, p) => { // 受信端末として復号
  const body = Buffer.from(p.body);
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), cipher = body.subarray(21 + idlen);
  const ecdh = crypto.createECDH("prime256v1"); ecdh.setPrivateKey(device.ecdh.getPrivateKey());
  const ikm = Buffer.from(crypto.hkdfSync("sha256", ecdh.computeSecret(asPub), device.auth, Buffer.concat([Buffer.from("WebPush: info\0"), device.ecdh.getPublicKey(), asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const dec = crypto.createDecipheriv("aes-128-gcm", cek, nonce); dec.setAuthTag(cipher.subarray(-16));
  const plain = Buffer.concat([dec.update(cipher.subarray(0, -16)), dec.final()]);
  return JSON.parse(plain.subarray(0, -1).toString());
};
const newDevice = (id) => { const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys(); const auth = crypto.randomBytes(16); return { ecdh, auth, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, sub: () => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: { p256dh: b64uEncode(ecdh.getPublicKey()), auth: b64uEncode(auth) } }) }; };
const S = (s) => ({ stringValue: s });
const nowIso = () => new Date().toISOString();

const aliceDev = newDevice("alice1"), bobDev = newDevice("bob1"), bobDev2 = newDevice("bob2-dead");
const lastPush = (dev) => { const p = [...pushes].reverse().find((x) => x.url.endsWith("/" + dev.endpoint.split("/").pop())); return p && { ...p, payload: decryptFor(dev, p) }; };

// ---------- データ ----------
store.set(`${PUB}/users/alice`, { name: S("アリス") });
store.set(`${PUB}/users/bob`, { name: S("ボブ") });
store.set(`${PUB}/chats/c1`, { participants: { arrayValue: { values: [S("alice"), S("bob")] } }, isGroup: { booleanValue: false } });

test("診断・公開鍵", async () => {
  const k = await call("GET", "/api/push/key");
  assert.equal(k.data.publicKey, VAPID_PUB);
  assert.equal(k.data.enabled, true);
  assert.equal((await call("GET", "/api/diag")).data.push.enabled, true);
});

test("認証なしは拒否 / 購読登録", async () => {
  assert.equal((await call("POST", "/api/push/notify", { body: { kind: "test" } })).status, 401);
  assert.equal((await call("POST", "/api/push/subscribe", { token: "alice", body: { subscription: { endpoint: "https://evil.example.com/x", keys: { p256dh: "a", auth: "b" } } } })).status, 400);
  for (const [u, d] of [["alice", aliceDev], ["bob", bobDev], ["bob", bobDev2]]) {
    const r = await call("POST", "/api/push/subscribe", { token: u, body: { subscription: d.sub(), prefs: {}, muted: [] } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  const doc = store.get(`${SRV}/push_subs/bob`);
  assert.equal(Object.keys(doc.subs.mapValue.fields).length, 2);
});

test("メッセージ通知: 相手の全端末に届き、本文は暗号化されている / 失効端末は掃除される", async () => {
  store.set(`${PUB}/chats/c1`, { ...store.get(`${PUB}/chats/c1`), lastMessage: { mapValue: { fields: { content: S("こんばんは！"), senderId: S("alice"), createdAt: { timestampValue: nowIso() } } } } });
  const r = await call("POST", "/api/push/notify", { token: "alice", body: { kind: "message", chatId: "c1" } });
  assert.deepEqual([r.status, r.data.sent], [200, 1]);
  const p = lastPush(bobDev);
  assert.equal(p.payload.title, "アリス");
  assert.equal(p.payload.body, "こんばんは！");
  assert.equal(p.payload.tag, "chat-c1");
  assert.equal(p.payload.url, "/?chat=c1");
  assert.equal(p.headers.urgency, "high");
  assert.equal(p.headers["content-encoding"], "aes128gcm");
  assert.match(p.headers.authorization, /^vapid t=/);
  assert.ok(!p.body.toString().includes("こんばんは")); // 平文が漏れていない
  assert.ok(!pushes.some((x) => x.url.endsWith("/alice1"))); // 送信者自身には送らない
  assert.equal(Object.keys(store.get(`${SRV}/push_subs/bob`).subs.mapValue.fields).length, 1); // 410の端末を削除
});

test("同じメッセージの二重通知を防ぐ / 他人のトークは不可 / 偽装不可", async () => {
  const n = pushes.length;
  const r = await call("POST", "/api/push/notify", { token: "alice", body: { kind: "message", chatId: "c1" } });
  assert.equal(r.data.skipped, "duplicate");
  assert.equal(pushes.length, n);
  assert.equal((await call("POST", "/api/push/notify", { token: "carol", body: { kind: "message", chatId: "c1" } })).status, 403);
  // bob は「自分が送ったことになっていないメッセージ」について通知を要求できない
  assert.equal((await call("POST", "/api/push/notify", { token: "bob", body: { kind: "message", chatId: "c1" } })).status, 409);
});

test("ミュート・プレビュー非表示がサーバー側で効く", async () => {
  const send = async (text, stamp) => {
    store.set(`${PUB}/chats/c1`, { ...store.get(`${PUB}/chats/c1`), lastMessage: { mapValue: { fields: { content: S(text), senderId: S("alice"), createdAt: { timestampValue: stamp } } } } });
    return call("POST", "/api/push/notify", { token: "alice", body: { kind: "message", chatId: "c1" } });
  };
  await call("POST", "/api/push/prefs", { token: "bob", body: { muted: ["c1"] } });
  const n = pushes.length;
  assert.equal((await send("ミュート中", new Date(Date.now() + 1).toISOString())).data.sent, 0);
  assert.equal(pushes.length, n);
  await call("POST", "/api/push/prefs", { token: "bob", body: { muted: [], prefs: { preview: false } } });
  assert.equal((await send("秘密の話", new Date(Date.now() + 2).toISOString())).data.sent, 1);
  assert.equal(lastPush(bobDev).payload.body, "新着メッセージがあります");
  await call("POST", "/api/push/prefs", { token: "bob", body: { prefs: { preview: true } } });
});

test("着信: 強い振動・タップ待ちで届き、不在着信で置き換わる", async () => {
  const sessionId = "s1";
  const setCall = (status) => store.set(`${PUB}/chats/c1`, { ...store.get(`${PUB}/chats/c1`), callStatus: { mapValue: { fields: { status: S(status), callerId: S("alice"), callType: S("video"), sessionId: S(sessionId), timestamp: { integerValue: String(Date.now()) } } } } });
  assert.equal((await call("POST", "/api/push/notify", { token: "alice", body: { kind: "call", chatId: "c1" } })).status, 409); // 発信していない
  setCall("ringing");
  assert.equal((await call("POST", "/api/push/notify", { token: "bob", body: { kind: "call", chatId: "c1" } })).status, 409); // 発信者以外は不可
  const r = await call("POST", "/api/push/notify", { token: "alice", body: { kind: "call", chatId: "c1" } });
  assert.equal(r.data.sent, 1);
  let p = lastPush(bobDev);
  assert.equal(p.payload.type, "call");
  assert.equal(p.payload.title, "アリス さんからビデオ通話");
  assert.equal(p.payload.requireInteraction, true);
  assert.ok(p.payload.vibrate.length >= 5);
  assert.equal(p.payload.tag, "call-c1");
  assert.equal(p.headers.ttl, "45");
  assert.equal(p.headers.urgency, "high");

  assert.equal((await call("POST", "/api/push/notify", { token: "alice", body: { kind: "missed", chatId: "c1", sessionId: "wrong" } })).status, 409);
  const m = await call("POST", "/api/push/notify", { token: "alice", body: { kind: "missed", chatId: "c1", sessionId } });
  assert.equal(m.data.sent, 1);
  p = lastPush(bobDev);
  assert.equal(p.payload.type, "missed");
  assert.equal(p.payload.tag, "call-c1"); // 同じtag → 着信通知を置き換える
  assert.equal((await call("POST", "/api/push/notify", { token: "alice", body: { kind: "missed", chatId: "c1", sessionId } })).status, 409); // 二重送信不可
});

test("Webhook: 外部から投稿 → メッセージ作成・未読加算・プッシュ", async () => {
  const bad = await call("POST", "/api/hooks/manage", { token: "carol", body: { action: "create", chatId: "c1", name: "x" } });
  assert.equal(bad.status, 403);
  const c = await call("POST", "/api/hooks/manage", { token: "alice", body: { action: "create", chatId: "c1", name: "GitHub" } });
  assert.equal(c.status, 200);
  assert.match(c.data.url, /^https:\/\/chat\.example\.com\/api\/hooks\/[a-f0-9]{32}$/);
  const path = new URL(c.data.url).pathname;

  const before = pushes.length;
  const r = await call("POST", path, { body: { text: "ビルド成功 ✅", title: "CI", url: "https://example.com/run/1" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const msgs = [...store.entries()].filter(([n]) => n.startsWith(`${PUB}/chats/c1/messages/`));
  assert.equal(msgs.length, 1);
  const f = msgs[0][1];
  assert.equal(f.isBot.booleanValue, true);
  assert.equal(f.senderName.stringValue, "GitHub");
  assert.equal(f.content.stringValue, "【CI】\nビルド成功 ✅\nhttps://example.com/run/1");
  const chat = store.get(`${PUB}/chats/c1`);
  assert.equal(chat.unreadCounts.mapValue.fields.bob.integerValue, "1");
  assert.equal(chat.lastMessage.mapValue.fields.senderId.stringValue.startsWith("hook_"), true);
  assert.equal(pushes.length, before + 2); // 外部サービスは参加者ではないので、参加者全員（アリス・ボブ）に届く
  assert.equal(lastPush(bobDev).payload.title, "GitHub");
  assert.equal(lastPush(aliceDev).payload.body, "【CI】\nビルド成功 ✅\nhttps://example.com/run/1");

  assert.equal((await call("POST", path, { body: { text: "連投" } })).status, 429); // 1秒制限
  assert.equal((await call("POST", "/api/hooks/" + "0".repeat(32), { body: { text: "x" } })).status, 404);
  const list = await call("POST", "/api/hooks/manage", { token: "alice", body: { action: "list" } });
  assert.equal(list.data.hooks.length, 1);
  assert.equal((await call("POST", "/api/hooks/manage", { token: "bob", body: { action: "delete", token: c.data.url.split("/").pop() } })).status, 404); // 他人は削除不可
  assert.equal((await call("POST", "/api/hooks/manage", { token: "alice", body: { action: "delete", token: c.data.url.split("/").pop() } })).status, 200);
  assert.equal((await call("POST", path, { body: { text: "削除後" } })).status, 404);
});

test("リマインダー: 登録 → 時刻になるとCronが通知して消える", async () => {
  assert.equal((await call("POST", "/api/reminders", { token: "bob", body: { action: "create", text: "", dueAt: Date.now() + 1000 } })).status, 400);
  assert.equal((await call("POST", "/api/reminders", { token: "bob", body: { action: "create", text: "x", dueAt: Date.now() - 999999 } })).status, 400);
  const c = await call("POST", "/api/reminders", { token: "bob", body: { action: "create", text: "薬を飲む", dueAt: Date.now() + 50 } });
  assert.equal(c.status, 200);
  const far = await call("POST", "/api/reminders", { token: "bob", body: { action: "create", text: "来月", dueAt: Date.now() + 30 * 86400000 } });
  assert.equal((await call("POST", "/api/reminders", { token: "bob", body: { action: "list" } })).data.reminders.length, 2);
  await new Promise((r) => setTimeout(r, 120));
  const before = pushes.length;
  assert.equal((await processReminders(env)).processed, 1); // 期限が来たものだけ
  assert.equal(pushes.length, before + 1);
  assert.equal(lastPush(bobDev).payload.body, "薬を飲む");
  assert.equal((await processReminders(env)).processed, 0); // 二重送信されない
  const left = (await call("POST", "/api/reminders", { token: "bob", body: { action: "list" } })).data.reminders;
  assert.deepEqual(left.map((r) => r.text), ["来月"]);
  await call("POST", "/api/reminders", { token: "alice", body: { action: "delete", id: far.data.id } }); // 他人は消せない
  assert.equal((await call("POST", "/api/reminders", { token: "bob", body: { action: "list" } })).data.reminders.length, 1);
});

test("別アカウントでログインし直した端末は、前のアカウントの通知を受け取らない", async () => {
  await call("POST", "/api/push/subscribe", { token: "carol", body: { subscription: bobDev.sub() } });
  const bob = store.get(`${SRV}/push_subs/bob`);
  assert.equal(Object.keys(bob.subs?.mapValue?.fields || {}).length, 0);
  await call("POST", "/api/push/subscribe", { token: "bob", body: { subscription: bobDev.sub() } });
});

test("リンクプレビュー(OGP): 解析とSSRF対策", async () => {
  pages["https://example.com/post"] = () => new Response(`<html><head><meta charset="utf-8"><title>fallback</title>
    <meta property="og:title" content="記事 &amp; ニュース"><meta property="og:description" content="説明文です"><meta property="og:image" content="/img/a.png">
    <meta property="og:site_name" content="Example"></head></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  const ok = await call("GET", "/api/ogp?url=" + encodeURIComponent("https://example.com/post"));
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.data.title, ok.data.description, ok.data.image, ok.data.siteName], ["記事 & ニュース", "説明文です", "https://example.com/img/a.png", "Example"]);
  for (const u of ["http://localhost/x", "http://127.0.0.1/", "http://169.254.169.254/latest", "http://[::1]/", "https://intranet/x", "file:///etc/passwd", "https://example.com:8080/", "ftp://example.com/", "http://192.168.0.1/", "http://2130706433/"]) {
    assert.equal((await call("GET", "/api/ogp?url=" + encodeURIComponent(u))).status, 400, u);
  }
  pages["https://example.com/redir"] = () => new Response("", { status: 302, headers: { location: "http://169.254.169.254/" } });
  assert.equal((await call("GET", "/api/ogp?url=" + encodeURIComponent("https://example.com/redir"))).status, 400); // リダイレクト先も検証
});

test("ツール API: 翻訳・為替の入力検証と中継", async () => {
  const t = await call("GET", "/api/tools/translate?q=" + encodeURIComponent("こんにちは") + "&from=ja&to=en");
  assert.equal(t.data.text, "Hello");
  assert.equal((await call("GET", "/api/tools/translate?q=x&from=ja&to=xx")).status, 400);
  assert.equal((await call("GET", "/api/tools/translate?q=" + "a".repeat(501))).status, 400);
  const fx = await call("GET", "/api/tools/fx?from=JPY&to=USD");
  assert.equal(fx.data.rates.USD, 0.0067);
  assert.equal((await call("GET", "/api/tools/fx?from=JPY&to=EVIL")).status, 400);
  assert.equal((await call("GET", "/api/tools/nope")).status, 404);
});
