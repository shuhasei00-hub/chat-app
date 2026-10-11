// GET /api/push/key — ブラウザが購読に使う VAPID 公開鍵（公開してよい値）
import { json } from "../../_lib/util.js";

export const onRequestGet = ({ env }) =>
  json({ publicKey: env.VAPID_PUBLIC_KEY || null, enabled: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) });
