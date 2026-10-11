// カレンダー（予定 + 友だちの誕生日）と ToDo
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Check, X, Cake, CalendarPlus, Download } from "lucide-react";
import { addDoc, deleteDoc, onSnapshot, query, updateDoc, where, serverTimestamp } from "firebase/firestore";
import { PageHeader, EmptyState, dataCol, dataDoc, ymd, toMillis } from "./common";
import { ensurePushReady } from "./pushClient";

// 通知タイミング（分前）
const REMIND_OPTIONS = [["", "通知なし"], ["0", "予定の時刻"], ["10", "10分前"], ["60", "1時間前"], ["1440", "1日前"]];

const startOf = (e) => new Date(`${e.date}T${e.time || "09:00"}`);
const compact = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const compactT = (d) => `${compact(d)}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;

// Googleカレンダーに追加するURL（外部サイト連携）
const googleCalUrl = (e) => {
  const st = startOf(e);
  const dates = e.time ? `${compactT(st)}/${compactT(new Date(st.getTime() + 3600000))}` : `${compact(st)}/${compact(new Date(st.getTime() + 86400000))}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&details=${encodeURIComponent(e.memo || "")}&dates=${dates}`;
};

// .ics ファイル（Apple / Outlook などのカレンダーに取り込める）
const downloadIcs = (e) => {
  const st = startOf(e);
  const esc = (t) => String(t || "").replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//chat-app//JA", "BEGIN:VEVENT", `UID:${e.id}@chat-app`, `DTSTAMP:${compactT(new Date())}`,
    e.time ? `DTSTART:${compactT(st)}` : `DTSTART;VALUE=DATE:${compact(st)}`,
    e.time ? `DTEND:${compactT(new Date(st.getTime() + 3600000))}` : `DTEND;VALUE=DATE:${compact(new Date(st.getTime() + 86400000))}`,
    `SUMMARY:${esc(e.title)}`, ...(e.memo ? [`DESCRIPTION:${esc(e.memo)}`] : []), "END:VEVENT", "END:VCALENDAR"];
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${(e.title || "event").slice(0, 30)}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const reminderApi = async (user, body) => {
  const token = await user.getIdToken();
  const res = await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "通知の登録に失敗しました");
  return data;
};

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

const CalendarView = ({ user, profile, allUsers, db, appId, setView, showNotification }) => {
  const today = new Date();
  const [tab, setTab] = useState("calendar");
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(ymd(today));
  const [events, setEvents] = useState([]);
  const [todos, setTodos] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", time: "", memo: "", remind: "" });
  const [todoText, setTodoText] = useState("");

  useEffect(() => {
    const u1 = onSnapshot(query(dataCol(db, appId, "events"), where("ownerUid", "==", user.uid)),
      (s) => setEvents(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    const u2 = onSnapshot(query(dataCol(db, appId, "todos"), where("ownerUid", "==", user.uid)),
      (s) => setTodos(s.docs.map((d) => ({ id: d.id, ...d.data() }))), console.error);
    return () => { u1(); u2(); };
  }, [db, appId, user.uid]);

  // 自分＋友だちの誕生日（MM-DD -> 名前[]）
  const birthdays = useMemo(() => {
    const friendIds = new Set(profile?.friends || []);
    const map = {};
    (allUsers || []).forEach((u) => {
      if (!u?.birthday || !(u.uid === user.uid || friendIds.has(u.uid) || friendIds.has(u.id))) return;
      const md = String(u.birthday).slice(5, 10); // YYYY-MM-DD -> MM-DD
      (map[md] = map[md] || []).push(u.uid === user.uid ? "あなた" : u.name);
    });
    return map;
  }, [allUsers, profile?.friends, user.uid]);

  const eventsByDay = useMemo(() => {
    const m = {};
    events.forEach((e) => (m[e.date] = m[e.date] || []).push(e));
    Object.values(m).forEach((arr) => arr.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")));
    return m;
  }, [events]);

  const y = cursor.getFullYear();
  const mo = cursor.getMonth();
  const firstDow = new Date(y, mo, 1).getDay();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const keyOf = (d) => `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const selectedBirthdays = birthdays[selected.slice(5)] || [];
  const selectedEvents = eventsByDay[selected] || [];

  const addEvent = async () => {
    if (!form.title.trim()) return showNotification?.("タイトルを入力してください");
    try {
      // 通知: 予定の日時（時刻なしなら9:00）の N 分前にプッシュ通知（サーバーのCronが送信）
      let reminderId = "";
      let note = "";
      if (form.remind !== "") {
        const at = new Date(`${selected}T${form.time || "09:00"}`).getTime() - Number(form.remind) * 60000;
        if (at < Date.now()) note = "（通知の時刻が過ぎているため、通知は登録していません）";
        else {
          try {
            await ensurePushReady(user);
            reminderId = (await reminderApi(user, { action: "create", text: `${form.time || "終日"} ${form.title.trim()}`, dueAt: at, url: "/?open=calendar" })).id;
          } catch (err) { note = `（${err.message}）`; }
        }
      }
      await addDoc(dataCol(db, appId, "events"), {
        ownerUid: user.uid, title: form.title.trim(), date: selected, time: form.time || "", memo: form.memo.trim(), reminderId, createdAt: serverTimestamp(),
      });
      if (note) showNotification?.("予定を保存しました" + note);
      setModal(false);
      setForm({ title: "", time: "", memo: "", remind: "" });
    } catch (e) {
      showNotification?.("保存に失敗しました");
    }
  };

  const addTodo = async () => {
    const t = todoText.trim();
    if (!t) return;
    setTodoText("");
    try {
      await addDoc(dataCol(db, appId, "todos"), { ownerUid: user.uid, text: t, done: false, createdAt: serverTimestamp() });
    } catch (e) {
      showNotification?.("追加に失敗しました");
    }
  };

  const sortedTodos = [...todos].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || toMillis(b.createdAt) - toMillis(a.createdAt));

  return (
    <div className="flex flex-col h-full bg-white">
      <PageHeader title="カレンダー" onBack={() => setView("services")} />
      <div className="flex border-b shrink-0">
        {[["calendar", "予定"], ["todo", "ToDo"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex-1 py-3 text-sm font-bold border-b-2 ${tab === id ? "border-green-500 text-green-600" : "border-transparent text-gray-400"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "calendar" && (
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => setCursor(new Date(y, mo - 1, 1))} className="p-2 rounded-full hover:bg-gray-100"><ChevronLeft className="w-5 h-5" /></button>
            <div className="font-bold">{y}年{mo + 1}月</div>
            <button onClick={() => setCursor(new Date(y, mo + 1, 1))} className="p-2 rounded-full hover:bg-gray-100"><ChevronRight className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-7 px-2 text-center text-[11px] font-bold">
            {WEEK.map((w, i) => (
              <div key={w} className={`py-1 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400"}`}>{w}</div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const key = keyOf(d);
              const isToday = key === ymd(today);
              const isSel = key === selected;
              const hasEv = !!eventsByDay[key]?.length;
              const hasBd = !!birthdays[key.slice(5)];
              const dow = (firstDow + d - 1) % 7;
              return (
                <button key={key} onClick={() => setSelected(key)} className="py-1.5 flex flex-col items-center gap-0.5">
                  <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm ${isSel ? "bg-green-500 text-white font-bold" : isToday ? "ring-2 ring-green-400" : ""} ${!isSel && dow === 0 ? "text-red-500" : ""} ${!isSel && dow === 6 ? "text-blue-500" : ""}`}>
                    {d}
                  </span>
                  <span className="h-1.5 flex gap-0.5">
                    {hasEv && <i className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                    {hasBd && <i className="w-1.5 h-1.5 rounded-full bg-pink-400" />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-2 border-t px-4 py-3">
            <div className="flex items-center mb-2">
              <div className="font-bold text-sm flex-1">{selected.replaceAll("-", "/")}</div>
              <button onClick={() => setModal(true)} className="flex items-center gap-1 text-green-600 text-xs font-bold px-3 py-1.5 bg-green-50 rounded-full">
                <Plus className="w-4 h-4" />予定を追加
              </button>
            </div>
            {selectedBirthdays.map((n) => (
              <div key={n} className="flex items-center gap-2 py-2 text-sm"><Cake className="w-4 h-4 text-pink-400" />{n}の誕生日</div>
            ))}
            {selectedEvents.map((e) => (
              <div key={e.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                <div className="text-xs text-gray-400 w-12 pt-0.5">{e.time || "終日"}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold break-words">{e.title}</div>
                  {e.memo && <div className="text-xs text-gray-500 whitespace-pre-wrap break-words">{e.memo}</div>}
                </div>
                <a href={googleCalUrl(e)} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-300 hover:text-blue-500" aria-label="Googleカレンダーに追加" title="Googleカレンダーに追加"><CalendarPlus className="w-4 h-4" /></a>
                <button onClick={() => downloadIcs(e)} className="p-1 text-gray-300 hover:text-blue-500" aria-label=".icsを保存" title=".icsを保存（他のカレンダーに取り込み）"><Download className="w-4 h-4" /></button>
                <button onClick={() => { if (!window.confirm("この予定を削除しますか？")) return; if (e.reminderId) reminderApi(user, { action: "delete", id: e.reminderId }).catch(() => {}); deleteDoc(dataDoc(db, appId, "events", e.id)); }} className="p-1 text-gray-300 hover:text-red-500" aria-label="削除">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {selectedEvents.length === 0 && selectedBirthdays.length === 0 && <EmptyState title="予定はありません" />}
          </div>
        </div>
      )}

      {tab === "todo" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {sortedTodos.length === 0 && <EmptyState title="ToDoはありません" hint="下の入力欄から追加できます" />}
            {sortedTodos.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b">
                <button onClick={() => updateDoc(dataDoc(db, appId, "todos", t.id), { done: !t.done })} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${t.done ? "bg-green-500 border-green-500" : "border-gray-300"}`} aria-label="完了">
                  {t.done && <Check className="w-4 h-4 text-white" />}
                </button>
                <span className={`flex-1 text-sm break-words ${t.done ? "line-through text-gray-400" : ""}`}>{t.text}</span>
                <button onClick={() => deleteDoc(dataDoc(db, appId, "todos", t.id))} className="p-1 text-gray-300 hover:text-red-500" aria-label="削除"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <div className="p-2 border-t flex gap-2 bg-white">
            <input value={todoText} onChange={(e) => setTodoText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && addTodo()} placeholder="ToDoを追加" className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm outline-none" />
            <button onClick={addTodo} className="px-4 rounded-full bg-green-500 text-white text-sm font-bold">追加</button>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-[300] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setModal(false)}>
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold">{selected.replaceAll("-", "/")} の予定</div>
            <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="タイトル" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none" />
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none" />
            <select value={form.remind} onChange={(e) => setForm({ ...form, remind: e.target.value })} className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none">
              {REMIND_OPTIONS.map(([v, l]) => <option key={v} value={v}>{v === "" ? "通知: なし" : `通知: ${l}`}</option>)}
            </select>
            <textarea value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} rows={2} placeholder="メモ（任意）" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none resize-none" />
            <div className="flex gap-2">
              <button onClick={() => setModal(false)} className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-sm text-gray-600">キャンセル</button>
              <button onClick={addEvent} className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
