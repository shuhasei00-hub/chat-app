// 下部ナビゲーション（ホーム / VOOM / ニュース / ウォレット / サービス）
import React from "react";
import { Home, LayoutGrid, Newspaper, Wallet, MoreHorizontal } from "lucide-react";

export const NAV_VIEWS = ["home", "voom", "news", "wallet", "services"];

const TABS = [
  { id: "home", label: "ホーム", icon: Home },
  { id: "voom", label: "VOOM", icon: LayoutGrid },
  { id: "news", label: "ニュース", icon: Newspaper },
  { id: "wallet", label: "ウォレット", icon: Wallet },
  { id: "services", label: "サービス", icon: MoreHorizontal },
];

const BottomNav = ({ view, setView, unreadTotal = 0 }) => (
  <div className="h-20 bg-white border-t flex items-center justify-around z-50 pb-4 shrink-0">
    {TABS.map(({ id, label, icon: Icon }) => (
      <button key={id} onClick={() => setView(id)} className={`relative flex flex-col items-center gap-1 transition-all ${view === id ? "text-green-500" : "text-gray-400"}`}>
        <Icon className="w-6 h-6" />
        <span className="text-[10px] font-bold">{label}</span>
        {id === "home" && unreadTotal > 0 && (
          <span className="absolute -top-1 left-1/2 ml-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadTotal > 99 ? "99+" : unreadTotal}
          </span>
        )}
      </button>
    ))}
  </div>
);

export default BottomNav;
