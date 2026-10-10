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

`src/news.js` は App 全体の古いコピーで、どこからも使われていなかったため `_backup/news.old.js` に退避しました。

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

- Cloudflare Pages にデプロイすると `/api/news` が有効になります（ビルドコマンド `npm run build`、出力 `build`）。
- ローカルで試す場合は `npm run build` のあと `npx wrangler pages dev build` を使ってください。`npm start` だけでは `/api/news` がないため、ニュース画面にエラーが表示されます。

## 新しいデータ（Firestore）

| コレクション | 主なフィールド |
| --- | --- |
| `keep` | ownerUid, type(text/link/image), content, pinned, createdAt |
| `events` | ownerUid, title, date(YYYY-MM-DD), time, memo |
| `todos` | ownerUid, text, done |
| `wallet_tx` | type(transfer/bonus), fromUid, toUid, participants[], amount, note |
| `chats`（オープンチャット） | 既存のグループ + isOpen:true, description, category, maxMembers |
| `chats/{id}/messages` | 追加type: `location`(lat,lng,label) / `poll`(options, multiple, votes) |
| `users/{uid}` | 追加: blockedUsers[], lastBonusDate |

## 注意点

- ウォレットはクライアント側で残高を書き換える作りです（元の仕組みのまま）。実際のお金を扱う場合は Cloud Functions など、サーバー側での検証が必要です。
- ブロックは「自分の画面で相手の発言を隠す」機能です。相手側の送信は止めません。
- ログインボーナスの額は `src/line/common.js` の `DAILY_BONUS` で変更できます。
- `.env` に TURN サーバーの認証情報が入っています。リポジトリを公開している場合は、認証情報の再発行と `.gitignore` への `.env` 追加を検討してください。また `REACT_APP_TURN_*` が2回定義されています。
