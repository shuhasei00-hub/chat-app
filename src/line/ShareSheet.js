// 共有ターゲット: 他のアプリ/サイトの「共有」メニューからこのアプリを選んだときに開く
// （マニフェストの share_target。Androidでアプリをインストールしている場合に利用可）
import React, { useState } from "react";
import { X, Bookmark, Loader2, Users } from "lucide-react";
import { addDoc, increment, serverTimestamp, setDoc, doc, updateDoc } from "firebase/firestore";
import { dataCol, dataDoc } from "./common";
import { pushNotify } from "./pushClient";

const uniq = (arr) => arr.filter((v, i) => v && arr.indexOf(v) === i);
export const shareText = ({ title, text, url }) => uniq([title, text, url].map((s) => String(s || "").trim())).join("\n").slice(0, 2000);

const ShareSheet = ({ share, user, chats, allUsers, db, appId, onClose, showNotification }) => {
  const [busy, setBusy] = useState("");
  const content = shareText(share);

  const label = (c) => {
    if (c.isGroup) return { name: c.name || "グループ", avatar: c.icon };
    const other = allUsers?.find((u) => u.uid === (c.participants || []).find((p) => p !== user.uid));
    return { name: other?.name || "トーク", avatar: other?.avatar };
  };

  const sendTo = async (chat) => {
    setBusy(chat.id);
    try {
      const msgRef = doc(dataCol(db, appId, "chats", chat.id, "messages"));
      await setDoc(msgRef, { senderId: user.uid, content, type: "text", createdAt: serverTimestamp(), readBy: [user.uid] });
      const upd = { lastMessage: { content, senderId: user.uid, type: "text", createdAt: serverTimestamp(), readBy: [user.uid] }, updatedAt: serverTimestamp() };
      (chat.participants || []).forEach((uid) => { if (uid !== user.uid) upd[`unreadCounts.${uid}`] = increment(1); });
      await updateDoc(dataDoc(db, appId, "chats", chat.id), upd);
      pushNotify(user, { kind: "message", chatId: chat.id });
      showNotification?.("送信しました");
      onClose();
    } catch {
      showNotification?.("送信に失敗しました");
      setBusy("");
    }
  };

  const saveKeep = async () => {
    setBusy("keep");
    try {
      await addDoc(dataCol(db, appId, "keep"), {
        ownerUid: user.uid, type: /https?:\/\//.test(content) ? "link" : "text", content, pinned: false, createdAt: serverTimestamp(),
      });
      showNotification?.("Keepに保存しました");
      onClose();
    } catch {
      showNotification?.("保存に失敗しました");
      setBusy("");
    }
  };

  return (
    <div className="fixed inset-0 z-[600] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-[430px] rounded-t-3xl max-h-[80%] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center px-4 pt-4 pb-2">
          <div className="font-bold flex-1">共有先を選択</div>
          <button onClick={onClose} aria-label="閉じる" className="p-1"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="mx-4 mb-2 p-3 bg-gray-100 rounded-xl text-xs text-gray-600 whitespace-pre-wrap break-all max-h-24 overflow-hidden">{content || "（内容なし）"}</div>
        <div className="flex-1 overflow-y-auto px-2 pb-6">
          <button disabled={!!busy} onClick={saveKeep} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left">
            <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Bookmark className="w-5 h-5" /></span>
            <span className="flex-1 text-sm font-bold">Keepに保存</span>
            {busy === "keep" && <Loader2 className="w-4 h-4 animate-spin" />}
          </button>
          {(chats || []).filter((c) => (c.participants || []).includes(user.uid)).map((c) => {
            const { name, avatar } = label(c);
            return (
              <button key={c.id} disabled={!!busy} onClick={() => sendTo(c)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left disabled:opacity-60">
                {avatar ? <img src={avatar} alt="" className="w-10 h-10 rounded-xl object-cover border" /> : <span className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center"><Users className="w-5 h-5 text-gray-400" /></span>}
                <span className="flex-1 text-sm font-bold truncate">{name}</span>
                {busy === c.id && <Loader2 className="w-4 h-4 animate-spin" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ShareSheet;
