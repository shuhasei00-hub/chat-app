// ニュースRSSのプロキシ（ブラウザから直接はCORSで取得できないため）
// まず Yahoo!ニュースのRSSを取得し、Yahoo側が Cloudflare からのアクセスを断った(403等)場合は、
// 同じカテゴリの別の取得元（Google ニュースRSS / NHKニュースRSS）に自動で切り替えます。
const ALLOW = new Set(["news.yahoo.co.jp", "headlines.yahoo.co.jp"]); // クライアントが指定できるのはここだけ
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

const G = (topic) => `https://news.google.com/rss/headlines/section/topic/${topic}?hl=ja&gl=JP&ceid=JP:ja`;
const G_TOP = "https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja";
const NHK_TOP = "https://www3.nhk.or.jp/rss/news/cat0.xml";
// Yahoo のフィード名 → 代わりに試す取得元（順番に試す）
export const FALLBACKS = {
  "top-picks": [G_TOP, NHK_TOP],
  domestic: [G("NATION"), G_TOP],
  world: [G("WORLD"), G_TOP],
  business: [G("BUSINESS"), G_TOP],
  entertainment: [G("ENTERTAINMENT"), G_TOP],
  sports: [G("SPORTS"), G_TOP],
  it: [G("TECHNOLOGY"), G_TOP],
  science: [G("SCIENCE"), G_TOP],
  local: [G("NATION"), G_TOP],
};
const feedName = (u) => /\/rss\/topics\/([a-z-]+)\.xml$/.exec(u.pathname)?.[1] || "top-picks";

const get = async (url) => {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "ja,en-US;q=0.9,en;q=0.8" },
    redirect: "follow",
    cf: { cacheTtl: 120, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const body = await res.arrayBuffer();
  const head = new TextDecoder().decode(body.slice(0, 400));
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(head) && !/<\?xml/i.test(head)) throw new Error("not rss"); // HTMLの拒否ページ等を弾く
  return { body, type: res.headers.get("content-type") || "application/xml" };
};

export async function onRequest(context) {
  const u = new URL(context.request.url);
  const target = u.searchParams.get("url");
  if (!target) return new Response("missing url", { status: 400 });

  let targetUrl;
  try { targetUrl = new URL(target); } catch { return new Response("bad url", { status: 400 }); }
  if (targetUrl.protocol !== "https:" || !ALLOW.has(targetUrl.hostname)) return new Response("blocked host", { status: 403 });

  const candidates = [targetUrl.toString(), ...(FALLBACKS[feedName(targetUrl)] || [G_TOP])];
  const errors = [];
  for (const url of candidates) {
    try {
      const { body, type } = await get(url);
      return new Response(body, { status: 200, headers: { "content-type": type, "cache-control": "public, max-age=120", "x-news-source": new URL(url).hostname } });
    } catch (e) {
      errors.push(`${new URL(url).hostname}: ${e.message}`);
    }
  }
  return new Response(`upstream error (${errors.join(" / ")})`, { status: 502 });
}
