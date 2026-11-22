# とあるAIの順位表（用途別AIランキング）

Arena（arena.ai）の公開リーダーボードデータをもとに、用途別のAIランキングを表示する静的サイトです。
GitHub Pages ＋ GitHub Actions（無料枠）だけで動き、APIキーやシークレットは使いません。

## 仕組み

```
GitHub Actions（毎日 7:00 / 12:00 / 19:00 JST ＋手動実行）
  └ scripts/fetch_rankings.py  … Hugging Face から最新データを取得 → 検証 → data/rankings.json
  └ ランキングに変化があればコミット
  └ index.html / assets / data を GitHub Pages にデプロイ
ブラウザ
  └ assets/app.js が data/rankings.json と data/comments.json を読んで描画
```

## データ取得方法

- データセット：Hugging Face `lmarena-ai/leaderboard-dataset`（CC BY 4.0）の各 config の `latest` split
- エンドポイント：Hugging Face datasets-server の **`/filter` API**（認証不要）

  ```
  https://datasets-server.huggingface.co/filter
    ?dataset=lmarena-ai/leaderboard-dataset
    &config=text_style_control
    &split=latest
    &where="category"='overall'
    &orderby="rating" DESC
    &length=30
  ```

  `/rows` API は全件ページングが必要で 429（レート制限）になりやすいため、`/filter` で `overall` だけを rating 順に取得しています。一時的な 429 / 500 / タイムアウトは自動で再試行します。

- 部門と config の対応（2026-11-22 に arena.ai の標準表示と照合して決定）

  | 部門 | key | config | 備考 |
  |---|---|---|---|
  | 普段使い | daily | `text_style_control` | arena.ai の Text は style control 版が標準表示 |
  | 業務使い | work | `document` | arena.ai の Document は通常版が標準表示 |
  | コーディング | code | `webdev` | |
  | 動画生成 | video | `text_to_video` | |

  arena.ai 側の標準表示が変わった場合は `scripts/fetch_rankings.py` の `CATEGORIES` を書き換えてください。

- 加工：`rating` 降順（同点は `rank` → `vote_count`）で上位8件。スコアは整数に丸め。
- 失敗時：取得や検証（4部門すべて3件以上・score が数値）に失敗したら `rankings.json` は上書きしません。ワークフローは前回データでデプロイしたうえで赤（失敗）になります。
- 変化がないとき：`rankings.json` はコミットしません。ただしデプロイ時はその回の取得時刻（`fetched_at`）で公開するため、サイトの「最終更新」はチェックした時刻になります。

## 手で編集するファイル

| ファイル | 内容 |
|---|---|
| `assets/config.js` | 運営アカウント名・XのURLなど |
| `data/name-map.json` | モデル名の表示を置き換え `{"元の名前": "表示名"}`（次回取得時から反映） |
| `data/comments.json` | ひとこと解説 `{"モデル名": "解説文"}`（表示名で書く。空なら「準備中」） |

編集して main ブランチにプッシュ（GitHub の画面で直接編集でもOK）すると、自動で再公開されます。

## 手動で更新する

- **GitHub上で**：リポジトリの「Actions」タブ →「Update rankings & deploy」→「Run workflow」
- **ローカルで**：

  ```
  python scripts/fetch_rankings.py
  python -m http.server 8000
  ```

  → http://localhost:8000/ で確認できます（`index.html` を直接開くとデータを読み込めません）。

## 初回設定（GitHub）

1. public リポジトリ `ai-ranking` を作ってプッシュ
2. Settings → Pages → Build and deployment → Source を **「GitHub Actions」** にする
3. Actions タブで「Update rankings & deploy」を「Run workflow」で手動実行し、緑になることを確認
4. ユーザー名やリポジトリ名を変えた場合は、`index.html` の OGP（`og:url` / `og:image` / `twitter:image`）のURLも書き換える

## 定期実行が止まったときの再開手順

GitHub は、public リポジトリで60日間動きがないと定期実行（schedule）を自動で無効化することがあります。

1. リポジトリの「Actions」タブを開く
2. 左の一覧から「Update rankings & deploy」を選ぶ
3. 上部に「This scheduled workflow is disabled…」と出ていれば **「Enable workflow」** を押す
4. 「Run workflow」で1回手動実行し、緑になることを確認

## ライセンス・出典

ランキングデータ：Arena（arena.ai）公開リーダーボードデータ（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)）。順位は暫定値を含みます。
