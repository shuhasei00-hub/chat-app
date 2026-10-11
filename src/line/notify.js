// 通知まわりの共通処理 + 起動時通知コンポーネント
import React, { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { fetchNews } from "./newsApi";

const PREF_KEY = "notifyPrefs";
const DISMISS_KEY = "notifyBannerDismissed";

export const getPrefs = () => {
  try { return { launch: true, message: true, news: true, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") }; }
  catch { return { launch: true, message: true, news: true }; }
};
export const setPrefs = (patch) => {
  const next = { ...getPrefs(), ...patch };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* 無視 */ }
  return next;
};

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

const mutedIds = () => { try { return JSON.parse(localStorage.getItem("mutedChats") || "[]"); } catch { return []; } };

// 新着メッセージ通知（アプリが裏にあるときだけ。ミュート中のトークは除外）
export const notifyNewMessage = (chatId, chat, lastMsg) => {
  if (!getPrefs().message || !document.hidden || mutedIds().includes(chatId)) return;
  const title = chat?.isGroup ? chat.name || "グループ" : "新着メッセージ";
  const text = typeof lastMsg?.content === "string" && lastMsg.content ? lastMsg.content : "メッセージが届きました";
  showNotice(title, text.slice(0, 120), { tag: `chat-${chatId}`, url: "/" });
};

// アプリ起動時: 未読 / 最新ニュースを通知。通知の許可を促すバナーも出します。
export const LaunchNotifier = ({ user, chats, mutedChats, setView }) => {
  const [perm, setPerm] = useState(notifyPermission());
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } });
  const latest = useRef({ chats, mutedChats });
  latest.current = { chats, mutedChats };

  // 通知タップで /?open=news のように開かれた場合、その画面へ
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const open = params.get("open");
    if (open) {
      goTo(setView, open);
      params.delete("open");
      const q = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""));
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (user) registerSW(); }, [user]);

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
      const unread = (cs || []).reduce((n, c) => n + (c?.participants?.includes(user.uid) && !(muted || []).includes(c.id) ? c.unreadCounts?.[user.uid] || 0 : 0), 0);
      if (unread > 0) await showNotice("未読メッセージ", `未読が ${unread} 件あります`, { tag: "launch-unread", url: "/" });
      if (prefs.news) {
        try {
          const [top] = await fetchNews("top");
          if (top) await showNotice("最新ニュース", top.title, { tag: "launch-news", url: "/?open=news" });
        } catch { /* ニュース取得失敗時は何も出さない */ }
      }
    }, 3500); // チャット一覧の読み込みを待つ
    return () => clearTimeout(t);
  }, [user, perm]);

  if (!user || perm !== "default" || dismissed) return null;
  const enable = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === "granted") showNotice("通知をオンにしました", "起動時に未読メッセージと最新ニュースをお知らせします", { tag: "welcome" });
  };
  const close = () => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* 無視 */ } };
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[500] w-[calc(100%-24px)] max-w-[406px] bg-white rounded-2xl shadow-xl border p-3 flex items-center gap-3">
      <span className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0"><Bell className="w-5 h-5" /></span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold">通知をオンにしますか？</div>
        <div className="text-[11px] text-gray-500 leading-snug">起動時に未読メッセージと最新ニュースをお知らせします</div>
      </div>
      <button onClick={enable} className="px-3 py-2 rounded-xl bg-green-500 text-white text-xs font-bold shrink-0">オンにする</button>
      <button onClick={close} aria-label="閉じる" className="p-1 text-gray-400 shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
};
