# プラグイン設定

## Redmine のプラグイン設定画面

Canvas Gantt には、Redmine の「管理 → プラグイン → Canvas Gantt → 設定」に表示される一般設定画面はありません。README に以前記載されていたインライン編集項目や行高の設定表は現在の実装に対応していないため、設定手順として使用しないでください。表示設定、列、行高、保存方式、依存関係の初期動作は、Canvas Gantt 画面内またはブラウザーの表示設定で管理します。

## ブラウザーに保存される表示設定

表示設定は Redmine のユーザー設定ではなく、そのブラウザープロファイルの `localStorage` に保存されます。プロジェクト単位または同じブラウザープロファイル内の全プロジェクト共通を選べます。「全プロジェクト共通」は全ユーザーへの共有を意味しません。同じプロファイルを使う別ユーザーにも設定が見える場合があります。

![Canvas Gantt の表示設定を示す英語 UI。](/images/display-settings-en.png)

チャートの表示設定を示す英語 UI 画面です。[画像を拡大](/images/display-settings-en.png)

保存対象には、ズーム、表示範囲、進捗線、タスク名、階層線、日付のみのタスク点、バージョン見出し、Baseline 表示、列の表示と順序、列幅、サイドバー幅、行高、文字サイズ、依存関係に基づく並べ替えなどがあります。ブラウザーのサイトデータを削除すると、これらの設定も失われます。

## 保存方式と依存関係の初期設定

- ツールバーの自動保存を有効にすると、編集をすぐ Redmine に保存します。無効にすると変更は保留され、保存操作が必要です。どちらも同じ競合解決フローを使います。
- 依存関係メニューの既定種別、自動 delay 計算、既定関係の自動適用、スケジュール移動モードは、ブラウザーの表示設定に保存されます。
- 表示列や列幅もブラウザーに保存されます。保存済み Redmine クエリや URL が列を指定している場合、そのクエリ状態が表示に反映されることがあります。

## サーバー環境変数

カレンダーとデータ応答量の調整は、Redmine サーバー側の環境変数で行います。

| 環境変数 | 用途 |
| --- | --- |
| `REDMINE_CANVAS_GANTT_CALENDAR_DIR` | 営業日カレンダーの設定ディレクトリ。既定値は `<Rails.root>/config/redmine_canvas_gantt/business_calendars` |
| `REDMINE_CANVAS_GANTT_CALENDAR_RELOAD_INTERVAL` | カレンダーファイル変更の確認間隔（秒）。既定値は `60`、指定値は 0 以上 |
| `REDMINE_CANVAS_GANTT_MAX_DATA_ISSUES` | 1 回のデータ応答に含める Issue 数の上限を下げる |
| `REDMINE_CANVAS_GANTT_MAX_DATA_RELATIONS` | 1 回のデータ応答に含める関連数の上限を下げる |
| `REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS` | 補助コレクションの上限を下げる |
| `REDMINE_CANVAS_GANTT_MAX_DATA_BYTES` | JSON 応答サイズ上限（バイト）を下げる |

データ応答の組み込み上限は Issue 10,000 件、関連 50,000 件、補助コレクション各 10,000 件、JSON 25 MiB です。環境変数で上限を引き上げることはできません。上限を超える全体応答は切り詰めず HTTP 413 になります。

::: warning 開発用設定
`CANVAS_GANTT_USE_VITE_DEV_SERVER=1` はフロントエンド開発用です。通常の本番環境で有効にしないでください。
:::

## Baseline の保存場所

Baseline は Redmine の `Setting.plugin_redmine_canvas_gantt` に保存されます。プロジェクトごとに 1 件で、新しい Baseline を保存すると以前のものを置き換えます。カレンダーファイルやブラウザー表示設定はここには保存されません。Baseline の閲覧と保存に必要なロールは[権限設計](/ja/administration/permissions)を参照してください。

カレンダーの YAML / CSV 書式は[営業日カレンダー](/ja/administration/calendars)、コンテナーへの設定は[デプロイ環境](/ja/administration/deployment)を参照してください。
