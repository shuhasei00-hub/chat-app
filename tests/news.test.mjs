// ニュースRSSプロキシ: Yahooが403でも別の取得元に切り替わること
import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/news.js";

const RSS = '<?xml version="1.0"?><rss version="2.0"><channel><item><title>見出し</title><link>https://example.com/a</link></item></channel></rss>';
const YAHOO = "https://news.yahoo.co.jp/rss/topics/world.xml";
const req = (u) => ({ request: new Request("https://chat.example.com/api/news?url=" + encodeURIComponent(u)) });
const orig = globalThis.fetch;
test.after(() => { globalThis.fetch = orig; });

test("Yahooが成功すればそのまま返す", async () => {
  globalThis.fetch = async (u) => new Response(RSS, { status: 200, headers: { "content-type": "application/rss+xml" } });
  const r = await onRequest(req(YAHOO));
  assert.equal(r.status, 200); assert.equal(r.headers.get("x-news-source"), "news.yahoo.co.jp");
});
test("Yahooが403なら Google ニュースに切り替わる（カテゴリも対応）", async () => {
  const seen = [];
  globalThis.fetch = async (u) => { seen.push(String(u)); return String(u).includes("yahoo") ? new Response("denied", { status: 403 }) : new Response(RSS); };
  const r = await onRequest(req(YAHOO));
  assert.equal(r.status, 200); assert.equal(r.headers.get("x-news-source"), "news.google.com");
  assert.match(seen[1], /topic\/WORLD/);
  assert.match(await r.text(), /<item>/);
});
test("HTMLの拒否ページ(200)は弾いて次へ / 全部だめなら502で理由を返す", async () => {
  globalThis.fetch = async (u) => new Response("<html><body>blocked</body></html>", { status: 200 });
  const r = await onRequest(req(YAHOO));
  assert.equal(r.status, 502); assert.match(await r.text(), /not rss/);
});
test("許可していないホストは拒否", async () => {
  assert.equal((await onRequest(req("https://evil.example.com/x.xml"))).status, 403);
  assert.equal((await onRequest(req("http://news.yahoo.co.jp/rss/topics/top-picks.xml"))).status, 403);
});
