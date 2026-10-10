// トーク内の追加メッセージ種別: 位置情報 / 投票
import React, { useState } from "react";
import { MapPin, BarChart3, Plus, X, Loader2, Navigation } from "lucide-react";
import { doc, updateDoc, deleteField } from "firebase/firestore";

const dataMsgRef = (db, appId, chatId, msgId) =>
  doc(db, "artifacts", appId, "public", "data", "chats", chatId, "messages", msgId);

const toTile = (lat, lon, z) => {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { tx: Math.floor(x), ty: Math.floor(y), fx: x - Math.floor(x), fy: y - Math.floor(y) };
};

// ---- 位置情報メッセージ（type: "location"）
export const LocationCard = ({ m }) => {
  const lat = Number(m.lat), lon = Number(m.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return <div className="text-xs">位置情報を表示できません</div>;
  const z = 15;
  const { tx, ty, fx, fy } = toTile(lat, lon, z);
  const link = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="block w-56 rounded-xl overflow-hidden bg-white border text-gray-800">
      <div className="relative w-56 h-36 overflow-hidden bg-gray-100">
        <img src={`https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`} alt="地図" className="absolute left-1/2 top-1/2 max-w-none" style={{ width: 256, height: 256, transform: `translate(${-fx * 256}px, ${-fy * 256}px)`, left: "50%", top: "50%" }} />
        <MapPin className="absolute left-1/2 top-1/2 w-7 h-7 text-red-500 fill-red-500/30 -translate-x-1/2 -translate-y-full" />
      </div>
      <div className="px-3 py-2">
        <div className="text-xs font-bold truncate">{m.label || "現在地"}</div>
        <div className="text-[10px] text-gray-400">{lat.toFixed(5)}, {lon.toFixed(5)} ・ © OpenStreetMap</div>
      </div>
    </a>
  );
};

export const LocationSendModal = ({ onClose, onSend, showNotification }) => {
  const [pos, setPos] = useState(null);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);

  const locate = () => {
    if (!navigator.geolocation) return showNotification?.("位置情報が使えません");
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setLoading(false); },
      () => { setLoading(false); showNotification?.("位置情報を取得できませんでした"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-[430px] rounded-t-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold flex items-center gap-2"><MapPin className="w-5 h-5 text-red-500" />位置情報を送る</div>
        {!pos ? (
          <button onClick={locate} disabled={loading} className="w-full py-4 rounded-2xl bg-gray-100 text-sm font-bold flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}現在地を取得
          </button>
        ) : (
          <>
            <LocationCard m={{ lat: pos.lat, lng: pos.lng, label }} />
            <input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="場所の名前（任意）" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none" />
          </>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-sm text-gray-600">キャンセル</button>
          <button disabled={!pos} onClick={() => onSend({ lat: pos.lat, lng: pos.lng, label: label.trim() })} className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm disabled:opacity-40">送信</button>
        </div>
      </div>
    </div>
  );
};

// ---- 投票メッセージ（type: "poll"）  votes: { [uid]: number[] }
export const PollCard = ({ m, user, db, appId, chatId }) => {
  const options = Array.isArray(m.options) ? m.options : [];
  const votes = m.votes || {};
  const mine = Array.isArray(votes[user.uid]) ? votes[user.uid] : [];
  const voters = Object.values(votes).filter((v) => Array.isArray(v) && v.length > 0).length;
  const counts = options.map((_, i) => Object.values(votes).filter((v) => Array.isArray(v) && v.includes(i)).length);

  const vote = async (i) => {
    let next;
    if (m.multiple) next = mine.includes(i) ? mine.filter((x) => x !== i) : [...mine, i];
    else next = mine.includes(i) ? [] : [i];
    try {
      await updateDoc(dataMsgRef(db, appId, chatId, m.id), { [`votes.${user.uid}`]: next.length ? next : deleteField() });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="w-60 bg-white text-gray-800 rounded-xl border p-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-600 mb-1"><BarChart3 className="w-3.5 h-3.5" />投票{m.multiple ? "（複数選択可）" : ""}</div>
      <div className="font-bold text-sm mb-2 break-words">{m.content}</div>
      <div className="space-y-1.5">
        {options.map((o, i) => {
          const pct = voters ? Math.round((counts[i] / voters) * 100) : 0;
          const sel = mine.includes(i);
          return (
            <button key={i} onClick={() => vote(i)} className={`relative w-full text-left rounded-lg border overflow-hidden px-3 py-2 ${sel ? "border-green-500" : "border-gray-200"}`}>
              <span className={`absolute inset-y-0 left-0 ${sel ? "bg-green-100" : "bg-gray-100"}`} style={{ width: `${pct}%` }} />
              <span className="relative flex items-center text-xs">
                <span className="flex-1 break-words font-bold">{o}</span>
                <span className="text-gray-500 ml-2">{counts[i]}票</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="text-[10px] text-gray-400 mt-2">{voters}人が投票</div>
    </div>
  );
};

export const PollCreateModal = ({ onClose, onSend, showNotification }) => {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);

  const submit = () => {
    const options = opts.map((o) => o.trim()).filter(Boolean);
    if (!q.trim()) return showNotification?.("質問を入力してください");
    if (options.length < 2) return showNotification?.("選択肢は2つ以上必要です");
    onSend({ question: q.trim(), options, multiple });
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-[430px] rounded-t-3xl p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-green-500" />投票を作成</div>
        <input value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder="質問（例：ランチどこにする？）" className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none" />
        {opts.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={o} maxLength={40} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`選択肢 ${i + 1}`} className="flex-1 bg-gray-100 rounded-xl px-4 py-3 text-sm outline-none" />
            {opts.length > 2 && <button onClick={() => setOpts(opts.filter((_, j) => j !== i))} className="p-2 text-gray-400" aria-label="削除"><X className="w-4 h-4" /></button>}
          </div>
        ))}
        {opts.length < 6 && (
          <button onClick={() => setOpts([...opts, ""])} className="text-green-600 text-xs font-bold flex items-center gap-1"><Plus className="w-4 h-4" />選択肢を追加</button>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />複数選択を許可</label>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-sm text-gray-600">キャンセル</button>
          <button onClick={submit} className="flex-1 py-3 rounded-xl bg-green-500 text-white font-bold text-sm">作成して送信</button>
        </div>
      </div>
    </div>
  );
};

// チャットの「＋」メニューに追加する項目（位置情報 / 投票）
export const ChatPlusItems = ({ onLocation, onPoll }) => (
  <>
    <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={onLocation}>
      <div className="p-3 bg-red-50 rounded-2xl"><MapPin className="w-6 h-6 text-red-500" /></div>
      <span className="text-[10px] font-bold">位置情報</span>
    </div>
    <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={onPoll}>
      <div className="p-3 bg-emerald-50 rounded-2xl"><BarChart3 className="w-6 h-6 text-emerald-600" /></div>
      <span className="text-[10px] font-bold">投票</span>
    </div>
  </>
);
