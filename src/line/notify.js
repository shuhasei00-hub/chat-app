// 通知まわりの共通処理 + 起動時の通知/通知タップ/共有受け取り/アプリバッジを担当するコンポーネント
import React, { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { fetchNews } from "./newsApi";
import { getPrefs, setPrefs, getMutedChats } from "./prefs";
import { syncPush } from "./pushClient";
import ShareSheet from "./ShareSheet";

export { getPrefs, setPrefs };
const DISMISS_KEY = "notifyBannerDismissed";

// 起動直後は App 側が最後に setView("home") を呼ぶため、遷移先を一時的に保持して上書きされないようにする
export const takePendingView = () => { const v = window.__pendingView; window.__pendingView = undefined; return v; };
export const goTo = (setView, v) => {
  window.__pendingView = v;
  setView?.(v);
  setTimeout(() => { if (window.__pendingView === v) window.__pendingView = undefined; }, 8000);
};

export const notifySupported = () => typeof Notification !== "undefined";
export const notifyPermission = () => (notifySupported() ? Notification.permission : "unsupported");

export const registerSW = async () => {
  if (!("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register(`${process.env.PUBLIC_URL || ""}/sw.js`); }
  catch (e) { console.warn("sw", e); return null; }
};

// ニュースの定期チェック（対応ブラウザのみ。非対応なら何もしません）
export const enablePeriodicNews = async (on = true) => {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg?.periodicSync) return false;
    if (!on) { await reg.periodicSync.unregister("news-check"); return true; }
    await reg.periodicSync.register("news-check", { minInterval: 6 * 60 * 60 * 1000 });
    return true;
  } catch { return false; }
};

export const requestPermission = async () => {
  if (!notifySupported()) return "unsupported";
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
};

// 通知を1件表示（Service Worker 経由 → だめなら通常の Notification）
export const showNotice = async (title, body, { tag, url = "/" } = {}) => {
  if (notifyPermission() !== "granted") return false;
  const opts = { body, tag, icon: `${process.env.PUBLIC_URL || ""}/icon-192.png`, badge: `${process.env.PUBLIC_URL || ""}/icon-192.png`, data: { url } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) { await reg.showNotification(title, opts); return true; }
  } catch { /* フォールバックへ */ }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); }; return true; }
  catch { return false; }
};

const mutedIds = getMutedChats;

// 新着メッセージ通知（アプリが裏にあるときだけ。ミュート中のトークは除外）
export const notifyNewMessage = (chatId, chat, lastMsg) => {
  if (!getPrefs().message || !document.hidden || mutedIds().includes(chatId)) return;
  const title = chat?.isGroup ? chat.name || "グループ" : "新着メッセージ";
  const text = typeof lastMsg?.content === "string" && lastMsg.content ? lastMsg.content : "メッセージが届きました";
  showNotice(title, text.slice(0, 120), { tag: `chat-${chatId}`, url: `/?chat=${encodeURIComponent(chatId)}` });
};

// 通知タップ / 共有ターゲットで渡された URL（?chat=ID / ?open=画面 / ?share_*=...）を解釈
const parseLaunch = (search) => {
  const p = new URLSearchParams(search);
  const share = { title: p.get("share_title") || "", text: p.get("share_text") || "", url: p.get("share_url") || "" };
  return {
    chat: p.get("chat"),
    open: p.get("open"),
    share: share.title || share.text || share.url ? share : null,
  };
};

const unreadOf = (user, chats, muted) =>
  (chats || []).reduce((n, c) => n + (c?.participants?.includes(user.uid) && !(muted || []).includes(c.id) ? c.unreadCounts?.[user.uid] || 0 : 0), 0);

// アプリ起動時: 未読 / 最新ニュースを通知。通知の許可を促すバナーも出します。
// あわせて、プッシュ購読の同期・通知タップでの画面遷移・共有の受け取り・アプリアイコンのバッジ表示も行います。
export const LaunchNotifier = ({ user, chats, mutedChats, setView, setActiveChatId, allUsers, db, appId, showNotification }) => {
  const [perm, setPerm] = useState(notifyPermission());
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } });
  const [pendingChat, setPendingChat] = useState(null);
  const [share, setShare] = useState(null);
  const latest = useRef({ chats, mutedChats });
  latest.current = { chats, mutedChats };

  const route = (search) => {
    const { chat, open, share: sh } = parseLaunch(search);
    if (open) goTo(setView, open);
    if (chat) setPendingChat(chat);
    if (sh) setShare(sh);
  };

  // 起動URL（通知タップで開かれた場合 / 共有された場合）
  useEffect(() => {
    if (!user) return;
    const { chat, open, share: sh } = parseLaunch(window.location.search);
    if (!chat && !open && !sh) return;
    route(window.location.search);
    window.history.replaceState({}, "", window.location.pathname);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // すでに開いているアプリに通知タップが届いた場合（Service Worker からのメッセージ）
  useEffect(() => {
    if (!user || !("serviceWorker" in navigator)) return undefined;
    const onMsg = (e) => {
      if (e.data?.type === "notification-click" && e.data.url) route(e.data.url.includes("?") ? e.data.url.slice(e.data.url.indexOf("?")) : "");
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // 通知で指定されたトークを開く（トーク一覧の読み込みを待つ。最大10秒）
  useEffect(() => {
    if (!pendingChat) return undefined;
    if ((chats || []).some((c) => c.id === pendingChat)) {
      setActiveChatId?.(pendingChat);
      goTo(setView, "chatroom");
      setPendingChat(null);
      return undefined;
    }
    const t = setTimeout(() => setPendingChat(null), 10000);
    return () => clearTimeout(t);
  }, [pendingChat, chats]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (user) registerSW(); }, [user]);

  // 通知が許可されていれば、この端末をプッシュの宛先として登録（アプリを閉じていても届くようになる）
  useEffect(() => { if (user && perm === "granted") syncPush(user); }, [user?.uid, perm]); // eslint-disable-line react-hooks/exhaustive-deps

  // アプリアイコンの未読バッジ（対応ブラウザのみ）
  const unread = user ? unreadOf(user, chats, mutedChats) : 0;
  useEffect(() => {
    try {
      if (!("setAppBadge" in navigator)) return;
      if (unread > 0) navigator.setAppBadge(unread).catch(() => {});
      else navigator.clearAppBadge().catch(() => {});
    } catch { /* 無視 */ }
  }, [unread]);

  // 起動時通知（1セッション1回）
  useEffect(() => {
    if (!user || perm !== "granted") return undefined;
    let flagged = false;
    try { flagged = sessionStorage.getItem("launchNotified") === "1"; } catch { /* 無視 */ }
    if (flagged) return undefined;
    const prefs = getPrefs();
    if (prefs.news) enablePeriodicNews(true);
    if (!prefs.launch) return undefined;
    const t = setTimeout(async () => {
      try { sessionStorage.setItem("launchNotified", "1"); } catch { /* 無視 */ }
      const { chats: cs, mutedChats: muted } = latest.current;
      const n = unreadOf(user, cs, muted);
      if (n > 0) await showNotice("未読メッセージ", `未読が ${n} 件あります`, { tag: "launch-unread", url: "/" });
      if (prefs.news) {
        try {
          const [top] = await fetchNews("top");
          if (top) await showNotice("最新ニュース", top.title, { tag: "launch-news", url: "/?open=news" });
        } catch { /* ニュース取得失敗時は何も出さない */ }
      }
    }, 3500); // チャット一覧の読み込みを待つ
    return () => clearTimeout(t);
  }, [user, perm]);

  const shareSheet = share && user ? (
    <ShareSheet share={share} user={user} chats={chats} allUsers={allUsers} db={db} appId={appId} onClose={() => setShare(null)} showNotification={showNotification} />
  ) : null;

  if (!user || perm !== "default" || dismissed) return shareSheet;
  const enable = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === "granted") {
      showNotice("通知をオンにしました", "メッセージや着信を、アプリを閉じていてもお知らせします", { tag: "welcome" });
      syncPush(user);
    }
  };
  const close = () => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* 無視 */ } };
  return (
    <>
      {shareSheet}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[500] w-[calc(100%-24px)] max-w-[406px] bg-white rounded-2xl shadow-xl border p-3 flex items-center gap-3">
        <span className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0"><Bell className="w-5 h-5" /></span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold">通知をオンにしますか？</div>
          <div className="text-[11px] text-gray-500 leading-snug">メッセージや着信を、アプリを閉じていてもお知らせします</div>
        </div>
        <button onClick={enable} className="px-3 py-2 rounded-xl bg-green-500 text-white text-xs font-bold shrink-0">オンにする</button>
        <button onClick={close} aria-label="閉じる" className="p-1 text-gray-400 shrink-0"><X className="w-4 h-4" /></button>
      </div>
    </>
  );
};
