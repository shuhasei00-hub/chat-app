// POST /api/pay/confirm  { ref }  — 支払い状態を事業者に問い合わせ、支払い済みならコインを加算
import { requireUser } from "../../_lib/auth.js";
import { confirmPayment } from "../../_lib/pay.js";
import { json } from "../../_lib/util.js";

export const onRequestPost = async ({ env, request }) => {
  try {
    const uid = await requireUser(env, request);
    const { ref } = await request.json().catch(() => ({}));
    if (!ref || !/^[a-f0-9]{32}$/.test(ref)) return json({ error: "ref が不正です" }, 400);
    return json(await confirmPayment(env, ref, uid));
  } catch (e) {
    return json({ error: e.message || "error" }, e.status || 500);
  }
};
