// Yahoo!ニュース RSS のプロキシ（ブラウザから直接はCORSで取得できないため）
const ALLOW = new Set(["news.yahoo.co.jp", "headlines.yahoo.co.jp"]);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

export async function onRequest(context) {
  const u = new URL(context.request.url);
  const target = u.searchParams.get("url");
  if (!target) return new Response("missing url", { status: 400 });

  let targetUrl;
  try { targetUrl = new URL(target); } catch { return new Response("bad url", { status: 400 }); }
  if (targetUrl.protocol !== "https:" || !ALLOW.has(targetUrl.hostname)) return new Response("blocked host", { status: 403 });

  try {
    const res = await fetch(targetUrl.toString(), {
      headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "ja,en-US;q=0.9,en;q=0.8" },
      redirect: "follow",
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    return new Response(await res.arrayBuffer(), {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/xml", "cache-control": "public, max-age=120" },
    });
  } catch (e) {
    return new Response("upstream error", { status: 502 });
  }
}
