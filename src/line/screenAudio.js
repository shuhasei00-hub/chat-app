// 画面共有の「音声つき」対応。
// ・画面（タブ/システム）の音と自分のマイクを1本にまぜて、送信中の音声トラックを差し替えます
//   （差し替えなので通話の再接続は不要。相手にはマイクの声 + 再生中の動画の音が聞こえます）
// ・マイクをミュートすると、マイクの声だけが消え、動画の音は流れ続けます
// ・共有を止めると自動でマイクだけの状態に戻ります

const toast = (msg) => {
  try {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = "position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:100000;background:rgba(17,24,39,.92);color:#fff;font:700 12px sans-serif;padding:10px 16px;border-radius:999px;max-width:90vw;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.3)";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  } catch { /* 無視 */ }
};

// 画面共有の取得（音声つき）。音声に対応していないブラウザでは映像だけにもどす。
export const requestScreen = async () => {
  const md = navigator.mediaDevices;
  if (!md?.getDisplayMedia) throw new Error("このブラウザでは画面共有が使えません。");
  try {
    return await md.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 30 } },
      // 音楽・動画をそのまま送るため、通話用の加工（ノイズ除去など）は切る
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
      systemAudio: "include",
    });
  } catch (e) {
    if (e?.name === "NotAllowedError" || e?.name === "AbortError" || e?.name === "NotFoundError") throw e; // 選択のキャンセルなど
    return md.getDisplayMedia({ video: true, audio: false });
  }
};

const audioSender = (pc, track) => pc.getSenders().find((s) => s.track && s.track === track) || null;

// displayStream の音声を、localStream のマイクとまぜて pcs の音声送信に流す。
// 成功したら true（音声が含まれていなければ false とお知らせを出す）
export const startScreenAudio = async (displayStream, localStream, getPcs) => {
  const screenTrack = displayStream?.getAudioTracks?.()[0];
  if (!screenTrack) {
    toast("動画の音は共有されていません。共有の選択画面で「音声も共有」にチェックを入れてください（Chromeは「タブ」の共有で選べます）");
    return false;
  }
  const mic = localStream?.getAudioTracks?.()[0] || null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try {
    const ctx = new AC();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const dest = ctx.createMediaStreamDestination();
    if (mic) ctx.createMediaStreamSource(new MediaStream([mic])).connect(dest); // mic.enabled=false なら無音になる
    const g = ctx.createGain();
    g.gain.value = 1;
    ctx.createMediaStreamSource(new MediaStream([screenTrack])).connect(g);
    g.connect(dest);
    const mixed = dest.stream.getAudioTracks()[0];

    let replaced = 0;
    for (const pc of getPcs() || []) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "audio");
      if (!sender) continue;
      try { await sender.replaceTrack(mixed); replaced++; } catch { /* 無視 */ }
    }
    if (!replaced) { ctx.close().catch(() => {}); toast("相手に音声を送る準備ができていません。少し待ってからやり直してください"); return false; }
    displayStream.__mix = { ctx, mixed, mic, getPcs };
    toast("動画の音も共有しています（共有中の音量は相手側で調整できます）");
    return true;
  } catch (e) {
    console.warn("startScreenAudio failed:", e);
    return false;
  }
};

// 共有を止めたとき: 送信をマイクだけにもどして後片づけ
export const stopScreenAudio = async (displayStream) => {
  const m = displayStream?.__mix;
  if (!m) return;
  displayStream.__mix = null;
  try {
    for (const pc of m.getPcs() || []) {
      const sender = audioSender(pc, m.mixed);
      if (sender) await sender.replaceTrack(m.mic).catch(() => {});
    }
  } catch { /* 無視 */ }
  try { m.mixed.stop(); } catch { /* 無視 */ }
  try { await m.ctx.close(); } catch { /* 無視 */ }
};
