// 開発者ツール: ① アプリ内コンソール(eruda)のON/OFF ② 接続診断
import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, Terminal } from "lucide-react";
import { PageHeader, Spinner } from "./common";
import { notifyPermission } from "./notify";

const ERUDA_KEY = "devtoolsEnabled";
const ERUDA_SRC = "https://cdn.jsdelivr.net/npm/eruda@3.4.1/eruda.min.js";

export const isDevtoolsOn = () => { try { return localStorage.getItem(ERUDA_KEY) === "1"; } catch { return false; } };

export const setDevtools = (on) => {
  try { localStorage.setItem(ERUDA_KEY, on ? "1" : "0"); } catch { /* 無視 */ }
  if (on) return loadDevtools();
  if (window.eruda) { try { window.eruda.destroy(); } catch { /* 無視 */ } }
  return Promise.resolve();
};

// アプリ起動時に呼ぶ: ONになっていれば eruda(スマホでも使えるコンソール/ネットワーク/要素ビューア)を読み込む
export const loadDevtools = () =>
  new Promise((resolve) => {
    if (window.eruda) { try { window.eruda.init(); } catch { /* 初期化済み */ } return resolve(); }
    const sc = document.createElement("script");
    sc.src = ERUDA_SRC;
    sc.onload = () => { try { window.eruda.init(); } catch { /* 無視 */ } resolve(); };
    sc.onerror = () => resolve();
    document.head.appendChild(sc);
  });

const Item = ({ ok, label, detail }) => (
  <div className="flex items-start gap-3 px-4 py-3">
    {ok ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> : <XCircle className="w-5 h-5 text-red-400 shrink-0" />}
    <div className="min-w-0">
      <div className="text-sm font-bold">{label}</div>
      {detail && <div className="text-[11px] text-gray-500 break-all leading-snug">{detail}</div>}
    </div>
  </div>
);

const DevToolsView = ({ user, setView }) => {
  const [on, setOn] = useState(isDevtoolsOn());
  const [diag, setDiag] = useState(null);
  const [checks, setChecks] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    const out = [];
    const probe = async (label, url, okFn) => {
      try {
        const res = await fetch(url);
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch { /* HTML など */ }
        const ok = res.ok && okFn(data, text);
        out.push({ label, ok, detail: `${url} → HTTP ${res.status}${data ? "" : "（JSONではありません: サーバー(/api)が動いていない可能性）"}` });
        return data;
      } catch (e) {
        out.push({ label, ok: false, detail: `${url} → 通信エラー: ${e.message}` });
        return null;
      }
    };
    const d = await probe("サーバー /api の稼働", "/api/diag", (j) => j?.ok === true);
    setDiag(d);
    await probe("決済API (/api/pay/providers)", "/api/pay/providers", (j) => Array.isArray(j?.providers));
    await probe("ニュースAPI (/api/news)", `/api/news?url=${encodeURIComponent("https://news.yahoo.co.jp/rss/topics/top-picks.xml")}`, (_, t) => t.includes("<item>"));
    out.push({ label: "ログイン", ok: !!user?.uid, detail: user ? `uid: ${user.uid}${user.isAnonymous ? "（ゲスト）" : ""}` : "未ログイン" });
    out.push({ label: "通知の許可", ok: notifyPermission() === "granted", detail: `状態: ${notifyPermission()}` });
    let sw = "未対応";
    try { const reg = await navigator.serviceWorker?.getRegistration(); sw = reg ? "登録済み" : "未登録"; } catch { /* 無視 */ }
    out.push({ label: "Service Worker（通知の土台）", ok: sw === "登録済み", detail: sw });
    out.push({ label: "HTTPS", ok: window.location.protocol === "https:" || window.location.hostname === "localhost", detail: window.location.origin });
    setChecks(out);
    setRunning(false);
  }, [user]);

  useEffect(() => { run(); }, [run]);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    await setDevtools(next);
  };

  const cfg = diag?.config;
  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title="開発者ツール" onBack={() => setView("settings")} right={
        <button onClick={run} className="p-2 rounded-full hover:bg-gray-100" aria-label="再診断"><RefreshCw className={`w-5 h-5 text-gray-500 ${running ? "animate-spin" : ""}`} /></button>
      } />
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-10">
        <div className="mt-4 px-4 text-xs font-bold text-gray-400 mb-2">アプリ内コンソール</div>
        <button onClick={toggle} className="w-full bg-white border-y flex items-center gap-3 px-4 py-3.5 text-left">
          <Terminal className="w-5 h-5 text-gray-400" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold">開発者コンソールを表示</span>
            <span className="block text-[11px] text-gray-400">スマホでも使える Console / Network / Elements / Storage（eruda）。右下の歯車アイコンから開きます</span>
          </span>
          <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${on ? "bg-green-500" : "bg-gray-300"}`}>
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : ""}`} />
          </span>
        </button>
        <p className="px-4 pt-2 text-[11px] text-gray-400 leading-relaxed">PCのブラウザなら F12（Mac は Option+Command+I）でも開けます。コンソールには他人に見せられない情報が出ることがあるので、使い終わったらOFFにしてください。</p>

        <div className="mt-5 px-4 text-xs font-bold text-gray-400 mb-2">接続診断</div>
        <div className="bg-white border-y divide-y">
          {!checks && <Spinner />}
          {checks && checks.map((c) => <Item key={c.label} {...c} />)}
        </div>

        {cfg && (
          <>
            <div className="mt-5 px-4 text-xs font-bold text-gray-400 mb-2">サーバー設定（値は表示しません）</div>
            <div className="bg-white border-y divide-y">
              <Item ok={cfg.FIREBASE_API_KEY} label="FIREBASE_API_KEY" detail={cfg.FIREBASE_API_KEY ? "設定済み" : "未設定 → 決済の本人確認ができません"} />
              <Item ok={cfg.FIREBASE_SERVICE_ACCOUNT} label="FIREBASE_SERVICE_ACCOUNT" detail={cfg.FIREBASE_SERVICE_ACCOUNT ? "設定済み" : "未設定 → コインを加算できません"} />
              {diag.providers.map((p) => (
                <Item key={p.id} ok={p.enabled} label={`${p.name} のAPIキー`} detail={p.enabled ? `設定済み（${p.methods.join(", ")}）` : "未設定"} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DevToolsView;
