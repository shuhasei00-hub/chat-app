# chat-app（LINE風 拡張版）

React + Firebase（Auth / Firestore）製のメッセンジャーアプリです。
元のアプリ（トーク、グループ、音声/ビデオ通話、VOOM、スタンプ、ライブ配信、コイン、ミニゲーム）に、
LINEにある機能を追加しました。

## 追加した機能

| 機能 | 場所 | 概要 |
| --- | --- | --- |
| ナビゲーション刷新 | 下部タブ | ホーム / VOOM / ニュース / ウォレット / サービス。ホームに未読バッジ |
| ニュース | `src/line/NewsView.js` | Yahoo!ニュースRSS（9カテゴリ）。記事をKeepに保存可 |
| ウォレット | `src/line/WalletView.js` | 残高、友だちへの送金、利用履歴、毎日のログインボーナス |
| オープンチャット | `src/line/OpenChatView.js` | 公開ルームの検索・カテゴリ絞り込み・作成・参加（参加後は通常のトーク画面） |
| Keep | `src/line/KeepView.js` | 自分用のメモ / リンク / 画像。検索・ピン留め |
| カレンダー / ToDo | `src/line/CalendarView.js` | 月表示、予定の追加、友だちの誕生日表示、ToDo |
| 天気 | `src/line/WeatherView.js` | Open-Meteo（キー不要）。都市検索・現在地・24時間/7日予報 |
| 今日の運勢 | `src/line/FortuneView.js` | 日替わりのおみくじ |
| トーク内：位置情報 | `src/line/ChatExtras.js` | 現在地を地図付きカードで送信（OpenStreetMap） |
| トーク内：投票 | `src/line/ChatExtras.js` | 質問と2〜6択、複数選択可、リアルタイム集計 |
| ブロック | 友だちプロフィール / 設定 | ブロック中ユーザーのメッセージを非表示 |
| 設定 | `src/line/SettingsView.js` | ブロック・非表示の管理、ミュート中トーク、ブラウザ通知、ログアウト |
| サービス一覧 | `src/line/ServicesView.js` | 全機能への入口 |
| PWA | `public/manifest.json` | ホーム画面に追加可能 |

## 既存コードへの変更点（`src/App.js`）

差分は小さく、新機能は `src/line/` に分離しています。

- 先頭に `./line/*` のimportを追加
- `view === ...` に新画面のルーティングを追加
- 下部ナビを `BottomNav` に置き換え（パチンコはサービス一覧へ移動）
- チャットの「＋」メニューに「位置情報」「投票」、メッセージ表示に `location` / `poll` を追加
- ブロック中ユーザーのメッセージをチャット画面で非表示
- 友だちプロフィールにブロックボタンを追加
- チャットからの送金も `wallet_tx` に履歴を記録

`src/news.js` は App 全体の古いコピーで、どこからも使われていなかったため `_backup/news.old.js` に退避しました。`src/lineNewsView.js`（NewsViewの重複コピー）も `_backup/` へ移しました。

## セットアップ

```bash
npm install
npm start          # 開発
npm run build      # 本番ビルド
```

- Firebase の設定は `src/App.js` 冒頭の `firebaseConfig` にあります。
- Firestore のルールは `docs/firestore.rules.example` を参考にしてください。
  新しいコレクション（`keep`, `events`, `todos`, `wallet_tx`）も既存と同じ
  `artifacts/{appId}/public/data/` 配下に作られます。

### ニュースについて

ニュースは `functions/api/news.js`（Cloudflare Pages Functions）経由で取得します。

- **以前ニュースが出なかった原因**: フォルダ名が `fuctions`（typo）だったため、Cloudflare Pages が関数を認識せず `/api/news` が存在しませんでした。`functions` に直してあります。
- Cloudflare Pages にデプロイすると `/api/news` が有効になります（ビルドコマンド `npm run build`、出力 `build`）。`functions/` はリポジトリの**ルート直下**に置いてください。
- `/api/news` が使えない環境（`npm start` など）では、公開プロキシ経由に自動で切り替えます（`src/line/newsApi.js`）。

## 通知

| 通知 | 内容 | 条件 |
| --- | --- | --- |
| 起動時 | アプリを開くと「未読メッセージ N 件」と「最新ニュース」を通知 | 通知を許可 + 設定でON |
| 新着メッセージ | アプリが裏にあるときのみ（ミュート中は除外） | 同上 |
| ニュース速報 | 6時間ごとに確認し、新しい見出しがあれば通知 | Periodic Background Sync 対応ブラウザ（ChromeにインストールしたPWA等） |
| チャージ完了 | コンビニ払いなどが入金されたとき | 同上 |

- 初回ログイン時に「通知をオンにしますか？」のバナーが出ます。設定画面からも切り替えられます。
- 通知タップで該当画面（ニュースなど）が開きます。
- **制限**: Webアプリは「端末の電源を入れた瞬間」には動けません。通知は「アプリ（PWA）を開いたとき」に出ます。アプリを完全に閉じている間のメッセージ通知には、FCM などの Web Push サーバーが別途必要です（`public/sw.js` に `push` 受信処理は入れてあります）。iPhone は「ホーム画面に追加」したPWAでのみ通知が使えます。

## 決済連携（コインチャージ）

サービス > コインチャージ / ウォレット > チャージ から、外部決済サービスの**ホスト型決済ページ**でコインを購入できます。
カード番号などはこのアプリを通らず、各社の決済ページで入力されます。

| # | サービス | 支払い方法 | 必要な環境変数 |
| --- | --- | --- | --- |
| 1 | Stripe | カード / **コンビニ** / PayPay | `STRIPE_SECRET_KEY` |
| 2 | KOMOJU | **コンビニ各社** / Pay-easy / 銀行振込 / PayPay / カード | `KOMOJU_SECRET_KEY` |
| 3 | PayPal | PayPal / カード | `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` |
| 4 | Square | カード | `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID` |
| 5 | PAY.JP | カード | `PAYJP_SECRET_KEY` |

キーを設定したサービスだけ選べます（未設定は「準備中」表示）。全変数は `.dev.vars.example` を参照してください。

### 仕組み（安全のためサーバー側で入金）

1. 画面 → `POST /api/pay/checkout`（Firebase IDトークンで本人確認）→ 事業者の決済ページURLを返し、`payments` に「支払い待ち」を記録
2. お客様が決済ページで支払い（コンビニは店頭で支払い）
3. 入金は **サーバーだけ**が実行します。事業者APIに「本当に支払い済みか」を問い合わせ、Firestoreの `wallet` を原子的に加算（`functions/_lib/firestore.js`）。webhook・戻りURL・確認ボタンが重なっても二重入金しません
4. 画面に通知（アプリ内 + 端末通知）

必要な設定:

- Cloudflare Pages の環境変数に、上記のキーと `FIREBASE_API_KEY` / `FIREBASE_SERVICE_ACCOUNT` を登録（Secret推奨）
- 事業者ダッシュボードの Webhook の送信先（コンビニなど非同期の入金通知に必須）:
  - Stripe: `https://<ドメイン>/api/pay/webhook/stripe`（イベント: `checkout.session.completed` / `checkout.session.async_payment_succeeded` / `checkout.session.async_payment_failed`）
  - KOMOJU: `https://<ドメイン>/api/pay/webhook/komoju`（`payment.captured`）
  - PAY.JP: `https://<ドメイン>/api/pay/webhook/payjp`（`checkout.session.completed`）
  - PayPal / Square: webhook不要（決済ページから戻ったときに自動確認。チャージ履歴の更新ボタンでも確認できます）
- チャージ額は `functions/_lib/packs.js` で変更できます
- Firestoreルールは `docs/firestore.rules.example`（`payments` は本人だけ読み取り可）

> ⚠️ **実際の決済はまだ試験していません。** 各社のテストモード（Stripe/PayPal/Squareはsandbox、KOMOJUはテストキー）で、必ず一通り動作確認してから本番キーに切り替えてください。特に **PAY.JP は公式ドキュメントで認証方式を確認しきれていない**ため、動かない場合は `functions/_lib/providers/payjp.js` の認証ヘッダを調整してください。
> また、コインの販売は資金決済法（前払式支払手段）や特定商取引法の表示義務に該当する可能性があります。公開前に確認してください。

## 新しいデータ（Firestore）

| コレクション | 主なフィールド |
| --- | --- |
| `keep` | ownerUid, type(text/link/image), content, pinned, createdAt |
| `events` | ownerUid, title, date(YYYY-MM-DD), time, memo |
| `todos` | ownerUid, text, done |
| `wallet_tx` | type(transfer/bonus/topup), fromUid, toUid, participants[], amount, note |
| `payments` | uid, provider, providerId, packId, yen, coins, status(pending/paid/failed), url, createdAt（書き込みはサーバーのみ） |
| `chats`（オープンチャット） | 既存のグループ + isOpen:true, description, category, maxMembers |
| `chats/{id}/messages` | 追加type: `location`(lat,lng,label) / `poll`(options, multiple, votes) |
| `users/{uid}` | 追加: blockedUsers[], lastBonusDate |

## 注意点

- ウォレットの送金・ボーナス・ゲームはクライアント側で残高を書き換える作りです（元の仕組みのまま）。コインを有料で販売するなら、Firestoreルールで `wallet` のクライアント書き込みを禁止し、すべてサーバー処理にすることを強く推奨します（現状だと利用者がブラウザから残高を書き換えられます）。
- ブロックは「自分の画面で相手の発言を隠す」機能です。相手側の送信は止めません。
- ログインボーナスの額は `src/line/common.js` の `DAILY_BONUS` で変更できます。
- `.env` に TURN サーバーの認証情報が入っています。リポジトリを公開している場合は、認証情報の再発行と `.gitignore` への `.env` 追加を検討してください。また `REACT_APP_TURN_*` が2回定義されています。
