import { HttpError } from "./util.js";

// Firebase IDトークンを検証して uid を返す（Identity Toolkit の accounts:lookup を利用）
export const requireUser = async (env, request) => {
  const m = /^Bearer (.+)$/.exec(request.headers.get("authorization") || "");
  if (!m) throw new HttpError(401, "ログインが必要です");
  if (!env.FIREBASE_API_KEY) throw new HttpError(500, "FIREBASE_API_KEY が未設定です");
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: m[1] }),
  });
  const data = await res.json().catch(() => ({}));
  const uid = data?.users?.[0]?.localId;
  if (!res.ok || !uid) throw new HttpError(401, "認証に失敗しました。再ログインしてください");
  return uid;
};
