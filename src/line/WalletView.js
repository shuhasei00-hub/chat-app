// ウォレット（コインの残高 / 送金 / 履歴 / ログインボーナス）
import React, { useEffect, useMemo, useState } from "react";
import { Send, Gift, ArrowUpRight, ArrowDownLeft, Coins, Loader2, CreditCard } from "lucide-react";
import { doc, increment, limit, onSnapshot, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { PageHeader, EmptyState, dataCol, dataDoc, toMillis, formatDateTime, ymd, DAILY_BONUS } from "./common";

const WalletView = ({ user, profile, allUsers, chats, db, appId, setView, showNotification }) => {
  const [me, setMe] = useState(null);
  const [txs, setTxs] = useState([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u1 = onSnapshot(dataDoc(db, appId, "users", user.uid), (s) => setMe(s.data() || null), console.error);
    const u2 = onSnapshot(query(dataCol(db, appId, "wallet_tx"), where("participants", "array-contains", user.uid), limit(100)),
      (s) => setTxs(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))), console.error);
    return () => { u1(); u2(); };
  }, [db, appId, user.uid]);

  const balance = me?.wallet ?? profile?.wallet ?? 0;
  const today = ymd(new Date());
  const bonusDone = me?.lastBonusDate === today;

  const friends = useMemo(() => {
    const keys = new Set(profile?.friends || []);
    (chats || []).forEach((c) => {
      if (c?.isGroup || !Array.isArray(c?.participants) || !c.participants.includes(user.uid)) return;
      const o = c.participants.find((p) => p && p !== user.uid);
      if (o) keys.add(o);
    });
    const hidden = new Set(profile?.hiddenFriends || []);
    return (allUsers || []).filter((u) => u.uid && u.uid !== user.uid && (keys.has(u.uid) || keys.has(u.id)) && !hidden.has(u.uid));
  }, [allUsers, chats, profile?.friends, profile?.hiddenFriends, user.uid]);

  const nameOf = (uid) => (uid === "system" ? "ボーナス" : allUsers?.find((u) => u.uid === uid)?.name || "不明なユーザー");

  const claimBonus = async () => {
    setBusy(true);
    try {
      await runTransaction(db, async (t) => {
        const ref = dataDoc(db, appId, "users", user.uid);
        const s = await t.get(ref);
        if (s.data()?.lastBonusDate === today) throw new Error("already");
        t.update(ref, { wallet: increment(DAILY_BONUS), lastBonusDate: today });
        t.set(doc(dataCol(db, appId, "wallet_tx")), {
          type: "bonus", fromUid: "system", toUid: user.uid, participants: [user.uid], amount: DAILY_BONUS, note: "ログインボーナス", createdAt: serverTimestamp(),
        });
      });
      showNotification?.(`ログインボーナス ${DAILY_BONUS}コイン獲得！`);
    } catch (e) {
      showNotification?.(e.message === "already" ? "今日はもう受け取り済みです" : "受け取りに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const val = parseInt(amount, 10);
    if (!target) return showNotification?.("送り先を選んでください");
    if (!Number.isInteger(val) || val <= 0) return showNotification?.("1以上の整数を入力してください");
    if (val > balance) return showNotification?.("残高が足りません");
    setBusy(true);
    try {
      await runTransaction(db, async (t) => {
        const sRef = dataDoc(db, appId, "users", user.uid);
        const rRef = dataDoc(db, appId, "users", target.uid);
        const [s, r] = await Promise.all([t.get(sRef), t.get(rRef)]);
        if (!r.exists()) throw new Error("相手が見つかりません");
        if ((s.data()?.wallet || 0) < val) throw new Error("残高不足");
        t.update(sRef, { wallet: increment(-val) });
        t.update(rRef, { wallet: increment(val) });
        t.set(doc(dataCol(db, appId, "wallet_tx")), {
          type: "transfer", fromUid: user.uid, toUid: target.uid, participants: [user.uid, target.uid], amount: val, note: note.trim().slice(0, 40), createdAt: serverTimestamp(),
        });
      });
      showNotification?.(`${target.name}さんに ${val}コイン送りました`);
      setSendOpen(false); setTarget(null); setAmount(""); setNote("");
    } catch (e) {
      showNotification?.("送金エラー: " + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title="ウォレット" />
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-24">
        <div className="m-4 rounded-3xl bg-gradient-to-br from-green-500 to-emerald-600 text-white p-5 shadow-lg">
          <div className="text-xs opacity-80 flex items-center gap-1"><Coins className="w-4 h-4" />コイン残高</div>
          <div className="text-4xl font-black mt-1">{Number(balance).toLocaleString()}</div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setView("charge")} className="flex-1 bg-white text-green-600 rounded-2xl py-3 text-sm font-bold flex items-center justify-center gap-2"><CreditCard className="w-4 h-4" />チャージ</button>
            <button onClick={() => setSendOpen(true)} className="flex-1 bg-white/20 hover:bg-white/30 rounded-2xl py-3 text-sm font-bold flex items-center justify-center gap-2"><Send className="w-4 h-4" />送る</button>
            <button disabled={busy || bonusDone} onClick={claimBonus} className="flex-1 bg-white/20 hover:bg-white/30 disabled:opacity-50 rounded-2xl py-3 text-sm font-bold flex items-center justify-center gap-2">
              <Gift className="w-4 h-4" />{bonusDone ? "受取済み" : `ボーナス +${DAILY_BONUS}`}
            </button>
          </div>
        </div>

        <div className="px-4 text-xs font-bold text-gray-400 mb-2">利用履歴</div>
        <div className="bg-white border-y divide-y">
          {txs.length === 0 && <EmptyState title="履歴はまだありません" />}
          {txs.map((t) => {
            const out = t.fromUid === user.uid && t.type === "transfer";
            const label = t.type === "topup" ? "コインチャージ" : t.type === "bonus" ? "ログインボーナス" : out ? `${nameOf(t.toUid)}さんへ送金` : `${nameOf(t.fromUid)}さんから受取`;
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${out ? "bg-red-50 text-red-400" : "bg-green-50 text-green-500"}`}>
                  {out ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{label}</div>
                  <div className="text-[11px] text-gray-400 truncate">{formatDateTime(toMillis(t.createdAt))}{t.note ? ` ・ ${t.note}` : ""}</div>
                </div>
                <div className={`font-bold ${out ? "text-gray-800" : "text-green-600"}`}>{out ? "-" : "+"}{Number(t.amount).toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      </div>

      {sendOpen && (
        <div className="fixed inset-0 z-[300] bg-black/50 flex items-end justify-center" onClick={() => !busy && setSendOpen(false)}>
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl p-5 space-y-3 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold">コインを送る</div>
            <div className="overflow-y-auto border rounded-2xl divide-y max-h-48 shrink-0">
              {friends.length === 0 && <div className="text-xs text-gray-400 p-4 text-center">送れる友だちがいません</div>}
              {friends.map((f) => (
                <button key={f.uid} onClick={() => setTarget(f)} className={`w-full flex items-center gap-3 px-3 py-2 text-left ${target?.uid === f.uid ? "bg-green-50" : ""}`}>
                  <img src={f.avatar} alt="" className="w-9 h-9 rounded-xl object-cover border" />
                  <span className="flex-1 text-sm font-bold truncate">{f.name}</span>
                  {target?.uid === f.uid && <span className="text-green-500 text-xs font-bold">選択中</span>}
                </button>
              ))}
            </div>
            <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金額（コイン）" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none" />
            <input value={note} maxLength={40} onChange={(e) => setNote(e.target.value)} placeholder="メッセージ（任意）" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none" />
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => setSendOpen(false)} className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-sm text-gray-600">キャンセル</button>
              <button disabled={busy} onClick={send} className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "送る"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletView;
