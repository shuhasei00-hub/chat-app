// Web Push を Workers の WebCrypto だけで実装（外部ライブラリ不要）
//   - 暗号化: RFC 8291（aes128gcm）  - 認証: RFC 8292（VAPID, ES256）  - 配送: RFC 8030
const enc = new TextEncoder();

export const b64uEncode = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const b64uDecode = (str) => {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
// WebCrypto の HKDF は Extract + Expand を一括で行う
const hkdf = async (ikm, salt, info, bytes) => {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
};

// payload(Uint8Array) を購読者(p256dh, auth)宛てに暗号化して、そのまま POST できる本文を返す。
// opts.asKeys / opts.salt はテスト（RFC 8291 付録Aの検証）用。
export const encryptPayload = async ({ p256dh, auth }, plaintext, opts = {}) => {
  const uaPublic = b64uDecode(p256dh);
  const authSecret = b64uDecode(auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("invalid subscription keys");

  const asKeys = opts.asKeys || (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));

  const ikm = await hkdf(ecdh, authSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(ikm, salt, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, enc.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));

  const header = new Uint8Array(21); // salt(16) + record size(4) + key length(1)
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
};

let cachedKey = { pub: "", key: null };
const signingKey = async (env) => {
  if (cachedKey.key && cachedKey.pub === env.VAPID_PUBLIC_KEY) return cachedKey.key;
  const pub = b64uDecode(env.VAPID_PUBLIC_KEY);
  if (pub.length !== 65) throw new Error("VAPID_PUBLIC_KEY が不正です（65バイトのbase64url）");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: env.VAPID_PRIVATE_KEY },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  cachedKey = { pub: env.VAPID_PUBLIC_KEY, key };
  return key;
};

export const vapidHeader = async (env, endpoint) => {
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claim = b64uEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || "mailto:admin@example.com",
  })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await signingKey(env), enc.encode(`${head}.${claim}`));
  return `vapid t=${head}.${claim}.${b64uEncode(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
};

// 購読の endpoint は利用者が登録できる値なので、既知のプッシュサービス以外には送らない（SSRF対策）
const ALLOWED_HOSTS = [
  "fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com",
  "push.apple.com", "notify.windows.com", "push.microsoft.com",
];
export const isAllowedEndpoint = (env, endpoint) => {
  let u;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const extra = String(env?.PUSH_ENDPOINT_ALLOW || "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...ALLOWED_HOSTS, ...extra].some((h) => u.hostname === h || u.hostname.endsWith("." + h));
};

// 1端末へ送信。戻り値の gone=true は「購読が失効（404/410）」→ 呼び出し側で削除する
export const sendWebPush = async (env, sub, payload, { ttl = 60, urgency = "normal", topic } = {}) => {
  if (!isAllowedEndpoint(env, sub.endpoint)) return { ok: false, status: 0, gone: true };
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(payload)));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidHeader(env, sub.endpoint),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(ttl),
      urgency,
      ...(topic ? { topic } : {}),
    },
    body,
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
};
