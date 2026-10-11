// GET /api/ogp?url=...  — リンクのプレビュー情報（タイトル・説明・画像）を取得（トークのリンクカード用）
import { UA, decodeHtml, parseMeta, parseUrl, readLimited } from "../_lib/ogp.js";
import { json } from "../_lib/util.js";

export const onRequestGet = async ({ request }) => {
  const raw = new URL(request.url).searchParams.get("url") || "";
  let target = parseUrl(raw);
  if (!target) return json({ error: "このURLはプレビューできません" }, 400);

  try {
    // リダイレクトは手動で追い、各ホップを検証する
    let res;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(target.toString(), {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "ja,en;q=0.8" },
        redirect: "manual", signal: AbortSignal.timeout(6000), cf: { cacheTtl: 3600, cacheEverything: true },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        const next = parseUrl(new URL(res.headers.get("location"), target).toString());
        if (!next) return json({ error: "リダイレクト先を開けません" }, 400);
        target = next;
        continue;
      }
      break;
    }
    if (!res.ok) return json({ error: `取得できませんでした(${res.status})` }, 502);
    const type = res.headers.get("content-type") || "";
    if (/^image\//i.test(type) && target.protocol === "https:") {
      return json({ url: target.toString(), title: target.pathname.split("/").pop() || target.hostname, description: "", image: target.toString(), siteName: target.hostname }, 200, { "cache-control": "public, max-age=3600" });
    }
    if (!/html/i.test(type)) return json({ error: "プレビューに対応していません" }, 415);
    const html = decodeHtml(await readLimited(res), type);
    const meta = parseMeta(html, target.toString());
    if (!meta.title && !meta.description) return json({ error: "情報がありません" }, 404);
    return new Response(JSON.stringify({ url: target.toString(), ...meta }), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" },
    });
  } catch {
    return json({ error: "取得に失敗しました" }, 502);
  }
};
