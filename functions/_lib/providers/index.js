// コンビニ払い（支払い票を発行して店頭で支払う方式）に対応した事業者だけを登録しています。
// カード専用の PayPal / Square / PAY.JP は _optional/ に退避してあります（使う場合はここへ import を追加）。
import stripe from "./stripe.js";
import komoju from "./komoju.js";

export const PROVIDERS = { stripe, komoju };
export const listProviders = (env) =>
  Object.values(PROVIDERS).map((p) => ({ id: p.id, name: p.name, desc: p.desc, methods: p.methods(env), enabled: p.enabled(env) }));
