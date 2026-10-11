// ニュース取得（NewsView と 起動時通知で共用）
// 1) 自サイトの /api/news（Cloudflare Pages Functions）→ 2) 失敗時は公開プロキシ経由 の順に試します。
const BASE = "https://news.yahoo.co.jp/rss/topics";
export const FEEDS = [
  { id: "top", label: "主要", url: `${BASE}/top-picks.xml` },
  { id: "domestic", label: "国内", url: `${BASE}/domestic.xml` },
  { id: "world", label: "国際", url: `${BASE}/world.xml` },
  { id: "business", label: "経済", url: `${BASE}/business.xml` },
  { id: "entertainment", label: "エンタメ", url: `${BASE}/entertainment.xml` },
  { id: "sports", label: "スポーツ", url: `${BASE}/sports.xml` },
  { id: "it", label: "IT", url: `${BASE}/it.xml` },
  { id: "science", label: "科学", url: `${BASE}/science.xml` },
  { id: "local", label: "地域", url: `${BASE}/local.xml` },
];

const cache = new Map(); // feedId -> { at, items }
const TTL = 60 * 1000;

export const parseRss = (xmlText) => {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("parse");
  const items = Array.from(doc.querySelectorAll("item")).map((it) => {
    const get = (tag) => it.querySelector(tag)?.textContent?.trim() || "";
    const pub = get("pubDate");
    return { title: get("title"), link: get("link"), at: pub ? new Date(pub).getTime() : 0 };
  }).filter((x) => x.title && x.link);
  if (!items.length) throw new Error("empty");
  return items;
};

const sources = (url) => [
  `/api/news?url=${encodeURIComponent(url)}`,
  `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

const fetchText = async (src) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(src, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
};

export const fetchNews = async (feedId = "top", force = false) => {
  const feed = FEEDS.find((f) => f.id === feedId) || FEEDS[0];
  const hit = cache.get(feed.id);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.items;
  let lastErr;
  for (const src of sources(feed.url)) {
    try {
      const items = parseRss(await fetchText(src)); // HTMLが返ってきた場合(ローカル開発)は parse で弾かれ次へ
      cache.set(feed.id, { at: Date.now(), items });
      return items;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("news");
};
