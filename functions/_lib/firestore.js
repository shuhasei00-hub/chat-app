// Firestore REST（サービスアカウント）— サーバーだけがウォレットへ入金できるようにするための最小実装
import { HttpError } from "./util.js";

let tokenCache = { token: "", exp: 0 };

const b64url = (buf) => {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new TextEncoder().encode(buf);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const sa = (env) => {
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new HttpError(500, "FIREBASE_SERVICE_ACCOUNT が未設定です");
  try { return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); } catch { throw new HttpError(500, "FIREBASE_SERVICE_ACCOUNT がJSONではありません"); }
};

export const projectId = (env) => env.FIREBASE_PROJECT_ID || "chat-app-c17bf";
export const appId = (env) => env.APP_ID || "messenger-app-v9-integrated";

const accessToken = async (env) => {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.exp - 60 > now) return tokenCache.token;
  const key = sa(env);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email, scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const pem = key.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", k, new TextEncoder().encode(`${head}.${claim}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${head}.${claim}.${b64url(sig)}`,
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(500, "Google認証に失敗: " + (data.error_description || data.error));
  tokenCache = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return tokenCache.token;
};

const root = (env) => `projects/${projectId(env)}/databases/(default)/documents`;
export const docName = (env, ...segs) => `${root(env)}/artifacts/${appId(env)}/public/data/${segs.join("/")}`;

// JS値 <-> Firestore 値
export const toValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "object") return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
};
export const toFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]));
const fromValue = (v) => {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  return null;
};
export const fromFields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromValue(v)]));

export const call = async (env, path, init = {}) => {
  const res = await fetch(`https://firestore.googleapis.com/v1/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken(env)}`, "content-type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

export const getDoc = async (env, ...segs) => {
  const r = await call(env, docName(env, ...segs));
  if (r.status === 404) return null;
  if (!r.ok) throw new HttpError(500, "Firestore読込失敗: " + (r.data?.error?.message || r.status));
  return { ...fromFields(r.data.fields), __updateTime: r.data.updateTime };
};

export const commit = async (env, writes) => {
  const r = await call(env, `${root(env)}:commit`, { method: "POST", body: JSON.stringify({ writes }) });
  if (!r.ok) {
    const e = new HttpError(r.status === 409 || r.status === 400 ? 409 : 500, "Firestore書込失敗: " + (r.data?.error?.message || r.status));
    e.firestoreStatus = r.data?.error?.status;
    throw e;
  }
  return r.data;
};

export const createDoc = (env, segs, data) =>
  commit(env, [{ update: { name: docName(env, ...segs), fields: toFields(data) }, currentDocument: { exists: false } }]);

// 支払い確定: 「支払い済みへ更新」「ウォレット加算」「履歴作成」を1回のcommitで原子的に実行。
// updateTime の前提条件により、webhook と確認ボタンが同時に来ても二重入金されません。
export const settlePayment = async (env, payment, ref) => {
  const now = new Date();
  return commit(env, [
    {
      update: { name: serverDocName(env, "payments", ref), fields: toFields({ status: "paid", paidAt: now }) },
      updateMask: { fieldPaths: ["status", "paidAt"] },
      currentDocument: { updateTime: payment.__updateTime },
    },
    {
      update: { name: docName(env, "users", payment.uid), fields: {} },
      updateMask: { fieldPaths: [] },
      updateTransforms: [{ fieldPath: "wallet", increment: { integerValue: String(payment.coins) } }],
      currentDocument: { exists: true },
    },
    {
      update: {
        name: docName(env, "wallet_tx", `pay_${ref}`),
        fields: toFields({
          type: "topup", fromUid: "system", toUid: payment.uid, participants: [payment.uid],
          amount: payment.coins, yen: payment.yen, provider: payment.provider,
          note: `チャージ ¥${Number(payment.yen).toLocaleString()}`, createdAt: now,
        }),
      },
      currentDocument: { exists: false },
    },
  ]);
};

// 支払い記録は server/data/payments に置く（ブラウザから書き込めない場所。読み取りは本人のみ許可するルールを docs/firestore.rules.example に記載）。
// public/data 配下に置くと、利用者が偽の支払い記録を作って無料でコインを得られてしまうため。
export const createPayment = (env, ref, data) =>
  commit(env, [{ update: { name: serverDocName(env, "payments", ref), fields: toFields(data) }, currentDocument: { exists: false } }]);
export const getPayment = (env, ref) => getServerDoc(env, "payments", ref);
export const patchPayment = (env, ref, data, updateTime) =>
  commit(env, [{
    update: { name: serverDocName(env, "payments", ref), fields: toFields(data) },
    updateMask: { fieldPaths: Object.keys(data) },
    ...(updateTime ? { currentDocument: { updateTime } } : { currentDocument: { exists: true } }),
  }]);

export const patchDoc = (env, segs, data, updateTime) =>
  commit(env, [{
    update: { name: docName(env, ...segs), fields: toFields(data) },
    updateMask: { fieldPaths: Object.keys(data) },
    ...(updateTime ? { currentDocument: { updateTime } } : { currentDocument: { exists: true } }),
  }]);

// ---------------------------------------------------------------------------
// サーバー専用領域: artifacts/{appId}/server/data/...
//   Firestoreルールにこのパスを許可する記述が無いため、ブラウザからは読み書きできません
//   （プッシュ購読・Webhookのトークン・リマインダーなど、他人に見せたくない情報用）。
// ---------------------------------------------------------------------------
export function serverDocName(env, ...segs) { return `${root(env)}/artifacts/${appId(env)}/server/data/${segs.join("/")}`; }

// Firestore のフィールドパス用に、識別子でないセグメントをバッククォートで囲む
export const fieldPath = (...segs) => segs.map((s) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : "`" + String(s).replace(/[`\\]/g, "\\$&") + "`")).join(".");

export const getServerDoc = async (env, ...segs) => {
  const r = await call(env, serverDocName(env, ...segs));
  if (r.status === 404) return null;
  if (!r.ok) throw new HttpError(500, "Firestore読込失敗: " + (r.data?.error?.message || r.status));
  return { ...fromFields(r.data.fields), __updateTime: r.data.updateTime };
};

// 指定フィールドだけを上書き（ドキュメントが無ければ作成）。mask に無いフィールドは触らない
export const mergeServerDoc = (env, segs, data) =>
  commit(env, [{
    update: { name: serverDocName(env, ...segs), fields: toFields(data) },
    updateMask: { fieldPaths: Object.keys(data).map((k) => fieldPath(k)) },
  }]);

export const setServerDoc = (env, segs, data) =>
  commit(env, [{ update: { name: serverDocName(env, ...segs), fields: toFields(data) } }]);

export const deleteServerDoc = (env, ...segs) =>
  commit(env, [{ delete: serverDocName(env, ...segs) }]);

const OPS = { eq: "EQUAL", lte: "LESS_THAN_OR_EQUAL", gte: "GREATER_THAN_OR_EQUAL", lt: "LESS_THAN", gt: "GREATER_THAN" };

// 単一フィールドの比較だけ（複合インデックス不要）。戻り値の __id はドキュメントID
export const queryServer = async (env, collectionId, { field, op = "eq", value, orderBy, limit = 100 }) => {
  const parent = `${root(env)}/artifacts/${appId(env)}/server/data`;
  const structuredQuery = {
    from: [{ collectionId }],
    where: { fieldFilter: { field: { fieldPath: field }, op: OPS[op], value: toValue(value) } },
    limit,
  };
  if (orderBy) structuredQuery.orderBy = [{ field: { fieldPath: orderBy }, direction: "ASCENDING" }];
  const r = await call(env, `${parent}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery }) });
  if (!r.ok) throw new HttpError(500, "Firestore検索失敗: " + (r.data?.error?.message || r.status));
  return (Array.isArray(r.data) ? r.data : [])
    .filter((x) => x.document)
    .map((x) => ({ ...fromFields(x.document.fields), __id: x.document.name.split("/").pop(), __name: x.document.name }));
};
