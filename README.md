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

## デプロイ（Cloudflare Workers / Pages どちらでも可）

`https://xxx.workers.dev` の形で公開している場合は **Workers** です。Workers では Pages 用の `functions/` は動かないため、`worker/index.js` + `wrangler.jsonc` で `/api/*` を処理します（ハンドラ本体は `functions/` と共通）。

- ダッシュボード > 該当Worker > 設定 > ビルド で
  - ビルドコマンド: `npm run build`
  - デプロイコマンド: `npx wrangler deploy`
- `wrangler.jsonc` の `name` は **Worker名と同じ**にしてください（今は `chat-app`）。違うと別Workerが作られます。
- 環境変数・シークレットは「設定 > 変数とシークレット」に登録します（`.dev.vars.example` 参照。「ビルド」の変数とは別物です）。
- Pages でデプロイする場合は従来どおり（出力 `build`、`functions/` が自動で使われます）。
- デプロイ後、アプリの **設定 > 開発者ツール > 接続診断** で、`/api` が動いているか・キーが設定済みかを確認できます。

## 決済連携（コインチャージ: コンビニで支払い票を提示して支払う）

サービス > コインチャージ（ウォレット > チャージ）から、**支払い票を発行 → コンビニで提示して支払い → コイン加算**の流れで購入できます。カードは扱いません。

| # | サービス | 支払い方法 | 必要な環境変数 |
| --- | --- | --- | --- |
| 1 | Stripe | コンビニ（ファミリーマート・ローソン・ミニストップ・セイコーマート） | `STRIPE_SECRET_KEY` |
| 2 | KOMOJU | コンビニ（セブン-イレブン含む主要チェーン）・Pay-easy | `KOMOJU_SECRET_KEY` |
| 3 | UnivaPay | コンビニ（セブン・ファミマ・ローソン・ミニストップ・セイコーマート・デイリー）・Pay-easy。**アプリ内で氏名・メール・電話・店舗を入力して支払い票を直接発行** | `UNIVAPAY_SECRET`, `UNIVAPAY_APP_TOKEN` |

UnivaPay の Webhook: ダッシュボードで `https://<ドメイン>/api/pay/webhook/univapay` を登録（`charge_updated` / `charge_finished`）。実装は公式ドキュメントで確認できた範囲です。**必ずテストモードで支払い票の発行→入金まで確認してください。**

> カード専用の PayPal / Square / PAY.JP のコードは `functions/_lib/providers/_optional/` に退避してあります（使う場合は `providers/index.js` に追加）。

### 利用者の流れ
1. 金額を選び、事業者を選ぶ → 事業者の決済ページで氏名・メールを入力
2. **支払い票**（お支払い番号・確認番号・支払い期限）が発行される。アプリ内の「チャージ履歴 > 支払い票」でいつでも再表示できます
3. コンビニの店頭で番号を提示して現金などで支払い
4. 事業者が入金を通知 → サーバーがコインを加算 → アプリに通知（支払い期限は発行から3日）

### 仕組み（安全のためサーバー側で入金）
- `POST /api/pay/checkout`（Firebase IDトークンで本人確認）→ 決済ページURLを返し、`payments` に「支払い待ち」を記録
- 入金は **サーバーだけ**が実行。事業者APIに「本当に支払い済みか」を問い合わせ、Firestoreの `wallet` を原子的に加算します（`functions/_lib/firestore.js`）。webhook・戻りURL・確認ボタンが重なっても二重入金しません
- Webhook は「確認のきっかけ」としてだけ使います（偽の通知が来ても、事業者APIで確認できなければ入金しません）

### 本番（実際のお金）にする手順
1. **事業者の本番アカウントを用意**（Stripe / KOMOJU）。事業者名・代表者・口座などの審査があります。コンビニ払いは審査で別途有効化が必要な場合があります
2. 本番キー（`sk_live_...` など）を Cloudflare の「変数とシークレット」に登録（テストキーと差し替え）
3. **Webhook を登録**（コンビニは店頭で払うため必須）:
   - Stripe: `https://<ドメイン>/api/pay/webhook/stripe` — イベント `checkout.session.completed` / `checkout.session.async_payment_succeeded` / `checkout.session.async_payment_failed`
   - KOMOJU: `https://<ドメイン>/api/pay/webhook/komoju` — イベント `payment.captured`
4. `FIREBASE_SERVICE_ACCOUNT` と `FIREBASE_API_KEY` を登録（入金に必須）
5. **先にテストモードで一通り確認**。Stripe のコンビニ払いテストは、決済フォームでメール `{任意}succeed_immediately@example.com` と確認番号 `22222222220`（すぐ成功）などが使えます
6. 少額（例: 300円）で本番の支払いを1回やって、コイン加算・通知まで確認

### 公開前に必ず確認してください（法令・運用）
- **特定商取引法に基づく表記**（販売事業者名・住所・連絡先・返金条件）のページが必要です
- コイン（前払式支払手段）の販売は **資金決済法** の対象になる可能性があります（未使用残高が一定額を超えると届出、有効期限や払戻しのルールなど）。事業として行う前に専門家へ確認してください
- コンビニ払いは払戻しが難しいため、返金方針を決めておいてください
- ⚠️ **残高の改ざん対策**: ウォレットの送金・ボーナス・ゲームは元々ブラウザ側で残高を書き換える作りで、利用者がブラウザから `wallet` を書き換えられます。有料コインとして売るなら、この部分をサーバー処理に置き換えるか、Firestoreルールで `wallet` のクライアント書き込みを禁止する改修が必要です（今回のチャージはサーバー側ですが、既存機能はそのままです）

## 開発者ツール

設定 > **開発者ツール** から使えます。
- **接続診断**: `/api` の稼働、決済API、ニュースAPI、ログイン、通知許可、Service Worker、サーバー側キーの設定有無（値は表示しません）をチェック
- **アプリ内コンソール**: スマホでも使える Console / Network / Elements / Storage（[eruda](https://github.com/liriliri/eruda)）をON/OFF。PCなら F12 でもブラウザ標準の開発者ツールが使えます

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
