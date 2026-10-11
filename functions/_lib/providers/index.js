import stripe from "./stripe.js";
import komoju from "./komoju.js";
import paypal from "./paypal.js";
import square from "./square.js";
import payjp from "./payjp.js";

export const PROVIDERS = { stripe, komoju, paypal, square, payjp };
export const listProviders = (env) =>
  Object.values(PROVIDERS).map((p) => ({ id: p.id, name: p.name, desc: p.desc, methods: p.methods(env), enabled: p.enabled(env) }));
