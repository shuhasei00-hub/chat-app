// 外部サイト連携: Webhook の URL を発行すると、外部のサイト/サービスからトークへメッセージを投稿できる
// （IFTTT / Zapier / Make / GitHub Actions / 自作スクリプトなど）
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plug, Copy, Trash2, Send, Loader2, Plus } from "lucide-react";
import { PageHeader, EmptyState, Spinner } from "./common";

const api = async (user, body) => {
  const token = await user.getIdToken();
  const res = await fetch("/api/hooks/manage", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "通信に失敗しました");
  return data;
};

const IntegrationsView = ({ user, chats, allUsers, setView, showNotification }) => {
  const [hooks, setHooks] = useState(null);
  const [origin, setOrigin] = useState(window.location.origin);
  const [chatId, setChatId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [created, setCreated] = useState(null);
  const [error, setError] = useState("");

  const chatLabel = useCallback((c) => {
    if (!c) return "（削除されたトーク）";
    if (c.isGroup) return c.name || "グループ";
    return allUsers?.find((u) => u.uid === (c.participants || []).find((p) => p !== user.uid))?.name || "トーク";
  }, [allUsers, user.uid]);
  const myChats = useMemo(() => (chats || []).filter((c) => (c.participants || []).includes(user.uid)), [chats, user.uid]);

  const load = useCallback(async () => {
    try { const d = await api(user, { action: "list" }); setHooks(d.hooks); if (d.origin) setOrigin(d.origin); setError(""); }
    catch (e) { setHooks([]); setError(e.message); }
  }, [user]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!chatId && myChats[0]) setChatId(myChats[0].id); }, [myChats, chatId]);

  const urlOf = (token) => `${origin}/api/hooks/${token}`;
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => showNotification?.("コピーしました")).catch(() => showNotification?.("コピーできませんでした"));

  const create = async () => {
    if (!chatId) return showNotification?.("投稿先のトークを選んでください");
    setBusy("create");
    try {
      const d = await api(user, { action: "create", chatId, name });
      setCreated(d.url);
      setName("");
      await load();
    } catch (e) { showNotification?.(e.message); }
    setBusy("");
  };
  const remove = async (token) => {
    if (!window.confirm("この連携を削除しますか？（このURLへの投稿は届かなくなります）")) return;
    try { await api(user, { action: "delete", token }); setCreated(null); await load(); } catch (e) { showNotification?.(e.message); }
  };
  const test = async (token) => {
    setBusy(token);
    try {
      const res = await fetch(urlOf(token), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "テスト", text: "外部連携からのテスト投稿です ✅" }) });
      const d = await res.json().catch(() => ({}));
      showNotification?.(res.ok ? "テスト投稿しました" : d.error || "失敗しました");
    } catch { showNotification?.("通信に失敗しました"); }
    setBusy("");
  };

  const sample = created ? `curl -X POST '${created}' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"title":"デプロイ完了","text":"本番に反映しました"}'` : "";

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title="外部サイト連携" onBack={() => setView("services")} />
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-24">
        <div className="m-4 p-4 bg-white rounded-2xl shadow-sm text-xs text-gray-600 leading-relaxed">
          <div className="flex items-center gap-2 font-bold text-sm text-gray-800 mb-1"><Plug className="w-4 h-4 text-green-600" />Webhook（受信URL）</div>
          発行したURLにPOSTすると、選んだトークにメッセージが届き、プッシュ通知も飛びます。
          IFTTT・Zapier・Make・GitHub Actions・Slack/Discord互換のWebhookなどから使えます。
          <span className="text-red-500 font-bold"> URLを知っている人は誰でも投稿できるため、他人に教えないでください。</span>
        </div>

        <div className="mx-4 bg-white rounded-2xl p-4 shadow-sm">
          <label className="text-[11px] font-bold text-gray-400">投稿先のトーク</label>
          <select value={chatId} onChange={(e) => setChatId(e.target.value)} className="w-full bg-gray-100 rounded-xl px-3 py-3 text-sm outline-none mt-1">
            {myChats.length === 0 && <option value="">トークがありません</option>}
            {myChats.map((c) => <option key={c.id} value={c.id}>{chatLabel(c)}</option>)}
          </select>
          <label className="text-[11px] font-bold text-gray-400 mt-3 block">表示名（任意）</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="例: GitHub通知 / 天気Bot" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none mt-1" />
          <button disabled={busy === "create" || !chatId} onClick={create} className="w-full mt-3 py-3 rounded-xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            {busy === "create" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}連携URLを発行
          </button>
          {created && (
            <div className="mt-3 p-3 bg-green-50 rounded-xl">
              <div className="text-[11px] font-bold text-green-700 mb-1">発行しました。URLをコピーして外部サービスに設定してください</div>
              <div className="text-[11px] break-all bg-white rounded-lg p-2 border">{created}</div>
              <button onClick={() => copy(created)} className="mt-2 text-xs font-bold text-green-700 flex items-center gap-1"><Copy className="w-3 h-3" />URLをコピー</button>
              <pre className="mt-2 text-[10px] bg-gray-900 text-green-300 rounded-lg p-2 overflow-x-auto whitespace-pre">{sample}</pre>
              <button onClick={() => copy(sample)} className="mt-1 text-xs font-bold text-green-700 flex items-center gap-1"><Copy className="w-3 h-3" />サンプルをコピー</button>
            </div>
          )}
        </div>

        <div className="px-4 mt-5 mb-2 text-xs font-bold text-gray-400">発行済みの連携</div>
        {hooks === null && <Spinner />}
        {hooks && hooks.length === 0 && <EmptyState icon={<Plug className="w-10 h-10" />} title="連携はまだありません" hint={error ? `※ ${error}` : undefined} />}
        <div className="px-4 space-y-2">
          {(hooks || []).map((h) => (
            <div key={h.token} className="bg-white rounded-2xl p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{h.name}</div>
                  <div className="text-[11px] text-gray-400 truncate">→ {chatLabel((chats || []).find((c) => c.id === h.chatId))}</div>
                </div>
                <button onClick={() => test(h.token)} disabled={busy === h.token} className="p-2 text-green-600" aria-label="テスト投稿">{busy === h.token ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button>
                <button onClick={() => copy(urlOf(h.token))} className="p-2 text-gray-500" aria-label="URLをコピー"><Copy className="w-4 h-4" /></button>
                <button onClick={() => remove(h.token)} className="p-2 text-gray-300 hover:text-red-500" aria-label="削除"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default IntegrationsView;
