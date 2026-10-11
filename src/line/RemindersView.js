// リマインダー: 指定した日時に、アプリを閉じていてもプッシュ通知でお知らせ（サーバーの Cron が送信）
import React, { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Trash2, Plus, Loader2 } from "lucide-react";
import { PageHeader, EmptyState, Spinner, formatDateTime, pad2 } from "./common";
import { ensurePushReady, pushSupported } from "./pushClient";

const api = async (user, body) => {
  const token = await user.getIdToken();
  const res = await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "通信に失敗しました");
  return data;
};

const toLocalInput = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const tomorrow9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); };

const RemindersView = ({ user, setView, showNotification }) => {
  const [items, setItems] = useState(null);
  const [text, setText] = useState("");
  const [due, setDue] = useState(() => toLocalInput(Date.now() + 3600 * 1000));
  const [busy, setBusy] = useState(false);
  const [notReady, setNotReady] = useState(null);

  const load = useCallback(async () => {
    try { setItems((await api(user, { action: "list" })).reminders); }
    catch (e) { setItems([]); setNotReady(e.message); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const t = text.trim();
    if (!t) return showNotification?.("内容を入力してください");
    const ms = new Date(due).getTime();
    if (!Number.isFinite(ms) || ms < Date.now()) return showNotification?.("未来の日時を指定してください");
    setBusy(true);
    try {
      const ready = await ensurePushReady(user); // 通知が前提の機能なので、許可・購読までここで済ませる
      await api(user, { action: "create", text: t, dueAt: ms });
      setText("");
      await load();
      showNotification?.(ready.ok ? "リマインダーを登録しました" : "登録しました（この端末の通知がオフのため、通知は届きません）");
    } catch (e) { showNotification?.(e.message); }
    setBusy(false);
  };

  const remove = async (id) => {
    setItems((cur) => (cur || []).filter((r) => r.id !== id));
    try { await api(user, { action: "delete", id }); } catch { load(); }
  };

  const quick = (label, ms) => (
    <button key={label} onClick={() => setDue(toLocalInput(ms))} className="px-3 py-1.5 rounded-full bg-gray-100 text-xs font-bold text-gray-600 shrink-0">{label}</button>
  );

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title="リマインダー" onBack={() => setView("services")} />
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-24">
        <div className="m-4 bg-white rounded-2xl p-4 shadow-sm">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="何を通知しますか？（例: 薬を飲む）" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none" />
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none mt-2" />
          <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-hide">
            {quick("10分後", Date.now() + 10 * 60000)}
            {quick("1時間後", Date.now() + 3600000)}
            {quick("今夜20時", (() => { const d = new Date(); d.setHours(20, 0, 0, 0); return d.getTime() < Date.now() ? d.getTime() + 86400000 : d.getTime(); })())}
            {quick("明日9時", tomorrow9())}
          </div>
          <button disabled={busy} onClick={add} className="w-full mt-3 py-3 rounded-xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}登録
          </button>
          {!pushSupported() && <p className="text-[11px] text-orange-500 mt-2">このブラウザはプッシュ通知に対応していません（iPhoneは「ホーム画面に追加」したアプリで利用できます）。</p>}
        </div>

        <div className="px-4 text-xs font-bold text-gray-400 mb-2">予定されたリマインダー</div>
        {items === null && <Spinner />}
        {items && items.length === 0 && (
          <EmptyState icon={<Bell className="w-10 h-10" />} title="リマインダーはありません" hint={notReady ? `※ ${notReady}` : "時刻になるとプッシュ通知でお知らせします"} />
        )}
        <div className="px-4 space-y-2">
          {(items || []).map((r) => (
            <div key={r.id} className="bg-white rounded-2xl p-3 shadow-sm flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center"><BellRing className="w-5 h-5" /></span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold break-words">{r.text}</div>
                <div className="text-[11px] text-gray-400">{formatDateTime(r.dueAt)}</div>
              </div>
              <button onClick={() => remove(r.id)} aria-label="削除" className="p-2 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RemindersView;
