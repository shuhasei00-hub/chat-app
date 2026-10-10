// 今日の運勢（日付 + ユーザーIDで毎日固定の結果）
import React, { useMemo } from "react";
import { Star } from "lucide-react";
import { PageHeader, ymd } from "./common";

const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const mulberry = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const RANKS = ["大吉", "中吉", "吉", "小吉", "末吉", "凶"];
const COLORS = ["赤", "青", "緑", "黄", "白", "黒", "ピンク", "オレンジ", "紫"];
const ITEMS = ["ハンカチ", "イヤホン", "手帳", "コーヒー", "傘", "腕時計", "チョコレート", "観葉植物"];
const MESSAGES = {
  大吉: "何をやってもうまくいく一日。気になっていたことに踏み出そう。",
  中吉: "穏やかに流れる日。人との会話からヒントが見つかりそう。",
  吉: "コツコツ進めた分だけ結果がついてくる日です。",
  小吉: "小さな幸せを見つけられる日。身近な人に感謝を伝えて。",
  末吉: "焦らず一歩ずつ。夕方以降に運気が上向きます。",
  凶: "無理は禁物。早めに休んで、明日に備えましょう。",
};

const Stars = ({ n }) => (
  <span className="flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`w-4 h-4 ${i <= n ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`} />)}</span>
);

const FortuneView = ({ user, setView }) => {
  const today = ymd(new Date());
  const r = useMemo(() => {
    const rnd = mulberry(hash(`${user.uid}:${today}`));
    const rank = RANKS[Math.floor(rnd() * RANKS.length)];
    const star = () => 1 + Math.floor(rnd() * 5);
    return { rank, love: star(), work: star(), money: star(), color: COLORS[Math.floor(rnd() * COLORS.length)], item: ITEMS[Math.floor(rnd() * ITEMS.length)], num: 1 + Math.floor(rnd() * 99) };
  }, [user.uid, today]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-indigo-50 to-white">
      <PageHeader title="今日の運勢" onBack={() => setView("services")} />
      <div className="flex-1 overflow-y-auto p-5 scrollbar-hide">
        <div className="text-center py-8 bg-white rounded-3xl border shadow-sm">
          <div className="text-xs text-gray-400">{today.replaceAll("-", "/")}</div>
          <div className="text-6xl font-black text-indigo-500 my-3">{r.rank}</div>
          <p className="text-sm text-gray-600 px-6 leading-relaxed">{MESSAGES[r.rank]}</p>
        </div>
        <div className="mt-4 bg-white rounded-3xl border shadow-sm divide-y">
          {[["恋愛運", r.love], ["仕事運", r.work], ["金運", r.money]].map(([l, n]) => (
            <div key={l} className="flex items-center justify-between px-5 py-3 text-sm"><span className="font-bold">{l}</span><Stars n={n} /></div>
          ))}
          <div className="flex items-center justify-between px-5 py-3 text-sm"><span className="font-bold">ラッキーカラー</span><span>{r.color}</span></div>
          <div className="flex items-center justify-between px-5 py-3 text-sm"><span className="font-bold">ラッキーアイテム</span><span>{r.item}</span></div>
          <div className="flex items-center justify-between px-5 py-3 text-sm"><span className="font-bold">ラッキーナンバー</span><span>{r.num}</span></div>
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-4">結果は1日1回、毎日変わります（娯楽用です）</p>
      </div>
    </div>
  );
};

export default FortuneView;
