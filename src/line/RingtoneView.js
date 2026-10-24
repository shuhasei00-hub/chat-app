// 着信音の設定: 内蔵音 / 自分の音声ファイル（長くても好きな区間を切り出し）/ 音量 / 振動 / おやすみ時間 / 友だち別
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Trash2, Upload, Check, Music, Loader2, Scissors, Moon } from "lucide-react";
import { PageHeader } from "./common";
import { playPreview, stopPreview, previewVibrate } from "./ring";
import {
  MAX_SEC, MAX_TONES, PRESETS_IN, PRESETS_OUT, VIBRATE_PATTERNS,
  getRingSettings, setRingSettings, listTones, saveTone, deleteTone,
  decodeFile, getPeaks, trimToWav,
} from "./ringtones";

const Section = ({ title, hint, children }) => (
  <div className="mt-4">
    <div className="px-4 pb-2 text-xs font-bold text-gray-400">{title}</div>
    <div className="bg-white border-y divide-y">{children}</div>
    {hint && <div className="px-4 pt-1.5 text-[10px] text-gray-400 leading-snug">{hint}</div>}
  </div>
);

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;

const ToneRow = ({ name, sub, selected, playing, onSelect, onPlay, onDelete }) => (
  <div className="flex items-center gap-3 px-4 py-2.5">
    <button onClick={onSelect} className="flex items-center gap-3 flex-1 min-w-0 text-left">
      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? "bg-green-500 border-green-500" : "border-gray-300"}`}>
        {selected && <Check className="w-3 h-3 text-white" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold truncate">{name}</span>
        {sub && <span className="block text-[11px] text-gray-400">{sub}</span>}
      </span>
    </button>
    {onPlay && (
      <button onClick={onPlay} aria-label={playing ? "停止" : "試聴"} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
        {playing ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
    )}
    {onDelete && (
      <button onClick={onDelete} aria-label="削除" className="w-9 h-9 rounded-full bg-red-50 text-red-500 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
    )}
  </div>
);

// ---- 区間の切り出し画面 ----
const Trimmer = ({ file, onCancel, onSaved, showNotification }) => {
  const [buf, setBuf] = useState(null);
  const [peaks, setPeaks] = useState([]);
  const [err, setErr] = useState("");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(MAX_SEC);
  const [fade, setFade] = useState(true);
  const [name, setName] = useState(file.name.replace(/\.[^.]+$/, "").slice(0, 30));
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const srcRef = useRef(null);
  const ctxRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    let dead = false;
    decodeFile(file).then((b) => {
      if (dead) return;
      setBuf(b);
      setPeaks(getPeaks(b, 120));
      setStart(0);
      setEnd(Math.min(b.duration, MAX_SEC));
    }).catch((e) => !dead && setErr(e.message));
    return () => { dead = true; stopTrial(); }; // eslint-disable-line react-hooks/exhaustive-deps
  }, [file]);

  const dur = buf?.duration || 0;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !peaks.length) return;
    const w = cv.width, h = cv.height, g = cv.getContext("2d");
    g.clearRect(0, 0, w, h);
    const bw = w / peaks.length;
    peaks.forEach((p, i) => {
      const t = (i / peaks.length) * dur;
      g.fillStyle = t >= start && t <= end ? "#22c55e" : "#d1d5db";
      const bh = Math.max(2, p * h);
      g.fillRect(i * bw + 0.5, (h - bh) / 2, Math.max(1, bw - 1), bh);
    });
  }, [peaks, start, end, dur]);

  function stopTrial() {
    try { srcRef.current?.stop(); } catch { /* 無視 */ }
    try { ctxRef.current?.close(); } catch { /* 無視 */ }
    srcRef.current = null; ctxRef.current = null;
    setPlaying(false);
  }
  const trial = () => {
    if (playing) return stopTrial();
    stopPreview();
    const C = window.AudioContext || window.webkitAudioContext;
    const c = new C();
    const s = c.createBufferSource();
    s.buffer = buf;
    s.connect(c.destination);
    const len = Math.min(MAX_SEC, end - start);
    s.start(0, start, len);
    s.onended = () => stopTrial();
    ctxRef.current = c; srcRef.current = s;
    setPlaying(true);
  };

  const onStart = (v) => {
    v = Math.min(Number(v), dur - 0.5);
    setStart(v);
    if (end - v > MAX_SEC) setEnd(v + MAX_SEC);
    if (end - v < 0.5) setEnd(Math.min(dur, v + 0.5));
  };
  const onEnd = (v) => {
    v = Math.max(Number(v), 0.5);
    setEnd(v);
    if (v - start > MAX_SEC) setStart(v - MAX_SEC);
    if (v - start < 0.5) setStart(Math.max(0, v - 0.5));
  };

  const save = async () => {
    setSaving(true);
    try {
      stopTrial();
      const { blob, duration } = await trimToWav(buf, start, end, { fade: fade ? 0.4 : 0.02 });
      await saveTone({ id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || "マイ着信音", blob, duration, createdAt: Date.now() });
      showNotification?.("着信音を追加しました");
      onSaved();
    } catch (e) { showNotification?.(e.message || "保存できませんでした"); setSaving(false); }
  };

  return (
    <div className="bg-white border-y p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold"><Scissors className="w-4 h-4 text-green-600" />使う部分を選ぶ<span className="ml-auto text-[10px] text-gray-400 font-normal">最大{MAX_SEC}秒</span></div>
      {err && <div className="text-xs text-red-500 bg-red-50 rounded-lg p-3">{err}</div>}
      {!buf && !err && <div className="flex items-center gap-2 text-xs text-gray-400 py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" />読み込み中…（長い曲は少し時間がかかります）</div>}
      {buf && (
        <>
          <div className="text-[11px] text-gray-500">元の長さ {fmt(dur)} ／ 選択 {fmt(start)} 〜 {fmt(end)}（<b className="text-green-600">{(end - start).toFixed(1)}秒</b>）</div>
          <canvas ref={canvasRef} width={480} height={70} className="w-full h-[70px] rounded-lg bg-gray-50" />
          <label className="block text-[11px] font-bold text-gray-500">開始位置
            <input type="range" min={0} max={dur} step={0.1} value={start} onChange={(e) => onStart(e.target.value)} className="w-full accent-green-500" />
          </label>
          <label className="block text-[11px] font-bold text-gray-500">終了位置
            <input type="range" min={0} max={dur} step={0.1} value={end} onChange={(e) => onEnd(e.target.value)} className="w-full accent-green-500" />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={fade} onChange={(e) => setFade(e.target.checked)} className="accent-green-500" />最初と最後をなめらかにする（フェード）</label>
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} placeholder="着信音の名前" className="w-full bg-gray-50 border rounded-xl px-3 py-2.5 text-sm outline-none" />
          <div className="flex gap-2">
            <button onClick={trial} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-sm font-bold flex items-center justify-center gap-1.5">{playing ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}{playing ? "停止" : "試聴"}</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-green-500 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">{saving && <Loader2 className="w-4 h-4 animate-spin" />}この部分を保存</button>
          </div>
        </>
      )}
      <button onClick={() => { stopTrial(); onCancel(); }} className="w-full text-xs text-gray-400 py-1">キャンセル</button>
    </div>
  );
};

const RingtoneView = ({ profile, allUsers, setView, showNotification }) => {
  const [st, setSt] = useState(getRingSettings());
  const [tones, setTones] = useState([]);
  const [file, setFile] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const fileRef = useRef(null);

  const patch = (p) => setSt(setRingSettings(p));
  const reload = useCallback(() => listTones().then(setTones), []);
  useEffect(() => { reload(); return () => stopPreview(); }, [reload]);

  const play = (ref, outgoing = false) => {
    const key = outgoing ? `out:${ref.split(":")[1]}` : ref;
    if (playingId === key) { stopPreview(); setPlayingId(null); return; }
    setPlayingId(key);
    playPreview(ref, { outgoing, onEnd: () => setPlayingId((c) => (c === key ? null : c)) });
  };

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (tones.length >= MAX_TONES) return showNotification?.(`保存できるのは${MAX_TONES}個までです。不要なものを削除してください`);
    if (f.type && !f.type.startsWith("audio/") && !f.type.startsWith("video/")) return showNotification?.("音声ファイルを選んでください");
    stopPreview(); setPlayingId(null);
    setFile(f);
  };

  const remove = async (t) => {
    if (!window.confirm(`「${t.name}」を削除しますか？`)) return;
    await deleteTone(t.id);
    setSt(getRingSettings());
    reload();
  };

  const friends = useMemo(() => (profile?.friends || []).map((uid) => allUsers?.find((u) => u.uid === uid)).filter(Boolean), [profile?.friends, allUsers]);
  const toneOptions = [
    ...PRESETS_IN.map((p) => [`preset:${p.id}`, p.name]),
    ...tones.map((t) => [`custom:${t.id}`, `♪ ${t.name}`]),
  ];
  const setFriendTone = (uid, ref) => {
    const pu = { ...st.perUser };
    if (ref) pu[uid] = ref; else delete pu[uid];
    patch({ perUser: pu });
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <PageHeader title="着信音・振動" onBack={() => { stopPreview(); setView("settings"); }} />
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-10">

        <Section title="着信音" hint="試聴ボタンで鳴らせます。自分の音声ファイルは長くても大丈夫です。好きな部分（最大30秒）だけを選んで保存できます。">
          {PRESETS_IN.map((p) => (
            <ToneRow key={p.id} name={p.name} selected={st.incoming === `preset:${p.id}`} playing={playingId === `preset:${p.id}`}
              onSelect={() => patch({ incoming: `preset:${p.id}` })} onPlay={() => play(`preset:${p.id}`)} />
          ))}
          {tones.map((t) => (
            <ToneRow key={t.id} name={`♪ ${t.name}`} sub={`${t.duration.toFixed(1)}秒`} selected={st.incoming === `custom:${t.id}`} playing={playingId === `custom:${t.id}`}
              onSelect={() => patch({ incoming: `custom:${t.id}` })} onPlay={() => play(`custom:${t.id}`)} onDelete={() => remove(t)} />
          ))}
          {!file && (
            <button onClick={() => fileRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-green-600">
              <Upload className="w-5 h-5" /><span className="text-sm font-bold">音声ファイルから追加</span><Music className="w-4 h-4 ml-auto text-gray-300" />
            </button>
          )}
          <input ref={fileRef} type="file" accept="audio/*,video/mp4,.mp3,.m4a,.wav,.ogg,.aac,.flac" className="hidden" onChange={pick} />
        </Section>
        {file && <Trimmer file={file} showNotification={showNotification} onCancel={() => setFile(null)} onSaved={() => { setFile(null); reload(); }} />}

        <Section title="発信音（呼び出し中）">
          {PRESETS_OUT.map((p) => (
            <ToneRow key={p.id} name={p.name} selected={st.outgoing === `preset:${p.id}`} playing={playingId === `out:${p.id}`}
              onSelect={() => patch({ outgoing: `preset:${p.id}` })} onPlay={p.steps.length ? () => play(`preset:${p.id}`, true) : undefined} />
          ))}
        </Section>

        <Section title="音量・振動">
          <div className="px-4 py-3">
            <div className="flex justify-between text-sm font-bold"><span>着信音の音量</span><span className="text-gray-400 text-xs">{Math.round(st.volume * 100)}%</span></div>
            <input type="range" min={0.1} max={1} step={0.05} value={st.volume} onChange={(e) => patch({ volume: Number(e.target.value) })} className="w-full accent-green-500" />
          </div>
          <div className="px-4 py-3">
            <div className="flex justify-between text-sm font-bold"><span>繰り返しの間隔</span><span className="text-gray-400 text-xs">{st.gap.toFixed(1)}秒</span></div>
            <input type="range" min={0.2} max={5} step={0.1} value={st.gap} onChange={(e) => patch({ gap: Number(e.target.value) })} className="w-full accent-green-500" />
            <div className="text-[10px] text-gray-400">自分の音声を使うとき、繰り返しの間の無音の長さです</div>
          </div>
          <div className="px-4 py-3 flex items-center gap-3">
            <span className="flex-1 text-sm font-bold">振動パターン</span>
            <select value={st.vibratePattern} onChange={(e) => { patch({ vibratePattern: e.target.value }); previewVibrate(e.target.value); }} className="bg-gray-100 rounded-lg px-2 py-1.5 text-sm font-bold outline-none">
              {Object.entries(VIBRATE_PATTERNS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
            </select>
          </div>
          <div className="px-4 py-3 flex items-center gap-3">
            <span className="flex-1 text-sm font-bold">自動で止めるまで</span>
            <select value={st.autoStopSec} onChange={(e) => patch({ autoStopSec: Number(e.target.value) })} className="bg-gray-100 rounded-lg px-2 py-1.5 text-sm font-bold outline-none">
              {[[15, "15秒"], [30, "30秒"], [60, "1分"], [120, "2分"], [0, "止めない"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </Section>

        <Section title="おやすみ時間" hint="この時間帯の着信では音を鳴らしません（着信画面は表示されます）。">
          <button onClick={() => patch({ quiet: { ...st.quiet, on: !st.quiet.on } })} className="w-full flex items-center gap-3 px-4 py-3 text-left">
            <Moon className="w-5 h-5 text-indigo-400" />
            <span className="flex-1 text-sm font-bold">おやすみ時間を使う</span>
            <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${st.quiet.on ? "bg-green-500" : "bg-gray-300"}`}><span className={`block w-5 h-5 rounded-full bg-white transition-transform ${st.quiet.on ? "translate-x-5" : ""}`} /></span>
          </button>
          {st.quiet.on && (
            <>
              <div className="px-4 py-3 flex items-center gap-2 text-sm font-bold">
                <input type="time" value={st.quiet.from} onChange={(e) => patch({ quiet: { ...st.quiet, from: e.target.value } })} className="bg-gray-100 rounded-lg px-2 py-1.5 outline-none" />
                <span className="text-gray-400">〜</span>
                <input type="time" value={st.quiet.to} onChange={(e) => patch({ quiet: { ...st.quiet, to: e.target.value } })} className="bg-gray-100 rounded-lg px-2 py-1.5 outline-none" />
              </div>
              <button onClick={() => patch({ quiet: { ...st.quiet, silentVibrate: !st.quiet.silentVibrate } })} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <span className="flex-1 text-sm font-bold">振動も止める</span>
                <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${st.quiet.silentVibrate ? "bg-green-500" : "bg-gray-300"}`}><span className={`block w-5 h-5 rounded-full bg-white transition-transform ${st.quiet.silentVibrate ? "translate-x-5" : ""}`} /></span>
              </button>
            </>
          )}
        </Section>

        <Section title="友だち別の着信音" hint="選ばなかった友だちは、上で選んだ着信音になります。">
          {friends.length === 0 && <div className="px-4 py-3 text-xs text-gray-400">友だちがいません</div>}
          {friends.map((u) => (
            <div key={u.uid} className="flex items-center gap-3 px-4 py-2.5">
              <img src={u.avatar} alt="" className="w-9 h-9 rounded-xl object-cover border" />
              <span className="flex-1 text-sm font-bold truncate">{u.name}</span>
              <select value={st.perUser[u.uid] || ""} onChange={(e) => setFriendTone(u.uid, e.target.value)} className="max-w-[9rem] bg-gray-100 rounded-lg px-2 py-1.5 text-xs font-bold outline-none">
                <option value="">共通</option>
                {toneOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
        </Section>

        <p className="px-4 pt-4 text-[10px] text-gray-400 leading-snug">着信音はこの端末にだけ保存され、他の人やサーバーには送られません。アプリを閉じている間の着信は、端末の通知音になります（ブラウザ・OSの仕様）。</p>
      </div>
    </div>
  );
};

export default RingtoneView;
