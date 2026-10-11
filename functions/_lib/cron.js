// Cron Trigger（毎分）から呼ばれる: 時刻になったリマインダーをプッシュ通知する
import { commit, queryServer } from "./firestore.js";
import { pushConfigured, sendToUser } from "./push.js";

export const processReminders = async (env) => {
  if (!pushConfigured(env)) return { processed: 0, skipped: "not-configured" };
  const due = await queryServer(env, "reminders", { field: "dueAt", op: "lte", value: Date.now(), orderBy: "dueAt", limit: 50 });
  let processed = 0;
  for (const r of due) {
    // 「削除できた方だけが送る」ことで、Cronが重なっても二重通知にならない
    try { await commit(env, [{ delete: r.__name, currentDocument: { exists: true } }]); } catch { continue; }
    await sendToUser(env, r.uid, {
      type: "reminder", title: "⏰ リマインダー", body: r.text, tag: `reminder-${r.__id}`, url: r.url || "/", vibrate: [300, 150, 300, 150, 300],
    }, { kind: "reminder", ttl: 24 * 3600, urgency: "high" }).catch(() => {});
    processed++;
  }
  return { processed };
};
