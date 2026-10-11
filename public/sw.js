/* Service Worker: 通知の表示 / 通知タップでアプリを開く / ニュースの定期チェック */
const NEWS_URL = "/api/news?url=" + encodeURIComponent("https://news.yahoo.co.jp/rss/topics/top-picks.xml");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// 通知タップ → 既に開いているタブがあればそこへ、なければ新規に開く
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) {
        await c.focus();
        if ("navigate" in c) { try { await c.navigate(url); } catch (e) { /* 無視 */ } }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

// Web Push（サーバーから push を送る構成にしたとき用。payload: {title, body, url}）
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || "お知らせ", {
    body: d.body || "", tag: d.tag, data: { url: d.url || "/" },
  }));
});

// ニュースの定期チェック（Chromeにインストールした PWA で利用可能。Periodic Background Sync）
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "news-check") event.waitUntil(checkNews());
});

async function checkNews() {
  try {
    const res = await fetch(NEWS_URL);
    if (!res.ok) return;
    const xml = await res.text();
    const m = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>/.exec(xml);
    if (!m) return;
    const clean = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const title = clean(m[1]);
    const link = clean(m[2]);
    const cache = await caches.open("news-state");
    const prev = await cache.match("last");
    if (prev && (await prev.text()) === link) return; // 既に通知済み
    await cache.put("last", new Response(link));
    if (!prev) return; // 初回は基準だけ保存
    await self.registration.showNotification("最新ニュース", { body: title, tag: "news", data: { url: "/?open=news" } });
  } catch (e) { /* ネットワークエラーは無視 */ }
}
