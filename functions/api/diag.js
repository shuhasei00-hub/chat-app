// GET /api/diag — 接続診断（秘密情報は返さず「設定済みか」だけ返します）
import { listProviders } from "../_lib/providers/index.js";
import { json } from "../_lib/util.js";

export const onRequestGet = ({ env, request }) =>
  json({
    ok: true,
    time: new Date().toISOString(),
    origin: new URL(request.url).origin,
    appUrl: env.APP_URL || null,
    config: {
      FIREBASE_API_KEY: !!env.FIREBASE_API_KEY,
      FIREBASE_SERVICE_ACCOUNT: !!env.FIREBASE_SERVICE_ACCOUNT,
      FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID || "(既定 chat-app-c17bf)",
      APP_ID: env.APP_ID || "(既定 messenger-app-v9-integrated)",
      VAPID_PUBLIC_KEY: !!env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: !!env.VAPID_PRIVATE_KEY,
      FINCODE_ENV: env.FINCODE_SECRET_KEY ? (env.FINCODE_ENV === "live" ? "live（本番）" : "test（テスト）") : "(fincode未設定)",
      VAPID_SUBJECT: env.VAPID_SUBJECT || "(未設定 → mailto:admin@example.com)",
    },
    push: { enabled: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.FIREBASE_SERVICE_ACCOUNT) },
    providers: listProviders(env).map((p) => ({ id: p.id, name: p.name, enabled: p.enabled, methods: p.methods })),
  });
