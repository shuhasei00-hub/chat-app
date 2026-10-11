// コインチャージ（外部決済サービス連携）+ 決済からの戻り処理 + 入金通知
import React, { useCallback, useEffect, useRef, useState } from "react";
import { CreditCard, Store, Loader2, RefreshCw, ExternalLink, CheckCircle2, Clock, XCircle } from "lucide-react";
import { onSnapshot, query, where } from "firebase/firestore";
import { PageHeader, EmptyState, Spinner, dataCol, toMillis, formatDateTime } from "./common";
import { showNotice, goTo } from "./notify";

const apiHeaders = async (user) => ({ "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}` });

const METHOD_LABEL = {
  card: "カード", credit_card: "カード", konbini: "コンビニ", paypay: "PayPay", pay_easy: "Pay-easy",
  bank_transfer: "銀行振込", paypal: "PayPal",
};
const PROVIDER_NAME = { stripe: "Stripe", komoju: "KOMOJU", paypal: "PayPal", square: "Square", payjp: "PAY.JP" };

const STATUS = {
  pending: { label: "支払い待ち", cls: "text-amber-600 bg-amber-50", Icon: Clock },
  paid: { label: "入金済み", cls: "text-green-600 bg-green-50", Icon: CheckCircle2 },
  failed: { label: "失効・失敗", cls: "text-gray-500 bg-gray-100", Icon: XCircle },
};

export const confirmPayment = async (user, ref) => {
  const res = await fetch("/api/pay/confirm", { method: "POST", headers: await apiHeaders(user), body: JSON.stringify({ ref }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `http ${res.status}`);
  return data; // { status: pending|paid|failed, coins }
};

// 決済ページから戻ったとき(/?pay=return&ref=...)の確認 + 支払い状態の変化をアプリ内通知/端末通知で知らせる
export const PaymentWatcher = ({ user, db, appId, setView, showNotification }) => {
  const prev = useRef(null);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const pay = params.get("pay");
    const ref = params.get("ref");
    if (!pay) return;
    ["pay", "ref"].forEach((k) => params.delete(k));
    const q = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""));
    goTo(setView, "charge");
    if (pay === "cancel") return showNotification?.("お支払いをキャンセルしました");
    if (!/^[a-f0-9]{32}$/.test(ref || "")) return;
    confirmPayment(user, ref)
      .then((r) => showNotification?.(r.status === "paid" ? "チャージが完了しました" : "お支払いの確認待ちです（コンビニ払いは入金後に反映されます）"))
      .catch(() => showNotification?.("お支払いの確認に失敗しました。チャージ画面で再確認できます"));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(query(dataCol(db, appId, "payments"), where("uid", "==", user.uid)), (snap) => {
      const next = {};
      snap.docs.forEach((d) => { next[d.id] = d.data().status; });
      if (prev.current) {
        snap.docs.forEach((d) => {
          const was = prev.current[d.id];
          if (d.data().status === "paid" && was && was !== "paid") {
            const c = Number(d.data().coins).toLocaleString();
            showNotification?.(`${c}コインがチャージされました`);
            showNotice("チャージ完了", `${c}コインがウォレットに反映されました`, { tag: `pay-${d.id}`, url: "/?open=wallet" });
          }
        });
      }
      prev.current = next;
    }, () => {});
  }, [user, db, appId]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

const ChargeView = ({ user, db, appId, setView, showNotification }) => {
  const [conf, setConf] = useState(null); // { providers, packs }
  const [loadErr, setLoadErr] = useState(false);
  const [packId, setPackId] = useState("p1000");
  const [busy, setBusy] = useState("");
  const [payments, setPayments] = useState([]);

  const loadConf = useCallback(async () => {
    setLoadErr(false);
    try {
      const res = await fetch("/api/pay/providers");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.providers)) throw new Error("bad");
      setConf(data);
      if (!data.packs.some((p) => p.id === packId)) setPackId(data.packs[0]?.id);
    } catch { setLoadErr(true); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadConf(); }, [loadConf]);

  useEffect(() => onSnapshot(query(dataCol(db, appId, "payments"), where("uid", "==", user.uid)),
    (s) => setPayments(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)).slice(0, 30)),
    console.error), [db, appId, user.uid]);

  const pay = async (provider) => {
    setBusy(provider.id);
    try {
      const res = await fetch("/api/pay/checkout", { method: "POST", headers: await apiHeaders(user), body: JSON.stringify({ provider: provider.id, packId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || `http ${res.status}`);
      window.location.assign(data.url); // 事業者のホスト型決済ページへ
    } catch (e) {
      showNotification?.("決済を開始できませんでした: " + (e.message || e));
      setBusy("");
    }
  };

  const recheck = async (p) => {
    setBusy(p.id);
    try {
      const r = await confirmPayment(user, p.id);
      showNotification?.(r.status === "paid" ? "入金を確認しました" : r.status === "failed" ? "この支払いは失効しました" : "まだ入金が確認できていません");
    } catch (e) { showNotification?.("確認に失敗しました"); }
    setBusy("");
  };

  const pack = conf?.packs?.find((p) => p.id === packId);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title="コインチャージ" onBack={() => setView("wallet")} />
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-24">
        {!conf && !loadErr && <Spinner />}
        {loadErr && <EmptyState icon={<CreditCard className="w-10 h-10" />} title="決済サービスに接続できませんでした" hint="Cloudflare Pages にデプロイした環境（/api/pay）で利用できます。" />}
        {conf && (
          <>
            <div className="px-4 pt-4 text-xs font-bold text-gray-400 mb-2">チャージ額</div>
            <div className="grid grid-cols-2 gap-2 px-4">
              {conf.packs.map((p) => (
                <button key={p.id} onClick={() => setPackId(p.id)} className={`rounded-2xl border-2 px-3 py-3 text-left bg-white ${packId === p.id ? "border-green-500" : "border-transparent"}`}>
                  <div className="font-black text-lg">¥{p.yen.toLocaleString()}</div>
                  <div className="text-[11px] text-gray-500">{p.label}</div>
                </button>
              ))}
            </div>

            <div className="px-4 pt-5 text-xs font-bold text-gray-400 mb-2">お支払い方法を選ぶ</div>
            <div className="mx-4 bg-white rounded-2xl border divide-y overflow-hidden">
              {conf.providers.map((p) => (
                <button key={p.id} disabled={!p.enabled || !!busy || !pack} onClick={() => pay(p)} className="w-full flex items-center gap-3 px-4 py-3 text-left disabled:opacity-50">
                  <span className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                    {p.methods.includes("konbini") ? <Store className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold">{p.name}{!p.enabled && <span className="ml-2 text-[10px] font-normal text-gray-400">準備中</span>}</span>
                    <span className="flex flex-wrap gap-1 mt-1">
                      {[...new Set(p.methods.map((m) => METHOD_LABEL[m] || m))].map((m) => (
                        <span key={m} className={`text-[10px] px-1.5 py-0.5 rounded ${m === "コンビニ" ? "bg-amber-50 text-amber-700 font-bold" : "bg-gray-100 text-gray-500"}`}>{m}</span>
                      ))}
                    </span>
                  </span>
                  {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <ExternalLink className="w-4 h-4 text-gray-300" />}
                </button>
              ))}
            </div>
            <p className="px-5 pt-2 text-[11px] text-gray-400 leading-relaxed">
              コンビニ払いは、決済ページに表示される番号で店頭にてお支払いください。入金が確認でき次第、コインが自動で反映され通知されます（最大数分〜数時間）。
            </p>
          </>
        )}

        <div className="px-4 pt-5 text-xs font-bold text-gray-400 mb-2">チャージ履歴</div>
        <div className="bg-white border-y divide-y">
          {payments.length === 0 && <EmptyState title="履歴はまだありません" />}
          {payments.map((p) => {
            const st = STATUS[p.status] || STATUS.pending;
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 ${st.cls}`}><st.Icon className="w-3 h-3" />{st.label}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">¥{Number(p.yen).toLocaleString()} → {Number(p.coins).toLocaleString()}コイン</div>
                  <div className="text-[11px] text-gray-400">{PROVIDER_NAME[p.provider] || p.provider} ・ {formatDateTime(toMillis(p.createdAt))}</div>
                </div>
                {p.status === "pending" && (
                  <div className="flex gap-1">
                    {p.url && <a href={p.url} className="p-2 rounded-full hover:bg-gray-100 text-gray-400" aria-label="支払いページを開く"><ExternalLink className="w-4 h-4" /></a>}
                    <button disabled={busy === p.id} onClick={() => recheck(p)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400" aria-label="入金を確認"><RefreshCw className={`w-4 h-4 ${busy === p.id ? "animate-spin" : ""}`} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChargeView;
