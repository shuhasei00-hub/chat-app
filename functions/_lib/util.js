// 共通ユーティリティ
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const form = (obj) => {
  // Stripe 形式（a[b][0]=c）のフォームエンコード
  const out = [];
  const walk = (prefix, v) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${prefix}[${i}]`, x));
    else if (typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(`${prefix}[${k}]`, x));
    else out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(v))}`);
  };
  Object.entries(obj).forEach(([k, v]) => walk(k, v));
  return out.join("&");
};

export const basic = (user, pass = "") => "Basic " + btoa(`${user}:${pass}`);

export const appOrigin = (env, request) => (env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");

export const csvEnv = (v, fallback) =>
  String(v || fallback).split(",").map((s) => s.trim()).filter(Boolean);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const fetchJson = async (url, init, label) => {
  const res = await fetch(url, init);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new HttpError(502, `${label}: ${res.status} ${data?.error?.message || data?.message || data?.errors?.[0]?.detail || text.slice(0, 200)}`);
  return data;
};
