// トークのメッセージに付く追加表示: リンクプレビュー / 翻訳
import React, { useEffect, useState } from "react";
import { Languages, X, Loader2 } from "lucide-react";
import { LANGS, detectLang, translateText } from "./toolsApi";

// ---- リンクプレビュー（OGP）-----------------------------------------------
const cache = new Map(); // url -> Promise<preview|null>
const firstUrl = (text) => {
  const m = /https?:\/\/[^\s<>"']+/.exec(String(text || ""));
  return m ? m[0].replace(/[)\].,、。」』!?！？]+$/, "") : null;
};
const loadPreview = (url) => {
  if (!cache.has(url)) {
    cache.set(url, fetch(`/api/ogp?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && (d.title || d.description) ? d : null))
      .catch(() => null));
  }
  return cache.get(url);
};

export const LinkPreview = ({ text }) => {
  const url = firstUrl(text);
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    if (url) loadPreview(url).then((d) => alive && setData(d));
    return () => { alive = false; };
  }, [url]);
  if (!url || !data) return null;
  return (
    <a href={data.url || url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      className="block mt-1.5 w-56 max-w-full rounded-xl overflow-hidden border bg-white text-black no-underline shadow-sm">
      {data.image && <img src={data.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-28 object-cover bg-gray-100" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      <div className="p-2">
        <div className="text-[11px] font-bold leading-snug line-clamp-2">{data.title}</div>
        {data.description && <div className="text-[10px] text-gray-500 leading-snug line-clamp-2 mt-0.5">{data.description}</div>}
        <div className="text-[9px] text-gray-400 mt-1 truncate">{data.siteName}</div>
      </div>
    </a>
  );
};

// ---- 翻訳 -------------------------------------------------------------------
export const TranslateBox = ({ text, onClose }) => {
  const [to, setTo] = useState(() => {
    const saved = (() => { try { return localStorage.getItem("translateTo"); } catch { return null; } })();
    return saved || (detectLang(text) === "ja" ? "en" : "ja");
  });
  const [state, setState] = useState({ loading: true, text: "", error: "" });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, text: "", error: "" });
    const from = detectLang(text);
    translateText(String(text).slice(0, 500), from === to ? (to === "ja" ? "en" : "ja") : from, to)
      .then((t) => alive && setState({ loading: false, text: t, error: "" }))
      .catch((e) => alive && setState({ loading: false, text: "", error: e.message }));
    return () => { alive = false; };
  }, [text, to]);

  const change = (v) => { setTo(v); try { localStorage.setItem("translateTo", v); } catch { /* 無視 */ } };
  return (
    <div className="mt-1.5 rounded-xl bg-black/5 p-2 text-[11px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 mb-1 text-[10px] text-gray-500 font-bold">
        <Languages className="w-3 h-3" />翻訳
        <select value={to} onChange={(e) => change(e.target.value)} className="bg-transparent outline-none ml-1">
          {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
        <button onClick={onClose} className="ml-auto p-0.5" aria-label="閉じる"><X className="w-3 h-3" /></button>
      </div>
      {state.loading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
      {state.error && <div className="text-red-500">{state.error}</div>}
      {state.text && <div className="whitespace-pre-wrap break-words">{state.text}</div>}
    </div>
  );
};
