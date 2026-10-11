// 支払いの状態確認 → 入金（冪等）
import { getDoc, patchDoc, settlePayment } from "./firestore.js";
import { PROVIDERS } from "./providers/index.js";
import { HttpError } from "./util.js";

export const confirmPayment = async (env, ref, uid) => {
  const p = await getDoc(env, "payments", ref);
  if (!p) throw new HttpError(404, "支払い情報が見つかりません");
  if (uid && p.uid !== uid) throw new HttpError(403, "この支払いは確認できません");
  if (p.status === "paid" || p.status === "failed") return { status: p.status, coins: p.coins };
  const provider = PROVIDERS[p.provider];
  if (!provider) throw new HttpError(500, "未知の決済プロバイダです");
  const result = await provider.check(env, { ...p, ref });
  if (result === "paid") {
    try {
      await settlePayment(env, p, ref);
    } catch (e) {
      if (e.status === 409) return { status: "paid", coins: p.coins }; // 別のリクエストが先に入金済み
      throw e;
    }
    return { status: "paid", coins: p.coins };
  }
  if (result === "failed") {
    await patchDoc(env, ["payments", ref], { status: "failed" }, p.__updateTime).catch(() => {});
    return { status: "failed", coins: p.coins };
  }
  return { status: "pending", coins: p.coins };
};
