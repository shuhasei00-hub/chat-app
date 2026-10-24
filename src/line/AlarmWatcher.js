// 目覚まし: アプリを開いている間、設定した時刻に着信音で知らせます（App.js の最上位に1つ置く）
import React, { useEffect, useRef, useState } from "react";
import { AlarmClock } from "lucide-react";
import { startAlarmSound, stopAlarmSound } from "./ring";
import { showNotice } from "./notify";

export const ALARM_KEY = "toolbox.alarms";
export const loadAlarms = () => { try { return JSON.parse(localStorage.getItem(ALARM_KEY)) || []; } catch { return []; } };
export const saveAlarms = (a) => { try { localStorage.setItem(ALARM_KEY, JSON.stringify(a)); } catch { /* 無視 */ } };
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const AlarmWatcher = () => {
  const [ring, setRing] = useState(null);
  const last = useRef("");

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      const key = `${now.toDateString()} ${hhmm(now)}`;
      if (last.current === key) return;
      const list = loadAlarms();
      const hit = list.find((a) => a.on && a.time === hhmm(now) && (!a.days?.length || a.days.includes(now.getDay())));
      if (!hit) return;
      last.current = key;
      if (!hit.days?.length) saveAlarms(list.map((a) => (a.id === hit.id ? { ...a, on: false } : a))); // 1回きりは自動でオフ
      setRing(hit);
      startAlarmSound(hit.tone);
      showNotice("⏰ " + (hit.label || "目覚まし"), hhmm(now), { tag: "alarm", renotify: true });
    }, 1000);
    return () => { clearInterval(id); stopAlarmSound(); };
  }, []);

  if (!ring) return null;
  const stop = () => { stopAlarmSound(); setRing(null); };
  const snooze = () => {
    const t = new Date(Date.now() + 5 * 60000);
    saveAlarms([...loadAlarms(), { id: Date.now(), time: hhmm(t), label: (ring.label || "目覚まし") + "（スヌーズ）", days: [], on: true, tone: ring.tone }]);
    stop();
  };
  return (
    <div className="fixed inset-0 z-[600] bg-gray-900/95 flex flex-col items-center justify-center gap-6 px-6">
      <AlarmClock className="w-20 h-20 text-amber-400 animate-pulse" />
      <div className="text-white text-5xl font-black tabular-nums">{ring.time}</div>
      <div className="text-white/80 text-lg font-bold text-center break-all">{ring.label || "目覚まし"}</div>
      <div className="w-full max-w-xs flex gap-3 mt-4">
        <button onClick={snooze} className="flex-1 py-4 rounded-2xl bg-white/15 text-white font-bold">5分後に再通知</button>
        <button onClick={stop} className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-bold">止める</button>
      </div>
    </div>
  );
};

export default AlarmWatcher;
