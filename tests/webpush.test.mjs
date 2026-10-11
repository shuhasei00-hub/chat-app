// node --test tests/   で実行
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { encryptPayload, b64uEncode, b64uDecode, vapidHeader, isAllowedEndpoint } from "../functions/_lib/webpush.js";

// RFC 8291 付録A のテストベクタ
const V = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

test("RFC 8291 付録A のテストベクタと完全一致する", async () => {
  const pub = b64uDecode(V.asPublic);
  const jwk = { kty: "EC", crv: "P-256", x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33)), d: V.asPrivate };
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = await crypto.subtle.importKey("raw", pub, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const out = await encryptPayload(
    { p256dh: V.uaPublic, auth: V.auth },
    new TextEncoder().encode(V.plaintext),
    { asKeys: { privateKey, publicKey }, salt: b64uDecode(V.salt) },
  );
  assert.equal(b64uEncode(out), V.body);
});

// 受信側を node:crypto で独立に実装し、往復で復号できることを確認する
const decrypt = (body, uaPriv, uaPub, auth) => {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPub = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(uaPriv);
  const secret = ecdh.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", secret, auth, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2); // 終端デリミタ
  return plain.subarray(0, plain.length - 1).toString("utf8");
};

test("ランダム鍵で暗号化 → 独立実装で復号できる（日本語・長文）", async () => {
  const ua = crypto.createECDH("prime256v1");
  ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const msg = JSON.stringify({ title: "山田さん", body: "こんにちは🙂".repeat(100) });
  const body = await encryptPayload(
    { p256dh: b64uEncode(ua.getPublicKey()), auth: b64uEncode(auth) },
    new TextEncoder().encode(msg),
  );
  assert.equal(decrypt(Buffer.from(body), ua.getPrivateKey(), ua.getPublicKey(), auth), msg);
});

test("VAPID: ES256署名を公開鍵で検証できる", async () => {
  const kp = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = kp.privateKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
  const env = { VAPID_PUBLIC_KEY: b64uEncode(pub), VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: "mailto:test@example.com" };
  const h = await vapidHeader(env, "https://fcm.googleapis.com/fcm/send/abc");
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m);
  const claim = JSON.parse(Buffer.from(m[2], "base64url").toString());
  assert.equal(claim.aud, "https://fcm.googleapis.com");
  assert.equal(claim.sub, "mailto:test@example.com");
  assert.ok(claim.exp > Date.now() / 1000 && claim.exp < Date.now() / 1000 + 86400);
  const ok = crypto.verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key: kp.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(m[3], "base64url"));
  assert.equal(ok, true);
  assert.equal(m[4], env.VAPID_PUBLIC_KEY);
});

test("endpoint の許可リスト（SSRF対策）", () => {
  assert.equal(isAllowedEndpoint({}, "https://fcm.googleapis.com/fcm/send/x"), true);
  assert.equal(isAllowedEndpoint({}, "https://updates.push.services.mozilla.com/wpush/v2/x"), true);
  assert.equal(isAllowedEndpoint({}, "https://web.push.apple.com/x"), true);
  assert.equal(isAllowedEndpoint({}, "https://wns2-par02p.notify.windows.com/w/?token=x"), true);
  assert.equal(isAllowedEndpoint({}, "http://fcm.googleapis.com/x"), false);
  assert.equal(isAllowedEndpoint({}, "https://evil.example.com/x"), false);
  assert.equal(isAllowedEndpoint({}, "https://fcm.googleapis.com.evil.com/x"), false);
  assert.equal(isAllowedEndpoint({}, "https://169.254.169.254/latest"), false);
  assert.equal(isAllowedEndpoint({ PUSH_ENDPOINT_ALLOW: "push.example.org" }, "https://a.push.example.org/x"), true);
});
