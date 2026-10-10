// 共通ユーティリティ & 共通UI部品（追加機能モジュール用）
import React from "react";
import { ChevronLeft, Ban } from "lucide-react";
import { collection, doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

// 既存アプリと同じ Firestore パス: artifacts/{appId}/public/data/...
export const dataCol = (db, appId, ...path) => collection(db, "artifacts", appId, "public", "data", ...path);
export const dataDoc = (db, appId, ...path) => doc(db, "artifacts", appId, "public", "data", ...path);

// ウォレット: 毎日のログインボーナス額（ここだけ変えれば調整できます）
export const DAILY_BONUS = 50;

export const toMillis = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts === "number") return ts;
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
};

export const pad2 = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const timeAgo = (ms) => {
  if (!ms) return "";
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "たった今";
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}日前`;
  const dt = new Date(ms);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
};

export const formatDateTime = (ms) => {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// 画像をリサイズして dataURL にする（Firestore 1ドキュメント 1MiB 制限対策）
export const compressImage = (file, maxSize = 800, quality = 0.7) =>
  new Promise((resolve, reject) => {
    if (!file) return reject(new Error("no file"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read error"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image error"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

export const linkify = (text) => {
  if (!text) return null;
  return String(text).split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
        {part}
      </a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
};

export const PageHeader = ({ title, onBack, right }) => (
  <div className="h-14 px-3 flex items-center gap-2 bg-white border-b shrink-0">
    {onBack ? (
      <button onClick={onBack} className="p-2 -ml-1 rounded-full hover:bg-gray-100" aria-label="戻る">
        <ChevronLeft className="w-6 h-6" />
      </button>
    ) : (
      <div className="w-2" />
    )}
    <h1 className="font-bold text-base flex-1 truncate">{title}</h1>
    {right}
  </div>
);

export const EmptyState = ({ icon, title, hint }) => (
  <div className="flex flex-col items-center justify-center text-center text-gray-400 py-16 px-8 gap-2">
    {icon && <div className="text-gray-300">{icon}</div>}
    <div className="font-bold text-sm text-gray-500">{title}</div>
    {hint && <div className="text-xs">{hint}</div>}
  </div>
);

export const Spinner = () => (
  <div className="flex justify-center py-10">
    <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// 友だちプロフィールに追加するブロック/解除ボタン
export const BlockButton = ({ db, appId, myUid, friend, myProfile, showNotification, onClose }) => {
  const blocked = (myProfile?.blockedUsers || []).includes(friend?.uid);
  const toggle = async () => {
    if (!myUid || !friend?.uid) return;
    try {
      const ref = dataDoc(db, appId, "users", myUid);
      if (blocked) {
        await updateDoc(ref, { blockedUsers: arrayRemove(friend.uid) });
        showNotification?.("ブロックを解除しました");
      } else {
        if (!window.confirm(`${friend.name || "このユーザー"}をブロックしますか？\n（相手のメッセージがあなたの画面に表示されなくなります）`)) return;
        await updateDoc(ref, { blockedUsers: arrayUnion(friend.uid) });
        showNotification?.("ブロックしました");
      }
      onClose?.();
    } catch (e) {
      console.error(e);
      showNotification?.("エラーが発生しました");
    }
  };
  return (
    <div className="w-full px-8 mt-3 mb-4">
      <button
        onClick={toggle}
        className="w-full py-3 rounded-2xl font-bold border border-red-200 text-red-500 bg-white hover:bg-red-50 flex items-center justify-center gap-2"
      >
        <Ban className="w-5 h-5" />
        {blocked ? "ブロックを解除" : "ブロックする"}
      </button>
    </div>
  );
};
