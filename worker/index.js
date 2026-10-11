// Cloudflare Workers 用エントリ（chat-app.xxx.workers.dev のように「Workers」でデプロイしている場合はこちらが動きます）
// /api/* だけを Worker が処理し、それ以外は静的ファイル(build/)を返します。
// ハンドラ本体は Pages Functions と共通（functions/ 配下）なので、Pages でデプロイしても同じ動作です。
import { onRequest as news } from "../functions/api/news.js";
import { onRequestGet as providers } from "../functions/api/pay/providers.js";
import { onRequestPost as checkout } from "../functions/api/pay/checkout.js";
import { onRequestPost as confirm } from "../functions/api/pay/confirm.js";
import { onRequestPost as webhook } from "../functions/api/pay/webhook/[provider].js";
import { onRequestGet as diag } from "../functions/api/diag.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const method = request.method;
    const context = { request, env, ctx, params: {} };

    try {
      if (path === "/api/news") return await news(context);
      if (path === "/api/diag" && method === "GET") return await diag(context);
      if (path === "/api/pay/providers" && method === "GET") return await providers(context);
      if (path === "/api/pay/checkout" && method === "POST") return await checkout(context);
      if (path === "/api/pay/confirm" && method === "POST") return await confirm(context);
      const hook = /^\/api\/pay\/webhook\/([a-z0-9_-]+)$/.exec(path);
      if (hook && method === "POST") return await webhook({ ...context, params: { provider: hook[1] } });
      if (path.startsWith("/api/")) return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: e?.message || "internal error" }, 500);
    }

    // それ以外は静的ファイル（SPA）
    return env.ASSETS.fetch(request);
  },
};
