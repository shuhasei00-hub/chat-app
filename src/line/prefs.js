// 通知設定（端末ごと・localStorage）。サーバー側で効かせる項目は pushClient.syncPush が送ります。
const PREF_KEY = "notifyPrefs";

export const DEFAULT_PREFS = { launch: true, message: true, news: true, call: true, reminder: true, preview: true, vibrate: true };

export const getPrefs = () => {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") }; }
  catch { return { ...DEFAULT_PREFS }; }
};
export const setPrefs = (patch) => {
  const next = { ...getPrefs(), ...patch };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* 無視 */ }
  return next;
};

export const getMutedChats = () => { try { return JSON.parse(localStorage.getItem("mutedChats") || "[]"); } catch { return []; } };
