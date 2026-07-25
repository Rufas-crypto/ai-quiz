# 今日のAIクイズ

前日のAIニュースから作った4択クイズを、毎日1問だけ出題する静的サイト。読者層別に4レベル（学生 / 一般企業 / IT企業 / IT技術者）を用意している。

## 構成

フレームワーク・ビルド工程なし。素のHTML/CSS/JSのみ。クイズは日付ごとのJSONとして `data/` に置き、フロントエンドが実行時に読む。

```
index.html        今日の一問（?date= と ?level= で指定も可能）
archive.html      過去の問題一覧
about.html        サイト説明
privacy.html      プライバシーポリシー
assets/           style.css / app.js
data/
  index.json      公開済みの日付一覧（新しい順）
  YYYY-MM-DD.json その日の4層分の問題
scripts/
  daily-quiz.md   毎日の生成手順（スケジュールタスクがこれを実行する）
social/           X投稿用の文面
```

日付判定はJST固定。当日分が未公開なら直近の公開分にフォールバックするため、生成が飛んだ日もページは壊れない。

## ローカルで動かす

```bash
npx serve ai-quiz
```

`file://` では `fetch` が失敗するため、必ずHTTP経由で開く。

## 毎日の更新

`scripts/daily-quiz.md` の手順に沿って、Claude のスケジュールタスクが前日23時に実行する。生成 → `data/` にJSON追加 → commit / push → Vercel が自動デプロイ。

スケジュールタスクは**アプリが起動している間しか動かない**。実行時刻にPCが落ちていた場合は次回起動時に走る。確実に毎日動かしたくなったら GitHub Actions へ移す。

## 毎日の自動処理

2つのスケジュールタスクが連続して走る。

| 時刻 | タスク | 役割 | 手順書 |
|---|---|---|---|
| 23:03 | `daily-ai-quiz` | 翌日分のクイズを生成し push | `scripts/daily-quiz.md` |
| 23:49 | `daily-ai-quiz-review` | 生成物の検品・サイト点検・報告書 | `scripts/daily-review.md` |

点検タスクは**変更できる範囲を意図的に狭めてある**。正解の書き換え・UI変更・セキュリティ設定の緩和は禁止で、見つけても `reports/` に書いて人間の判断を待つ。レビューなしに本番へ反映される構成では、自律タスクに壊す権限を与えないことが安全側に立つ唯一の方法。

報告書は `reports/公開日.md`。**セキュリティ所見を含むため `.vercelignore` で公開対象外にしている。**

## セキュリティ

- 描画は `textContent` / `createElement` のみ。`innerHTML` は使わない
- `?date=` / `?level=` は `data/index.json` と `SEGMENTS` のホワイトリストと照合してから使う
- **`source.url` は `safeHttpUrl()` でスキームを検証してから `href` に入れる。** クイズJSONは検索結果をもとに機械生成され、レビューなしで本番に出るため、URLは信頼できない入力として扱う。http(s) 以外は文字列表示にフォールバックする
- `vercel.json` でCSPなどのヘッダを付与している

### 広告を入れるときはCSPを緩める必要がある

現在のCSPは `script-src 'self'` なので、**このままではAdSenseのタグが読み込まれない**。広告を入れる段階で、配信元を許可するようCSPを更新すること。ここを忘れると「タグを貼ったのに広告が出ない」で詰まる。

## 広告

`index.html` / `archive.html` の `.ad-slot` が広告枠。空のときは `display: none` になるので、審査通過後にタグを差し込むだけでよい。

## 未対応

- `privacy.html` の連絡先メールアドレスが未記入
