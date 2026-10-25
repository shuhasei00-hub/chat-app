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

## 通知（アプリを閉じていても届く）

標準の **Web Push（VAPID）** を Cloudflare Worker 上に実装しています（Firebase Cloud Messaging の追加設定は不要）。

| 通知 | 内容 | 仕組み |
| --- | --- | --- |
| 新着メッセージ | 相手の端末に通知（ミュート中・本文非表示の設定をサーバー側でも尊重） | 送信後に `/api/push/notify` → 受信者の全端末へ暗号化Push |
| **着信（音声/ビデオ/グループ）** | 「○○さんからビデオ通話」。**応答/拒否するまで消えず、端末が繰り返し振動**（Android） | 高優先度Push（TTL 45秒）+ 振動パターン + `requireInteraction` |
| 不在着信 | 応答前に発信者が切ると、着信通知が「不在着信」に置き換わる | 同じ tag で置換 |
| リマインダー | 指定時刻に通知（カレンダーの予定にも設定可） | Workerの Cron（毎分） |
| 外部連携 | Webhookで投稿されたメッセージも通知 | 上と同じ |
| 起動時 / ニュース | 未読件数・最新ニュース（従来どおり） | 従来機能 |

アプリを開いている間は、通知の代わりに**アプリ内の着信画面 + 着信音 + 振動**で知らせます（二重に出ません）。
アイコンの**未読バッジ**（対応ブラウザ）、通知タップで**該当トークを直接開く**にも対応しました。

### 有効にする手順（初回のみ）

1. `npm run vapid` で鍵を生成
2. Cloudflare > Worker > 設定 > 変数とシークレット に `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`（シークレット）/ `VAPID_SUBJECT`（`mailto:自分のメール`）を登録
   （`FIREBASE_API_KEY` と `FIREBASE_SERVICE_ACCOUNT` は決済機能用に登録済みならそのまま使います）
3. 再デプロイ → `/api/diag` で `push.enabled: true` を確認
4. アプリの 設定 > 通知 > **「テスト通知を送る」** で、アプリを閉じた状態で届くか確認

### 利用者が通知をオンにする方法

アプリの **設定 > 通知 > 「通知の状態」** に、✓/✕と「次にやること」が表示されます。

1. （iPhoneのみ）Safariで開き、共有ボタン →「ホーム画面に追加」→ **追加したアイコンから開く**
2. 画面上部の「通知をオンにしますか？」で「オンにする」→ ブラウザの許可ダイアログで「許可」
   （出ない場合は 設定 > 通知 > ブラウザ通知 をタップ）
3. 設定 > 通知 > 「テスト通知を送る」。アプリを閉じて届けばOK
4. 以前「ブロック」した場合は、ブラウザ/端末の設定でこのサイトの通知を「許可」に戻す
   （Chrome: アドレスバー左の鍵アイコン → 通知 / Android: 設定 > アプリ > Chrome > 通知 / iPhone: 設定 > 通知 > ホーム画面に追加したアプリ）

音は端末の通知音で鳴ります。端末がマナーモード/おやすみモード/集中モードの間、またはサイトの通知が「サイレント」の間は鳴りません。

### 未読数（アイコンのバッジ・「未読が○件」）の数え方

「最新のメッセージを自分が送った / すでに既読にした」トークは0件として数え、ミュート中・非表示のトークは含めません。
通知が許可されていない端末ではアイコンにバッジを出しません。

### 端末ごとの注意（Webの仕様上の限界）

- **Android（Chrome）**: 振動パターン・応答待ちの通知が使えます。サイレント/マナーモード中は端末設定に従います。
- **iPhone**: iOS 16.4 以降で、**Safariで「ホーム画面に追加」したアプリ**でのみ通知が使えます。通知の振動パターンはiOSでは指定できず、端末の通知設定に従います。
- **電話アプリのようなフルスクリーン着信（ロック画面で鳴り続ける）はWebでは作れません。** それが必要な場合は Capacitor 等でネイティブ化し、CallKit / ConnectionService を使う必要があります。
- 発信者がブラウザを閉じる/圏外になると「不在着信」は送られません（着信通知は45秒で自動失効）。
- 機内モード・電源オフの端末には、届いた時点で（着信は失効、メッセージは最大3日以内に）配信されます。

## LINE風の追加機能（今回）

| 機能 | 場所 | 概要 |
| --- | --- | --- |
| リンクプレビュー | トークのURL | タイトル・説明・画像のカードを表示（`/api/ogp`。内部ネットワークへの接続は拒否） |
| メッセージ翻訳 | メッセージ長押し > 翻訳 | 14言語（MyMemory） |
| 翻訳 / 為替 / Wikipedia | サービス > 外部サイト連携 | 外部サイトのAPIを `/api/tools/*` 経由で利用 |
| **外部連携 (Webhook)** | サービス > 外部連携 | URLを発行すると、IFTTT・Zapier・Make・GitHub Actions・自作スクリプト等からトークへ投稿できる。`{"text":"..","title":".."}`（Slack形式 `text` / Discord形式 `content` も可）。1秒に1回まで |
| 共有ターゲット | OS の共有メニュー | 他のサイト/アプリの「共有」からこのアプリを選び、トークやKeepへ送る（Androidでインストール済みの場合） |
| リマインダー | サービス > リマインダー | 日時を指定してプッシュ通知（Worker構成のみ。Pagesでは Cron 非対応） |
| カレンダー連携 | カレンダー > 予定 | 予定に通知を設定 / Googleカレンダーに追加 / .ics 書き出し |
| 通知の細かい設定 | 設定 > 通知 | 着信・本文表示・振動/着信音・リマインダーの個別ON/OFF、テスト通知 |

## 既存コードに対する変更（`src/App.js`）

- **不具合修正**: `sendMessage` が書く `lastMessage` に `createdAt` が無く、既存のアプリ内通知（効果音・裏タブ通知）の条件が成立していませんでした。`createdAt`（サーバー時刻）と `type` を追加し、一覧の表示文言も「📷 写真」などに改善。
- 送信後 / 発信後 / 発信取消時に `pushNotify`（失敗してもアプリの動作に影響なし）
- 着信・発信画面で着信音と振動、応答/拒否で通知を消去
- メッセージに リンクプレビュー と「翻訳」メニューを追加、Webhook投稿（ボット）の表示に対応
- ミュート設定・ログイン状態をサーバーに同期、ログアウトでこの端末の通知登録を解除
- 新画面のルーティング追加（`reminders` / `integrations` / `tools-*`）

## テスト

```bash
npm run test:server   # Node 22+。ネットワーク不要（Firestore等はモック）
```

RFC 8291 付録Aの公式テストベクタ、独立実装での往復復号、VAPID署名、メッセージ/着信/不在着信/Webhook/リマインダー/OGP(SSRF対策)/ツールAPIを検証します。

## セキュリティ上の注意

- プッシュ購読・Webhookのトークン・リマインダーは `artifacts/{appId}/server/data/` に保存します。**Firestoreルールでこのパスをクライアントに許可しないでください**（`docs/firestore.rules.example` 参照）。
- Webhook のURLは秘密です。漏れたら「外部連携」画面で削除して再発行してください。
- Push の宛先は既知のプッシュサービス（FCM/Mozilla/Apple/Windows）に限定しています。

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

| 4 | fincode byGMO | コンビニ（セブン・ローソン・ファミマ・ミニストップ・セイコーマート）。**決済ページ型**（`fincode`）と**アプリ内バーコード型**（`fincode_direct`）の2つを同時に使えます | `FINCODE_SECRET_KEY`, `FINCODE_ENV`, `FINCODE_WEBHOOK_SIGNATURE`(任意) |

### fincode の設定（公式OpenAPI 1.4.0 に基づく）
- **決済ページ型**: `POST /v1/sessions` で決済URLを発行 → fincode の支払い画面でバーコードを表示。決済後、fincode は `success_url`/`cancel_url` へ **POST** でリダイレクトするため、`/api/pay/return` が受けてアプリへ 303 で戻します。
- **アプリ内バーコード型**: `POST /v1/payments`（登録）→ `PUT /v1/payments/{id}`（実行、端末情報つき）でバーコード画像(Base64)を取得し、支払い票の画面に表示します。⚠️ 自画面でのバーコード表示は、**fincode／コンビニ事業者の追加審査とレギュレーション遵守が必要**です（本番前に fincode へ確認してください）。テスト環境では審査なしで試せます。
- 入金判定は `GET /v1/payments/{id}?pay_type=Konbini` の `status = CAPTURED`（金額も照合）。Webhook は確認のきっかけだけに使います。
- 管理画面 > API・Webhook で Webhook を登録: URL `https://<ドメイン>/api/pay/webhook/fincode`、イベント `payments.konbini.*`（テスト環境は `payments.konbini.complete.stub`）。「署名」を決めたら `FINCODE_WEBHOOK_SIGNATURE` に同じ値を登録。
- テスト入金: テスト環境の管理画面 > 決済 > コンビニ決済 から、疑似的に入金完了にできます（公式解説記事の記載）。
- 本番へ: 本番審査通過後、本番のシークレットキーに差し替え、`FINCODE_ENV=live` にし、本番側にも Webhook を登録します。
- 端末情報（バーコード表示用）は iPhone=CSSピクセル、それ以外=物理ピクセルで送ります。PC などでの表示は公式に規定がないため、実機で確認してください。

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
- ✅ **決済の記録はサーバー専用の場所へ移しました**（`artifacts/{appId}/server/data/payments`）。以前は `public/data/payments` にあり、利用者が偽の支払い記録を作って無料でコインを得られる穴がありました。**Firestoreルールを `docs/firestore.rules.example` の内容に差し替えてください**（これをしないと、読み取り用のルールが無く履歴が表示されません）。
- ⚠️ **既知の制限（コイン残高）**: ウォレットの送金・ボーナス・ゲーム・スタンプ/エフェクト購入は、元々ブラウザ側で `users/{uid}.wallet` を書き換える作りです。入金処理（チャージ）はサーバーだけが実行し改ざんできませんが、**ブラウザの開発者ツールから自分の残高を増やすことはできます**（購入コインと無料コインの区別がありません）。完全に防ぐには、`wallet` の増減（約14か所）をすべてサーバー処理に移す必要があります。あわせて次も確認してください: 管理者パスワードが `src/App.js` に直書き（`admin123`）されており、管理者のコイン付与もブラウザから実行されます。ゲーム（パチンコ風など）の結果もブラウザで決まるため、購入したコインを賭けに使う設計は避けるか、サーバー処理に移してください。

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
| `payments`（`server/data/payments`） | uid, provider, providerId, packId, yen, coins, status(pending/paid/failed), url, voucher, createdAt（書き込みはサーバーのみ・読み取りは本人のみ） |
| `chats`（オープンチャット） | 既存のグループ + isOpen:true, description, category, maxMembers |
| `chats/{id}/messages` | 追加type: `location`(lat,lng,label) / `poll`(options, multiple, votes) |
| `users/{uid}` | 追加: blockedUsers[], lastBonusDate |

## 注意点

- ウォレットの送金・ボーナス・ゲームはクライアント側で残高を書き換える作りです（元の仕組みのまま）。コインを有料で販売するなら、Firestoreルールで `wallet` のクライアント書き込みを禁止し、すべてサーバー処理にすることを強く推奨します（現状だと利用者がブラウザから残高を書き換えられます）。
- ブロックは「自分の画面で相手の発言を隠す」機能です。相手側の送信は止めません。
- ログインボーナスの額は `src/line/common.js` の `DAILY_BONUS` で変更できます。
- `.env` に TURN サーバーの認証情報が入っています。リポジトリを公開している場合は、認証情報の再発行と `.gitignore` への `.env` 追加を検討してください。また `REACT_APP_TURN_*` が2回定義されています。

## 着信音のカスタマイズと便利ボックス（v2.1）

### 着信音（設定 → 着信音・振動 / サービス → 着信音）
- 内蔵の着信音 6 種（標準・ベル・メロディ・デジタル・やさしい・目覚まし）と、発信音 3 種から選べます。
- **自分の音声ファイルを着信音にできます。** mp3 / m4a / wav / ogg など。ファイルが長くても、波形を見ながら「開始〜終了」を選び、**最大 7 分**の部分を切り出して保存します（フェード付き）。元ファイルは 100MB まで。
- 切り出した音は モノラル・4ビット ADPCM（容量 1/4）にして**端末内（IndexedDB）に保存**します。長いほど低音質にして容量をおさえます（〜1分: 32kHz / 〜3分: 22kHz / 7分: 16kHz → 7分で約3.4MB）。最大 12 個。以前の版で保存した WAV もそのまま使えます。
- 音量 / 繰り返し間隔 / 振動パターン（5種）/ 自動停止（15秒〜止めない）/ おやすみ時間（時間帯は音を鳴らさない・振動も止められる）。
- **友だち別の着信音**: 相手ごとに違う音を設定できます。
- 注意: アプリを閉じている間の着信は、端末の通知音になります（Webの仕様。カスタム音は鳴りません）。

### 便利ボックス（サービス → 便利ボックス）
アイコンを選んで使う道具箱です。すべて端末内で動作し、データは端末の localStorage に保存されます。
- 毎日の記録: ToDo / 習慣トラッカー（連続日数）/ 家計簿（月別集計・カテゴリ別・CSVコピー）/ カウントダウン / 定型文（タップでコピー）
- 時間: 目覚まし（曜日指定・スヌーズ・設定した着信音で鳴る）/ タイマー・ストップウォッチ / ポモドーロ / 世界時計 / 日付計算
- 計算・変換: 電卓（履歴つき）/ 単位変換（長さ・重さ・面積・体積・速度・データ・温度。坪・畳・尺貫法も）/ 割り勘 / 文字数カウント / パスワード作成
- 遊ぶ・決める: ルーレット / チーム分け / サイコロ・コイン

※ 目覚まし・タイマーはアプリを開いている間だけ鳴ります（`AlarmWatcher` を App.js に常駐）。

### v2.3 の追加

**着信音がアカウントに保存されます（ログアウトしても消えません）**
- 着信音（切り出した音声）と設定は、端末内に加えて **アカウントにも自動バックアップ**されます（`src/line/ringSync.js`）。ログアウト→ログイン、別の端末、ブラウザのデータ消去のあとでも、同じアカウントで入れば自動で戻ります。
- 保存先: `artifacts/{appId}/public/data/users/{uid}/ringtones/*`（音声は約450KBごとに `chunks` へ分割）と `.../prefs/ring`。**既存の Firestore ルール（`public/data/**` はログイン済みなら読み書き可）のままで動きます**。
- 削除した着信音は他の端末にも反映されます。クラウドに置くのは 6MB 以下の音（7分の着信音で約3.4MB）。
- 着信音・振動の画面の上部に保存状態が出ます（「今すぐ同期」ボタンつき）。
- ブラウザに勝手に消されにくくする `navigator.storage.persist()` も要求します。

**画面共有で、再生中の動画の音も相手に届きます**（1:1通話・グループ通話・ライブ配信の3か所）
- 共有の選択画面で「音声も共有」（Chromeは「タブ」を選ぶと出ます）にチェックを入れると、動画の音と自分のマイクをまぜて送ります（`src/line/screenAudio.js`）。
- マイクをミュートしても動画の音は流れ続けます。共有を止めるとマイクだけに戻ります。
- 音声のチェックを入れ忘れた場合は、画面上部にお知らせが出ます。
- 注意: スマホのブラウザは画面共有そのものに未対応のことがあります。ChromeOS・Windows・Macの Chrome / Edge が確実です。

**便利ボックスにさらに13個**（`src/line/ToolboxMore2.js`）
税・割引計算 / 和暦・年齢・干支・星座 / 文字変換（ひらがな⇄カタカナ・全角半角・重複行削除ほか）/ 色（HEX・RGB・HSL・読みやすさ判定）/ 画像リサイズ・圧縮 / 水分記録 / 体重記録（グラフ）/ 環境音（ノイズ・波・スリープタイマー）/ メトロノーム（タップテンポ）/ チェックリスト（旅行・買い物・引っ越しのひな形つき）/ 暗記カード / 音声メモ（録音）/ お絵描き / あみだくじ

### 追加・変更したファイル
- 追加: `src/line/ringSync.js`, `src/line/RingSync.js`, `src/line/screenAudio.js`, `src/line/ToolboxMore2.js`, `src/line/ringtones.js`, `src/line/RingtoneView.js`, `src/line/ToolboxView.js`, `src/line/ToolboxMore.js`, `src/line/AlarmWatcher.js`
- 変更: `src/line/ring.js`（全面書き換え）, `src/line/SettingsView.js`, `src/line/ServicesView.js`, `src/App.js`（import 3行・ルート2行・`<AlarmWatcher />` 1行・`useRing("incoming", callData?.callerId)`）
