/* Service Worker v4
   - Web Push の受信と通知表示（メッセージ / 着信 / 不在着信 / リマインダー / Webhook）
   - 通知タップでアプリを開く（開いているタブがあればそこへ移動）
   - ニュースの定期チェック（Periodic Background Sync 対応ブラウザのみ） */
const NEWS_URL = "/api/news?url=" + encodeURIComponent("https://news.yahoo.co.jp/rss/topics/top-picks.xml");
const ICON = "/icon-192.png";
// iOS(Safari)は「プッシュを受けたら必ず通知を表示する」決まり。表示しないと購読が失効するため例外扱いにする
const STRICT_PUSH = /iPhone|iPad|iPod/.test(self.navigator.userAgent) || (/Macintosh/.test(self.navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(self.navigator.userAgent));

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const windows = () => self.clients.matchAll({ type: "window", includeUncontrolled: true });

async function handlePush(event) {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : "" }; }
  const type = d.type || "message";

  // アプリを開いて見ている間は、アプリ内の表示（着信画面・効果音・バッジ）に任せて二重に出さない。
  // リマインダーは時刻が大事なので常に出す。
  const visible = (await windows()).find((c) => c.visibilityState === "visible");
  const skip = visible && !d.force && type !== "reminder";
  if (skip && !STRICT_PUSH) { visible.postMessage({ type: "push", payload: d }); return; }

  const options = {
    body: d.body || "",
    tag: d.tag || undefined,
    icon: ICON,
    badge: ICON,
    data: { url: d.url || "/", type },
    timestamp: d.ts || Date.now(),
    // 同じ tag の通知を置き換えるとき（着信 → 不在着信など）に、もう一度音・振動を鳴らす
    renotify: !!(d.renotify && d.tag),
    // 着信は、応答/拒否するまで通知を消さない
    requireInteraction: !!d.requireInteraction,
    // 端末の振動パターン（Android）。iOSは対応していません
    vibrate: Array.isArray(d.vibrate) ? d.vibrate : undefined,
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : undefined,
  };
  if (skip && STRICT_PUSH) { // iOS: 表示はするが静かにして、すぐ閉じる
    options.silent = true; options.vibrate = undefined; options.requireInteraction = false;
    await self.registration.showNotification(d.title || "お知らせ", options);
    await new Promise((r) => setTimeout(r, 2500));
    (await self.registration.getNotifications({ tag: options.tag })).forEach((n) => n.close());
    return;
  }
  await self.registration.showNotification(d.title || "お知らせ", options);
}

self.addEventListener("push", (event) => event.waitUntil(handlePush(event)));

// 通知タップ → 開いているタブがあればそこへ（再読み込みせず、アプリ側へ移動指示を送る）。なければ新規に開く
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const target = new URL(url, self.location.origin);
    for (const c of await windows()) {
      if (new URL(c.url).origin === target.origin && "focus" in c) {
        try { await c.focus(); } catch (e) { /* 無視 */ }
        c.postMessage({ type: "notification-click", url: target.pathname + target.search });
        return;
      }
    }
    await self.clients.openWindow(target.toString());
  })());
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
    await self.registration.showNotification("最新ニュース", { body: title, tag: "news", icon: ICON, data: { url: "/?open=news" } });
  } catch (e) { /* ネットワークエラーは無視 */ }
}
