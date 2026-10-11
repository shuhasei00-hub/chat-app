// GET /api/tools/{translate|fx|wiki}  — 便利ツール用の外部API中継（CORS回避・入力検証・キャッシュ）
//   translate?q=...&from=ja&to=en          MyMemory（キー不要・無料枠あり）
//   fx?from=JPY&to=USD,EUR                 frankfurter（ECB為替レート・キー不要）
//   wiki?q=キーワード  /  wiki?title=記事名   Wikipedia（検索 / 要約）
import { json } from "../../_lib/util.js";

const UA = "ChatApp/1.0 (+https://example.com; link-preview and tools)";
const LANGS = new Set(["ja", "en", "zh-CN", "zh-TW", "ko", "es", "fr", "de", "it", "pt", "ru", "th", "vi", "id"]);
const CURRENCIES = new Set(["JPY", "USD", "EUR", "GBP", "AUD", "CAD", "CHF", "CNY", "HKD", "KRW", "SGD", "THB", "INR", "NZD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "BRL", "MXN", "ZAR", "TRY", "PHP", "MYR", "IDR", "ILS", "ISK", "RON", "BGN"]);

const getJson = async (url, ttl = 300) => {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000), cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
};
const cached = (data, ttl = 300) => json(data, 200, { "cache-control": `public, max-age=${ttl}` });

const translate = async (p) => {
  const q = String(p.get("q") || "").trim();
  const from = p.get("from") || "ja";
  const to = p.get("to") || "en";
  if (!q) return json({ error: "テキストを入力してください" }, 400);
  if (q.length > 500) return json({ error: "翻訳できるのは500文字までです" }, 400);
  if (!LANGS.has(from) || !LANGS.has(to)) return json({ error: "対応していない言語です" }, 400);
  if (from === to) return cached({ text: q, from, to });
  const d = await getJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(from + "|" + to)}`, 86400);
  const text = d?.responseData?.translatedText;
  if (!text || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(text) || Number(d.responseStatus) >= 400) {
    return json({ error: "翻訳の利用上限に達したか、翻訳できませんでした。時間をおいてお試しください" }, 502);
  }
  return cached({ text, from, to }, 86400);
};

const fx = async (p) => {
  const from = (p.get("from") || "JPY").toUpperCase();
  const to = (p.get("to") || "USD").toUpperCase().split(",").filter(Boolean);
  if (!CURRENCIES.has(from) || !to.length || to.length > 12 || !to.every((c) => CURRENCIES.has(c))) return json({ error: "通貨コードが不正です" }, 400);
  let d;
  try { d = await getJson(`https://api.frankfurter.app/latest?from=${from}&to=${to.join(",")}`, 3600); }
  catch { d = await getJson(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to.join(",")}`, 3600); }
  if (!d?.rates) return json({ error: "レートを取得できませんでした" }, 502);
  return cached({ base: d.base || from, date: d.date, rates: d.rates }, 3600);
};

const wiki = async (p) => {
  const lang = p.get("lang") === "en" ? "en" : "ja";
  const title = String(p.get("title") || "").trim();
  if (title) {
    const d = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.slice(0, 200))}`, 3600);
    return cached({
      title: d.title, description: d.description || "", extract: d.extract || "",
      thumbnail: d.thumbnail?.source || "", url: d.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    }, 3600);
  }
  const q = String(p.get("q") || "").trim().slice(0, 100);
  if (!q) return json({ error: "キーワードを入力してください" }, 400);
  const d = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=8&format=json&utf8=1`, 600);
  const results = (d?.query?.search || []).map((r) => ({ title: r.title, snippet: String(r.snippet || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").slice(0, 120) }));
  return cached({ results }, 600);
};

export const onRequestGet = async ({ request, params }) => {
  const p = new URL(request.url).searchParams;
  try {
    if (params?.name === "translate") return await translate(p);
    if (params?.name === "fx") return await fx(p);
    if (params?.name === "wiki") return await wiki(p);
    return json({ error: "not found" }, 404);
  } catch {
    return json({ error: "外部サービスに接続できませんでした" }, 502);
  }
};
