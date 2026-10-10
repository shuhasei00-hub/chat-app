// オープンチャット: 誰でも見つけて参加できる公開グループ
// 既存の「グループトーク」と同じ chats ドキュメントに isOpen:true を付けて実現しているので、
// 参加後は通常のトーク画面（スタンプ/画像/通話など）がそのまま使えます。
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Users, Camera, Hash } from "lucide-react";
import { addDoc, arrayUnion, limit, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { PageHeader, EmptyState, Spinner, dataCol, dataDoc, compressImage, toMillis } from "./common";

const CATEGORIES = ["雑談", "ゲーム", "音楽", "スポーツ", "グルメ", "勉強", "仕事", "アニメ・マンガ", "ペット", "旅行", "その他"];
const defaultIcon = (name) => `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(name || "open")}`;

const OpenChatView = ({ user, profile, db, appId, setView, setActiveChatId, showNotification }) => {
  const [rooms, setRooms] = useState(null);
  const [category, setCategory] = useState("すべて");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "雑談", maxMembers: 100, icon: "" });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const q = query(dataCol(db, appId, "chats"), where("isOpen", "==", true), limit(100));
    return onSnapshot(q, (s) => setRooms(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { console.error(e); setRooms([]); });
  }, [db, appId]);

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (rooms || [])
      .filter((r) => category === "すべて" || r.category === category)
      .filter((r) => !s || `${r.name} ${r.description || ""}`.toLowerCase().includes(s))
      .sort((a, b) => (b.participants?.length || 0) - (a.participants?.length || 0) || toMillis(b.updatedAt) - toMillis(a.updatedAt));
  }, [rooms, category, search]);

  const open = (id) => { setActiveChatId(id); setView("chatroom"); };

  const join = async (room) => {
    if (profile?.isBanned) return showNotification?.("アカウントが利用停止されています");
    if ((room.participants?.length || 0) >= (room.maxMembers || 100)) return showNotification?.("このオープンチャットは満員です");
    setBusy(true);
    try {
      await updateDoc(dataDoc(db, appId, "chats", room.id), { participants: arrayUnion(user.uid) });
      await addDoc(dataCol(db, appId, "chats", room.id, "messages"), {
        senderId: user.uid, content: `${profile?.name || "ユーザー"}が参加しました。`, type: "text", createdAt: serverTimestamp(), readBy: [user.uid],
      });
      open(room.id);
    } catch (e) {
      console.error(e);
      showNotification?.("参加できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (profile?.isBanned) return showNotification?.("アカウントが利用停止されています");
    const name = form.name.trim();
    if (!name) return showNotification?.("ルーム名を入力してください");
    setBusy(true);
    try {
      const ref = await addDoc(dataCol(db, appId, "chats"), {
        name,
        description: form.description.trim(),
        category: form.category,
        maxMembers: Math.min(500, Math.max(2, Number(form.maxMembers) || 100)),
        icon: form.icon || defaultIcon(name),
        participants: [user.uid],
        isGroup: true,
        isOpen: true,
        createdBy: user.uid,
        updatedAt: serverTimestamp(),
        lastMessage: { content: "オープンチャットを作成しました", senderId: user.uid },
      });
      await addDoc(dataCol(db, appId, "chats", ref.id, "messages"), {
        senderId: user.uid, content: `${profile?.name || "ユーザー"}がオープンチャットを作成しました。`, type: "text", createdAt: serverTimestamp(), readBy: [user.uid],
      });
      setCreating(false);
      setForm({ name: "", description: "", category: "雑談", maxMembers: 100, icon: "" });
      open(ref.id);
    } catch (e) {
      console.error(e);
      showNotification?.("作成に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const pickIcon = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try { setForm((p) => ({ ...p, icon: "" })); const d = await compressImage(f, 256, 0.7); setForm((p) => ({ ...p, icon: d })); } catch { showNotification?.("画像を読み込めませんでした"); }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <PageHeader title="オープンチャット" onBack={() => setView("services")} right={
        <button onClick={() => setCreating(true)} className="p-2 rounded-full hover:bg-gray-100 text-green-600" aria-label="作成"><Plus className="w-6 h-6" /></button>
      } />
      <div className="px-3 pt-2 shrink-0">
        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ルームを検索" className="bg-transparent outline-none text-sm flex-1" />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2">
          {["すべて", ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${category === c ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600"}`}>{c}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-6">
        {rooms === null && <Spinner />}
        {rooms !== null && list.length === 0 && (
          <EmptyState icon={<Hash className="w-10 h-10" />} title="ルームが見つかりません" hint="右上の＋から最初のオープンチャットを作ってみましょう" />
        )}
        {list.map((r) => {
          const joined = (r.participants || []).includes(user.uid);
          const count = r.participants?.length || 0;
          const full = count >= (r.maxMembers || 100);
          return (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b">
              <img src={r.icon || defaultIcon(r.name)} alt="" className="w-12 h-12 rounded-2xl object-cover bg-gray-100 border" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{r.name}</div>
                <div className="text-xs text-gray-500 truncate">{r.description || "説明はありません"}</div>
                <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2">
                  <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{count}/{r.maxMembers || 100}</span>
                  <span>{r.category || "その他"}</span>
                </div>
              </div>
              {joined ? (
                <button onClick={() => open(r.id)} className="px-4 py-1.5 rounded-full bg-green-50 text-green-600 text-xs font-bold">トーク</button>
              ) : (
                <button disabled={busy || full} onClick={() => join(r)} className="px-4 py-1.5 rounded-full bg-green-500 text-white text-xs font-bold disabled:bg-gray-300">{full ? "満員" : "参加"}</button>
              )}
            </div>
          );
        })}
      </div>

      {creating && (
        <div className="fixed inset-0 z-[300] bg-black/50 flex items-end justify-center" onClick={() => !busy && setCreating(false)}>
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold">オープンチャットを作成</div>
            <div className="flex justify-center">
              <button onClick={() => fileRef.current?.click()} className="relative" aria-label="アイコンを選択">
                <img src={form.icon || defaultIcon(form.name)} alt="" className="w-20 h-20 rounded-3xl object-cover border bg-gray-100" />
                <span className="absolute -bottom-1 -right-1 bg-green-500 text-white p-1.5 rounded-full border-2 border-white"><Camera className="w-4 h-4" /></span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickIcon} />
            </div>
            <input value={form.name} maxLength={30} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ルーム名" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none" />
            <textarea value={form.description} maxLength={200} rows={3} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="説明（任意）" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none resize-none" />
            <div className="flex gap-2">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="flex-1 bg-gray-100 rounded-xl px-3 py-3 text-sm outline-none">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input type="number" min={2} max={500} value={form.maxMembers} onChange={(e) => setForm({ ...form, maxMembers: e.target.value })} className="w-28 bg-gray-100 rounded-xl px-3 py-3 text-sm outline-none" aria-label="最大人数" />
            </div>
            <div className="flex gap-2 pt-1">
              <button disabled={busy} onClick={() => setCreating(false)} className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-sm text-gray-600">キャンセル</button>
              <button disabled={busy} onClick={create} className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm disabled:opacity-60">作成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpenChatView;
