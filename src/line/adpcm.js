// 軽量な音声保存形式（IMA ADPCM・4ビット）。16bit の PCM より容量が 1/4 になります。
// 7分の音楽でも 16kHz で約 3.4MB。音質は少し下がりますが、着信音には十分です。
// ファイル構造: "IMAA"(4) + サンプリング周波数(u32) + サンプル数(u32) + 予約(u32) + 4ビットデータ（下位ニブルが先）
const STEPS = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767];
const IDX = [-1, -1, -1, -1, 2, 4, 6, 8];
const HEAD = 16;

export const isAdpcm = (ab) => {
  if (!ab || ab.byteLength < HEAD) return false;
  const u = new Uint8Array(ab, 0, 4);
  return u[0] === 0x49 && u[1] === 0x4d && u[2] === 0x41 && u[3] === 0x41; // "IMAA"
};

// samples: Float32Array（-1〜1）→ ArrayBuffer
export const encodeAdpcm = (samples, rate) => {
  const n = samples.length;
  const out = new Uint8Array(HEAD + Math.ceil(n / 2));
  const dv = new DataView(out.buffer);
  out.set([0x49, 0x4d, 0x41, 0x41], 0);
  dv.setUint32(4, rate, true);
  dv.setUint32(8, n, true);
  let pred = 0, index = 0;
  for (let i = 0; i < n; i++) {
    let s = Math.round(samples[i] * 32767);
    if (s > 32767) s = 32767; else if (s < -32768) s = -32768;
    let diff = s - pred;
    let code = 0;
    if (diff < 0) { code = 8; diff = -diff; }
    let step = STEPS[index];
    let vp = step >> 3;
    if (diff >= step) { code |= 4; diff -= step; vp += step; }
    step >>= 1;
    if (diff >= step) { code |= 2; diff -= step; vp += step; }
    step >>= 1;
    if (diff >= step) { code |= 1; vp += step; }
    pred += code & 8 ? -vp : vp;
    if (pred > 32767) pred = 32767; else if (pred < -32768) pred = -32768;
    index += IDX[code & 7];
    if (index < 0) index = 0; else if (index > 88) index = 88;
    const pos = HEAD + (i >> 1);
    out[pos] |= i & 1 ? code << 4 : code;
  }
  return out.buffer;
};

// ArrayBuffer → { samples: Float32Array, rate }
export const decodeAdpcm = (ab) => {
  const dv = new DataView(ab);
  const rate = dv.getUint32(4, true);
  const n = dv.getUint32(8, true);
  const u = new Uint8Array(ab);
  const out = new Float32Array(n);
  let pred = 0, index = 0;
  for (let i = 0; i < n; i++) {
    const b = u[HEAD + (i >> 1)];
    const code = i & 1 ? b >> 4 : b & 15;
    const step = STEPS[index];
    let vp = step >> 3;
    if (code & 4) vp += step;
    if (code & 2) vp += step >> 1;
    if (code & 1) vp += step >> 2;
    pred += code & 8 ? -vp : vp;
    if (pred > 32767) pred = 32767; else if (pred < -32768) pred = -32768;
    index += IDX[code & 7];
    if (index < 0) index = 0; else if (index > 88) index = 88;
    out[i] = pred / 32768;
  }
  return { samples: out, rate };
};
