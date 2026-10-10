// Keep: 自分だけのメモ / リンク / 画像の保存場所
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Pin, Trash2, Image as ImageIcon, Send, Copy, Search } from "lucide-react";
import { addDoc, deleteDoc, onSnapshot, query, updateDoc, where, serverTimestamp } from "firebase/firestore";
import { PageHeader, EmptyState, dataCol, dataDoc, toMillis, formatDateTime, compressImage, linkify } from "./common";

const FILTERS = [
  { id: "all", label: "すべて" },
  { id: "text", label: "メモ" },
  { id: "link", label: "リンク" },
  { id: "image", label: "画像" },
];

const KeepView = ({ user, db, appId, setView, showNotification }) => {
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    // 複合インデックス不要にするため where 1つだけ。並び替えはクライアント側で行う
    const q = query(dataCol(db, appId, "keep"), where("ownerUid", "==", user.uid));
    return onSnapshot(q, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
  }, [db, appId, user.uid]);

  const add = async () => {
    const content = text.trim();
    if (!content) return;
    try {
      await addDoc(dataCol(db, appId, "keep"), {
        ownerUid: user.uid,
        type: /https?:\/\//.test(content) ? "link" : "text",
        content,
        pinned: false,
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (e) {
      showNotification?.("保存に失敗しました");
    }
  };

  const addImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 900, 0.7);
      if (dataUrl.length > 900000) return showNotification?.("画像が大きすぎます");
      await addDoc(dataCol(db, appId, "keep"), {
        ownerUid: user.uid, type: "image", content: dataUrl, pinned: false, createdAt: serverTimestamp(),
      });
    } catch (err) {
      showNotification?.("画像を保存できませんでした");
    }
  };

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items
      .filter((i) => filter === "all" || i.type === filter)
      .filter((i) => !s || (i.type !== "image" && String(i.content).toLowerCase().includes(s)))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [items, filter, search]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title="Keep" onBack={() => setView("services")} />
      <div className="bg-white px-3 pt-2 pb-2 border-b shrink-0">
        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keepを検索" className="bg-transparent outline-none text-sm flex-1" />
        </div>
        <div className="flex gap-2 mt-2">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={`px-3 py-1 rounded-full text-xs font-bold ${filter === f.id ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hide">
        {visible.length === 0 && (
          <EmptyState icon={<Bookmark className="w-10 h-10" />} title="Keepは空です" hint="メモ・リンク・画像を自分用に保存できます" />
        )}
        {visible.map((i) => (
          <div key={i.id} className="bg-white rounded-2xl border shadow-sm p-3">
            {i.type === "image" ? (
              <img src={i.content} alt="" className="w-full rounded-xl max-h-72 object-cover" />
            ) : (
              <div className="text-sm whitespace-pre-wrap break-words">{linkify(i.content)}</div>
            )}
            <div className="flex items-center mt-2 text-gray-400">
              <span className="text-[10px] flex-1">{formatDateTime(toMillis(i.createdAt))}</span>
              {i.type !== "image" && (
                <button className="p-1.5" aria-label="コピー" onClick={() => navigator.clipboard?.writeText(i.content).then(() => showNotification?.("コピーしました"))}>
                  <Copy className="w-4 h-4" />
                </button>
              )}
              <button className={`p-1.5 ${i.pinned ? "text-green-500" : ""}`} aria-label="ピン留め" onClick={() => updateDoc(dataDoc(db, appId, "keep", i.id), { pinned: !i.pinned })}>
                <Pin className="w-4 h-4" />
              </button>
              <button className="p-1.5 hover:text-red-500" aria-label="削除" onClick={() => window.confirm("削除しますか？") && deleteDoc(dataDoc(db, appId, "keep", i.id))}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-2 bg-white border-t flex items-end gap-2 shrink-0">
        <button onClick={() => fileRef.current?.click()} className="p-2 text-gray-500" aria-label="画像を追加">
          <ImageIcon className="w-6 h-6" />
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={addImage} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="メモを入力"
          className="flex-1 bg-gray-100 rounded-2xl px-3 py-2 text-sm outline-none resize-none max-h-28"
        />
        <button onClick={add} disabled={!text.trim()} className="p-2 text-green-500 disabled:text-gray-300" aria-label="保存">
          <Send className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default KeepView;
