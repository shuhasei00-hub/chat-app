// プッシュ通知用の VAPID 鍵ペアを生成します:  npm run vapid
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");

console.log("以下を Cloudflare > Worker > 設定 > 変数とシークレット に登録してください（ローカルは .dev.vars）\n");
console.log(`VAPID_PUBLIC_KEY=${pub}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}   ← 秘密。公開・コミット厳禁`);
console.log("VAPID_SUBJECT=mailto:あなたのメールアドレス");
