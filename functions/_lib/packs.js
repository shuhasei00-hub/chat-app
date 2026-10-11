// チャージ額（サーバー側が正。クライアントは /api/pay/providers から取得して表示します）
// 金額・コイン数を変える場合はここだけ編集してください。
export const PACKS = [
  { id: "p300", yen: 300, coins: 300, label: "300コイン" },
  { id: "p500", yen: 500, coins: 520, label: "500コイン (+20)" },
  { id: "p1000", yen: 1000, coins: 1100, label: "1,000コイン (+100)" },
  { id: "p3000", yen: 3000, coins: 3500, label: "3,000コイン (+500)" },
  { id: "p10000", yen: 10000, coins: 12000, label: "10,000コイン (+2,000)" },
];
export const findPack = (id) => PACKS.find((p) => p.id === id);
