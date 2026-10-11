// サービス一覧（LINEの「サービス」タブ相当）
import React from "react";
import { Hash, Bookmark, CalendarDays, CloudSun, Sparkles, Store, Coins, Gamepad2, Cake, QrCode, Settings, Users, Newspaper, CreditCard, BellRing, Languages, Banknote, BookOpen, Plug } from "lucide-react";
import { PageHeader } from "./common";

const SECTIONS = [
  {
    title: "コミュニケーション",
    items: [
      { id: "openchat", label: "オープンチャット", icon: Hash, color: "bg-green-50 text-green-600" },
      { id: "group-create", label: "グループ作成", icon: Users, color: "bg-blue-50 text-blue-500" },
      { id: "qr", label: "QRコード", icon: QrCode, color: "bg-gray-100 text-gray-700" },
      { id: "birthday-cards", label: "バースデーカード", icon: Cake, color: "bg-pink-50 text-pink-500" },
    ],
  },
  {
    title: "便利ツール",
    items: [
      { id: "keep", label: "Keep", icon: Bookmark, color: "bg-emerald-50 text-emerald-600" },
      { id: "calendar", label: "カレンダー", icon: CalendarDays, color: "bg-red-50 text-red-500" },
      { id: "weather", label: "天気", icon: CloudSun, color: "bg-sky-50 text-sky-500" },
      { id: "news", label: "ニュース", icon: Newspaper, color: "bg-indigo-50 text-indigo-500" },
      { id: "charge", label: "コインチャージ", icon: CreditCard, color: "bg-green-50 text-green-600" },
      { id: "reminders", label: "リマインダー", icon: BellRing, color: "bg-amber-50 text-amber-600" },
    ],
  },
  {
    title: "外部サイト連携",
    items: [
      { id: "tools-translate", label: "翻訳", icon: Languages, color: "bg-blue-50 text-blue-600" },
      { id: "tools-fx", label: "為替", icon: Banknote, color: "bg-lime-50 text-lime-600" },
      { id: "tools-wiki", label: "Wikipedia", icon: BookOpen, color: "bg-slate-100 text-slate-600" },
      { id: "integrations", label: "外部連携\n(Webhook)", icon: Plug, color: "bg-violet-50 text-violet-600" },
    ],
  },
  {
    title: "エンタメ・ショッピング",
    items: [
      { id: "fortune", label: "今日の運勢", icon: Sparkles, color: "bg-purple-50 text-purple-500" },
      { id: "sticker-store", label: "スタンプショップ", icon: Store, color: "bg-yellow-50 text-yellow-600" },
      { id: "pachinko", label: "パチンコ", icon: Coins, color: "bg-orange-50 text-orange-500" },
      { id: "coin-arcade", label: "コインアーケード", icon: Gamepad2, color: "bg-teal-50 text-teal-600" },
    ],
  },
];

const ServicesView = ({ setView }) => (
  <div className="flex flex-col h-full bg-white">
    <PageHeader
      title="サービス"
      right={<button onClick={() => setView("settings")} className="p-2 rounded-full hover:bg-gray-100" aria-label="設定"><Settings className="w-5 h-5 text-gray-500" /></button>}
    />
    <div className="flex-1 overflow-y-auto scrollbar-hide pb-24 px-4">
      {SECTIONS.map((s) => (
        <div key={s.title} className="mt-5">
          <div className="text-xs font-bold text-gray-400 mb-3">{s.title}</div>
          <div className="grid grid-cols-4 gap-3">
            {s.items.map(({ id, label, icon: Icon, color }) => (
              <button key={id} onClick={() => setView(id)} className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
                <span className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color}`}><Icon className="w-6 h-6" /></span>
                <span className="text-[11px] font-bold text-gray-700 text-center leading-tight whitespace-pre-line">{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default ServicesView;
