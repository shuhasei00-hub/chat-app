// 設定: アカウント / 友だち管理（ブロック・非表示）/ 通知 / ログアウト
import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Ban, EyeOff, BellOff, Bell, LogOut, Copy, UserCog, Info, Terminal, Music } from "lucide-react";
import { arrayRemove, updateDoc } from "firebase/firestore";
import { PageHeader, dataDoc } from "./common";
import { getPrefs, setPrefs, requestPermission, showNotice, enablePeriodicNews, registerSW } from "./notify";
import { getPushStatus, pushSupported, sendTestPush, syncPush, syncPushPrefs } from "./pushClient";

const APP_VERSION = "2.3.1";

const Section = ({ title, children }) => (
  <div className="mt-4">
    <div className="px-4 pb-2 text-xs font-bold text-gray-400">{title}</div>
    <div className="bg-white border-y divide-y">{children}</div>
  </div>
);

const Toggle = ({ label, hint, on, onClick, disabled }) => (
  <button disabled={disabled} onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 text-left disabled:opacity-40">
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-bold">{label}</span>
      {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
    </span>
    <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${on ? "bg-green-500" : "bg-gray-300"}`}>
      <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : ""}`} />
    </span>
  </button>
);

const Row = ({ icon: Icon, label, value, onClick, danger }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3.5 text-left ${danger ? "text-red-500" : ""}`}>
    {Icon && <Icon className="w-5 h-5 text-gray-400" />}
    <span className="flex-1 text-sm font-bold">{label}</span>
    {value && <span className="text-xs text-gray-400">{value}</span>}
    {onClick && !danger && <ChevronRight className="w-4 h-4 text-gray-300" />}
  </button>
);

const PersonRow = ({ u, actionLabel, onAction }) => (
  <div className="flex items-center gap-3 px-4 py-2.5">
    <img src={u.avatar} alt="" className="w-9 h-9 rounded-xl object-cover border" />
    <span className="flex-1 text-sm font-bold truncate">{u.name}</span>
    <button onClick={onAction} className="text-xs font-bold text-green-600 px-3 py-1.5 bg-green-50 rounded-full">{actionLabel}</button>
  </div>
);

const SettingsView = ({ user, profile, allUsers, chats, setView, mutedChats, toggleMuteChat, onLogout, db, appId, showNotification }) => {
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  const byUid = (uid) => allUsers?.find((u) => u.uid === uid);
  const blocked = useMemo(() => (profile?.blockedUsers || []).map(byUid).filter(Boolean), [profile?.blockedUsers, allUsers]); // eslint-disable-line react-hooks/exhaustive-deps
  const hidden = useMemo(() => (profile?.hiddenFriends || []).map(byUid).filter(Boolean), [profile?.hiddenFriends, allUsers]); // eslint-disable-line react-hooks/exhaustive-deps
  const mutedList = useMemo(() => (chats || []).filter((c) => mutedChats?.includes(c.id)), [chats, mutedChats]);

  const chatLabel = (c) => {
    if (c.isGroup) return c.name || "グループ";
    const other = byUid((c.participants || []).find((p) => p !== user.uid));
    return other?.name || "トーク";
  };

  const unblock = (uid) => updateDoc(dataDoc(db, appId, "users", user.uid), { blockedUsers: arrayRemove(uid) }).then(() => showNotification?.("ブロックを解除しました")).catch(() => showNotification?.("エラーが発生しました"));
  const unhide = (uid) => updateDoc(dataDoc(db, appId, "users", user.uid), { hiddenFriends: arrayRemove(uid) }).then(() => showNotification?.("非表示を解除しました")).catch(() => showNotification?.("エラーが発生しました"));

  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);
  const refreshStatus = () => getPushStatus().then(setStatus).catch(() => {});
  useEffect(() => { refreshStatus(); }, [notifPerm, testing]); // eslint-disable-line react-hooks/exhaustive-deps
  const askNotif = async () => {
    if (typeof Notification === "undefined") return showNotification?.("このブラウザは通知に対応していません");
    await registerSW();
    const p = await requestPermission();
    setNotifPerm(p);
    if (p === "granted") {
      showNotice("通知をオンにしました", "テスト通知です。メッセージや着信をお知らせします", { tag: "welcome" });
      syncPush(user);
    }
    else if (p === "denied") showNotification?.("ブラウザの設定から通知を許可してください");
  };
  const [prefs, setPrefsState] = useState(getPrefs());
  const toggle = (key) => {
    const next = setPrefs({ [key]: !prefs[key] });
    setPrefsState(next);
    if (key === "news") enablePeriodicNews(next.news);
    syncPushPrefs(user); // サーバー側（アプリを閉じている間の通知）にも反映
  };
  const testPush = async () => {
    setTesting(true);
    try {
      const r = await syncPush(user);
      if (!r.ok) {
        showNotification?.({ permission: "通知を許可してください", unsupported: "この端末は対応していません（iPhoneは「ホーム画面に追加」が必要）", server: "サーバーのVAPID鍵が未設定です（README参照）" }[r.reason] || "登録に失敗しました");
      } else {
        const d = await sendTestPush(user);
        showNotification?.(d.ok ? "テスト通知を送りました。アプリを閉じて届くか確認してください" : "送信できませんでした");
      }
    } catch { showNotification?.("送信できませんでした"); }
    setTesting(false);
  };

  const notifLabel = { granted: "許可済み", denied: "ブロック中", default: "未設定", unsupported: "非対応" }[notifPerm] || notifPerm;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title="設定" onBack={() => setView("services")} />
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-10">
        <button onClick={() => setView("profile")} className="w-full bg-white border-b flex items-center gap-4 px-4 py-4 text-left">
          <img src={profile?.avatar} alt="" className="w-14 h-14 rounded-2xl object-cover border" />
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{profile?.name}</div>
            <div className="text-xs text-gray-400 truncate">ID: {profile?.id}</div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </button>

        <Section title="アカウント">
          <Row icon={UserCog} label="プロフィールを編集" onClick={() => setView("profile")} />
          <Row icon={Copy} label="IDをコピー" value={profile?.id} onClick={() => navigator.clipboard?.writeText(profile?.id || "").then(() => showNotification?.("IDをコピーしました"))} />
        </Section>

        <Section title="通知">
          {status && (() => {
            const needHome = status.ios && !status.standalone;
            const steps = [
              [!needHome && status.supported, "この端末で利用できる", needHome ? "iPhoneは Safari の共有ボタン →「ホーム画面に追加」で追加し、そのアイコンから開いてください" : "このブラウザはプッシュ通知に対応していません（Chrome / Edge / Firefox / Safariを使ってください）"],
              [status.permission === "granted", "通知を許可している", status.permission === "denied" ? "ブラウザ/端末の設定でこのサイトの通知を「許可」に変えてください（下の「ブラウザ通知」から変更はできません）" : "下の「ブラウザ通知」をタップして「許可」を選んでください"],
              [status.serverEnabled === true, "サーバーの通知設定（VAPID鍵）", status.serverEnabled === null ? "サーバー(/api)に接続できません。Cloudflareにデプロイした環境で確認してください" : "管理者向け: Cloudflareの変数に VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY を登録して再デプロイが必要です"],
              [status.subscribed, "この端末を通知の宛先に登録済み", "上の3つが✓になった状態で「テスト通知を送る」を押すと登録されます"],
            ];
            const next = steps.find((x) => !x[0]);
            return (
              <div className="px-4 py-3 text-xs bg-white">
                <div className="font-bold text-gray-700 mb-1.5">通知の状態</div>
                {steps.map(([ok, label]) => (
                  <div key={label} className={`flex items-center gap-2 py-0.5 ${ok ? "text-green-600" : "text-gray-500"}`}><span className="font-bold w-4">{ok ? "✓" : "✕"}</span>{label}</div>
                ))}
                <div className={`mt-2 p-2 rounded-lg leading-snug ${next ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                  {next ? `次にやること: ${next[2]}` : "準備OKです。アプリを閉じても、メッセージ・着信が通知と音でお知らせされます。"}
                </div>
              </div>
            );
          })()}
          <Row icon={Bell} label="ブラウザ通知" value={notifLabel} onClick={askNotif} />
          <Row icon={Music} label="着信音・振動" value="好きな音に変更" onClick={() => setView("ringtone")} />
          <Toggle label="起動時に通知" hint="アプリを開いたとき、未読メッセージと最新ニュースをお知らせ" on={prefs.launch} disabled={notifPerm !== "granted"} onClick={() => toggle("launch")} />
          <Toggle label="新着メッセージ" hint="アプリが裏にあるときに通知（ミュート中のトークは除く）" on={prefs.message} disabled={notifPerm !== "granted"} onClick={() => toggle("message")} />
          <Toggle label="着信（通話）" hint="アプリを閉じていても、着信を通知し端末を振動させます" on={prefs.call} disabled={notifPerm !== "granted"} onClick={() => toggle("call")} />
          <Toggle label="着信時の振動・着信音" hint="アプリを開いている間の着信で、振動と着信音を鳴らします" on={prefs.vibrate} onClick={() => toggle("vibrate")} />
          <Toggle label="リマインダー" hint="設定した時刻に通知" on={prefs.reminder} disabled={notifPerm !== "granted"} onClick={() => toggle("reminder")} />
          <Toggle label="通知に本文を表示" hint="オフにすると「新着メッセージがあります」とだけ表示" on={prefs.preview} disabled={notifPerm !== "granted"} onClick={() => toggle("preview")} />
          <Row icon={Bell} label={testing ? "送信中…" : "テスト通知を送る"} value={pushSupported() ? "" : "非対応"} onClick={testing ? undefined : testPush} />
          <Toggle label="ニュース速報" hint="対応ブラウザではアプリを閉じていても定期的に確認" on={prefs.news} disabled={notifPerm !== "granted"} onClick={() => toggle("news")} />
          {mutedList.length === 0 && <div className="px-4 py-3 text-xs text-gray-400">ミュート中のトークはありません</div>}
          {mutedList.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <BellOff className="w-4 h-4 text-gray-400" />
              <span className="flex-1 text-sm font-bold truncate">{chatLabel(c)}</span>
              <button onClick={() => toggleMuteChat(c.id)} className="text-xs font-bold text-green-600 px-3 py-1.5 bg-green-50 rounded-full">解除</button>
            </div>
          ))}
        </Section>

        <Section title="ブロックリスト">
          {blocked.length === 0 && <div className="px-4 py-3 text-xs text-gray-400 flex items-center gap-2"><Ban className="w-4 h-4" />ブロック中のユーザーはいません</div>}
          {blocked.map((u) => <PersonRow key={u.uid} u={u} actionLabel="解除" onAction={() => unblock(u.uid)} />)}
        </Section>

        <Section title="非表示の友だち">
          {hidden.length === 0 && <div className="px-4 py-3 text-xs text-gray-400 flex items-center gap-2"><EyeOff className="w-4 h-4" />非表示の友だちはいません</div>}
          {hidden.map((u) => <PersonRow key={u.uid} u={u} actionLabel="再表示" onAction={() => unhide(u.uid)} />)}
        </Section>

        <Section title="その他">
          <Row icon={Terminal} label="開発者ツール" value="診断・コンソール" onClick={() => setView("devtools")} />
          <Row icon={Info} label="バージョン" value={APP_VERSION} />
          <Row icon={LogOut} label="ログアウト" danger onClick={() => window.confirm("ログアウトしますか？") && onLogout()} />
        </Section>
      </div>
    </div>
  );
};

export default SettingsView;
