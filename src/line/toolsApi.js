// 便利ツール（翻訳・為替・Wikipedia）のAPI呼び出し。サーバー側は functions/api/tools/[name].js
export const LANGS = [
  ["ja", "日本語"], ["en", "英語"], ["zh-CN", "中国語(簡体)"], ["zh-TW", "中国語(繁体)"], ["ko", "韓国語"],
  ["es", "スペイン語"], ["fr", "フランス語"], ["de", "ドイツ語"], ["it", "イタリア語"], ["pt", "ポルトガル語"],
  ["ru", "ロシア語"], ["th", "タイ語"], ["vi", "ベトナム語"], ["id", "インドネシア語"],
];

export const CURRENCIES = [
  ["JPY", "日本円"], ["USD", "米ドル"], ["EUR", "ユーロ"], ["GBP", "英ポンド"], ["CNY", "中国元"], ["KRW", "韓国ウォン"],
  ["AUD", "豪ドル"], ["CAD", "カナダドル"], ["CHF", "スイスフラン"], ["HKD", "香港ドル"], ["SGD", "シンガポールドル"],
  ["THB", "タイバーツ"], ["INR", "インドルピー"], ["NZD", "NZドル"],
];

// ひらがな/カタカナがあれば日本語、ハングルなら韓国語、漢字のみなら中国語、それ以外は英語とみなす簡易判定
export const detectLang = (t) =>
  /[\u3040-\u30ff]/.test(t) ? "ja" : /[\uac00-\ud7af]/.test(t) ? "ko" : /[\u4e00-\u9fff]/.test(t) ? "zh-CN" : "en";

const getJson = async (url) => {
  let res;
  try { res = await fetch(url); } catch { throw new Error("サーバーに接続できません"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "取得に失敗しました");
  return data;
};

export const translateText = async (text, from, to) =>
  (await getJson(`/api/tools/translate?q=${encodeURIComponent(text)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).text;

export const fetchRates = (from, toList) => getJson(`/api/tools/fx?from=${from}&to=${toList.join(",")}`);

export const wikiSearch = async (q) => (await getJson(`/api/tools/wiki?q=${encodeURIComponent(q)}`)).results || [];
export const wikiSummary = (title) => getJson(`/api/tools/wiki?title=${encodeURIComponent(title)}`);
