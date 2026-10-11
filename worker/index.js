// Cloudflare Workers 用エントリ（chat-app.xxx.workers.dev のように「Workers」でデプロイしている場合はこちらが動きます）
// /api/* だけを Worker が処理し、それ以外は静的ファイル(build/)を返します。
// ハンドラ本体は Pages Functions と共通（functions/ 配下）なので、Pages でデプロイしても同じ動作です。
//  ※ Pages では Cron が使えないため、リマインダー通知は Workers 構成でのみ動きます。
import { onRequest as news } from "../functions/api/news.js";
import { onRequestGet as providers } from "../functions/api/pay/providers.js";
import { onRequestPost as checkout } from "../functions/api/pay/checkout.js";
import { onRequestPost as confirm } from "../functions/api/pay/confirm.js";
import { onRequestPost as webhook } from "../functions/api/pay/webhook/[provider].js";
import { onRequestGet as payReturnGet, onRequestPost as payReturnPost } from "../functions/api/pay/return.js";
import { onRequestGet as diag } from "../functions/api/diag.js";
import { onRequestGet as pushKey } from "../functions/api/push/key.js";
import { onRequestPost as pushSubscribe } from "../functions/api/push/subscribe.js";
import { onRequestPost as pushPrefs } from "../functions/api/push/prefs.js";
import { onRequestPost as pushNotify } from "../functions/api/push/notify.js";
import { onRequestPost as hooksManage } from "../functions/api/hooks/manage.js";
import { onRequestPost as hookReceive } from "../functions/api/hooks/[token].js";
import { onRequestPost as reminders } from "../functions/api/reminders.js";
import { onRequestGet as ogp } from "../functions/api/ogp.js";
import { onRequestGet as tools } from "../functions/api/tools/[name].js";
import { processReminders } from "../functions/_lib/cron.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// [メソッド, パス(完全一致 or 正規表現), ハンドラ]
const ROUTES = [
  ["ANY", "/api/news", news],
  ["GET", "/api/diag", diag],
  ["GET", "/api/pay/providers", providers],
  ["POST", "/api/pay/checkout", checkout],
  ["POST", "/api/pay/confirm", confirm],
  ["POST", "/api/pay/return", payReturnPost], // fincode は決済後に POST でリダイレクトしてくる
  ["GET", "/api/pay/return", payReturnGet],
  ["POST", /^\/api\/pay\/webhook\/([a-z0-9_-]+)$/, (c, m) => webhook({ ...c, params: { provider: m[1] } })],
  ["GET", "/api/push/key", pushKey],
  ["POST", "/api/push/subscribe", pushSubscribe],
  ["POST", "/api/push/prefs", pushPrefs],
  ["POST", "/api/push/notify", pushNotify],
  ["POST", "/api/hooks/manage", hooksManage],
  ["POST", /^\/api\/hooks\/([a-f0-9]{32})$/, (c, m) => hookReceive({ ...c, params: { token: m[1] } })],
  ["POST", "/api/reminders", reminders],
  ["GET", "/api/ogp", ogp],
  ["GET", /^\/api\/tools\/([a-z]+)$/, (c, m) => tools({ ...c, params: { name: m[1] } })],
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const method = request.method;
    const context = { request, env, ctx, params: {} };

    if (path.startsWith("/api/")) {
      try {
        for (const [m, p, handler] of ROUTES) {
          if (m !== "ANY" && m !== method) continue;
          const match = typeof p === "string" ? (p === path ? [] : null) : p.exec(path);
          if (match) return await handler(context, match);
        }
        return json({ error: "not found" }, 404);
      } catch (e) {
        return json({ error: e?.message || "internal error" }, 500);
      }
    }

    // それ以外は静的ファイル（SPA）
    return env.ASSETS.fetch(request);
  },

  // Cron Trigger（wrangler.jsonc の triggers.crons）: 毎分、時刻になったリマインダーを通知
  async scheduled(event, env, ctx) {
    ctx.waitUntil(processReminders(env).catch((e) => console.error("reminders", e)));
  },
};
