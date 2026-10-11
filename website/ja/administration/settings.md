# プラグイン設定

## Redmine のプラグイン設定画面

Canvas Gantt に一般設定画面はありません。表示、列、行高、保存方式などは Gantt 画面で設定します。設定項目の説明は[表示とエクスポート](/ja/features/display-export)を参照してください。

## ブラウザーに保存される表示設定

表示設定はブラウザーの `localStorage` に保存され、Redmine のユーザー設定には保存されません。保存範囲などの詳細は[表示とエクスポート](/ja/features/display-export)を参照してください。

## 保存方式と依存関係の初期設定

ツールバーの自動保存を有効にすると、編集をすぐ Redmine に送信します。無効の場合、変更は保留され、**保存**を選ぶまで反映されません。保存手順は[保存と未保存の変更を破棄する](/ja/guide/basic-operations#保存と未保存の変更を破棄する)を参照してください。

依存関係設定メニューでは既定種別、自動 delay 計算、既定関係の自動適用、スケジュール移動モードを設定できます。自動保存と依存関係の設定はブラウザーの `localStorage` に保存されます。既定値と delay の動作は[依存関係の既定値と delay](/ja/features/dependencies#既定値と-delay)を参照してください。

## サーバー環境変数

営業日カレンダーとデータ応答量は、Redmine サーバー側の環境変数で調整します。

| 環境変数 | 用途 |
| --- | --- |
| `REDMINE_CANVAS_GANTT_CALENDAR_DIR` | 営業日カレンダーの設定ディレクトリ。既定値は `<Rails.root>/config/redmine_canvas_gantt/business_calendars` |
| `REDMINE_CANVAS_GANTT_CALENDAR_RELOAD_INTERVAL` | カレンダーファイル変更の確認間隔（秒）。既定値は `60`、指定値は 0 以上 |
| `REDMINE_CANVAS_GANTT_MAX_DATA_ISSUES` | 1 回のデータ応答に含めるチケット数の上限を下げる |
| `REDMINE_CANVAS_GANTT_MAX_DATA_RELATIONS` | 1 回のデータ応答に含める関連数の上限を下げる |
| `REDMINE_CANVAS_GANTT_MAX_DATA_COLLECTION_ITEMS` | 補助コレクションの上限を下げる |
| `REDMINE_CANVAS_GANTT_MAX_DATA_BYTES` | JSON 応答サイズ上限（バイト）を下げる |

データ応答の組み込み上限はチケット 10,000 件、関連 50,000 件、補助コレクション各 10,000 件、JSON 25 MiB です。環境変数で上限を引き上げることはできません。上限を超える全体応答は切り詰めず HTTP 413 になります。

::: warning 開発用設定
`CANVAS_GANTT_USE_VITE_DEV_SERVER=1` はフロントエンド開発用です。通常の本番環境で有効にしないでください。
:::

<a id="baseline-の保存場所"></a>

## ベースラインの保存場所

ベースラインは Redmine の `Setting.plugin_redmine_canvas_gantt` に保存されます。プロジェクトごとに 1 件で、新しいベースラインを保存すると以前のものを置き換えます。閲覧と保存に必要なロールは[権限設計](/ja/administration/permissions)を参照してください。

営業日カレンダーの YAML / CSV 書式は[営業日カレンダー](/ja/administration/calendars)、コンテナーへの設定は[デプロイ環境](/ja/administration/deployment)を参照してください。
