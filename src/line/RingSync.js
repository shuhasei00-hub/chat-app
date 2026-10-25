// ログイン中だけ、着信音と設定をアカウントにバックアップ/復元する（画面には何も表示しない）
import { useEffect } from "react";
import { startRingSync, stopRingSync } from "./ringSync";

const RingSync = ({ db, appId, uid }) => {
  useEffect(() => {
    if (!db || !uid) return undefined;
    startRingSync({ db, appId, uid });
    return () => stopRingSync();
  }, [db, appId, uid]);
  return null;
};

export default RingSync;
