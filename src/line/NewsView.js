// ニュース（Yahoo!ニュース RSS を Cloudflare Pages Function 経由で取得）
import React, { useEffect, useState, useCallback } from "react";
import { Newspaper, RefreshCw, ExternalLink, Bookmark } from "lucide-react";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { PageHeader, EmptyState, Spinner, dataCol, timeAgo } from "./common";
import { FEEDS, fetchNews } from "./newsApi";

const NewsView = ({ user, db, appId, showNotification }) => {
  const [feedId, setFeedId] = useState("top");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (id, force = false) => {
    setLoading(true);
    setError(false);
    try {
      setItems(await fetchNews(id, force));
    } catch (e) {
      console.error("news", e);
      setItems([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(feedId); }, [feedId, load]);

  const saveToKeep = async (n) => {
    try {
      await addDoc(dataCol(db, appId, "keep"), {
        ownerUid: user.uid, type: "link", content: `${n.title}\n${n.link}`, pinned: false, createdAt: serverTimestamp(),
      });
      showNotification?.("Keepに保存しました");
    } catch (e) {
      showNotification?.("保存に失敗しました");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <PageHeader
        title="ニュース"
        right={
          <button onClick={() => load(feedId, true)} className="p-2 rounded-full hover:bg-gray-100" aria-label="更新">
            <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? "animate-spin" : ""}`} />
          </button>
        }
      />
      <div className="flex gap-2 overflow-x-auto px-3 py-2 border-b scrollbar-hide shrink-0">
        {FEEDS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFeedId(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${feedId === f.id ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-24">
        {loading && <Spinner />}
        {!loading && error && (
          <EmptyState
            icon={<Newspaper className="w-10 h-10" />}
            title="ニュースを取得できませんでした"
            hint="通信状況を確認して、右上の更新ボタンをもう一度押してください。"
          />
        )}
        {!loading && !error && items.length === 0 && <EmptyState title="記事がありません" />}
        <ul className="divide-y">
          {items.map((n, i) => (
            <li key={n.link + i} className="px-4 py-3 flex gap-3 items-start">
              <a href={n.link} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
                <div className="text-sm font-bold leading-snug text-gray-800">{n.title}</div>
                <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                  Yahoo!ニュース ・ {timeAgo(n.at)} <ExternalLink className="w-3 h-3" />
                </div>
              </a>
              <button onClick={() => saveToKeep(n)} className="p-2 rounded-full hover:bg-gray-100 text-gray-400" aria-label="Keepに保存">
                <Bookmark className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default NewsView;
