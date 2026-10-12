// チャージ額（サーバー側が正。クライアントは /api/pay/providers から取得して表示します）
// 金額・コイン数を変える場合はここだけ編集してください。
// ※ fincode のコンビニ決済は手数料が「3.6%・1件あたり最低150円」のため、500円未満は手数料負けします（500円で約30%、1,000円で15%）。
export const PACKS = [
  { id: "p500", yen: 500, coins: 500, label: "500コイン" },
  { id: "p1000", yen: 1000, coins: 1100, label: "1,000コイン (+100)" },
  { id: "p3000", yen: 3000, coins: 3500, label: "3,000コイン (+500)" },
  { id: "p10000", yen: 10000, coins: 12000, label: "10,000コイン (+2,000)" },
];
export const findPack = (id) => PACKS.find((p) => p.id === id);
