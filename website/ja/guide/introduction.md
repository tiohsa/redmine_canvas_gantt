# はじめに

## Redmine Canvas Gantt とは

Redmine Canvas Gantt は、Redmine のチケットをガントチャートで確認・編集できるプラグインです。日程の調整、依存関係の管理、工数の確認を一つの画面で行えます。

![Redmine 7.0.0.stable 上の Canvas Gantt 0.18.0 で、日本語表示のチケットと依存関係を表示した日表示のガントチャート。](/images/canvas-gantt-overview-ja.png)

[画像を拡大](/images/canvas-gantt-overview-ja.png)

## 主な機能

- タスクバーをドラッグして期間を移動・調整し、タスク端から依存関係を作成
- 担当者、ステータス、進捗率、期日、カスタムフィールドなどのインライン編集
- サイドバーで親子関係を変更し、複数の子チケットをまとめて作成
- Redmine の保存済みクエリや対応する標準フィルタと連携
- プロジェクトまたは担当者によるグループ化、ベースライン比較、ワークロード表示
- 作業時間タイマー、PNG / CSV 出力、表示設定の保存

## 標準 Gantt との関係

Canvas Gantt は Redmine のチケットと権限を利用します。利用には `view_canvas_gantt` が必要で、チケットの編集・追加・削除には対象プロジェクトの Redmine 標準権限が適用されます。詳しくは[権限設計](/ja/administration/permissions)を参照してください。

<a id="対応環境"></a>

## 動作確認環境

対応する Redmine 系列は 6.0、6.1、7.0 です。CI で記載される具体的な検証版は 6.0.6、6.1.2、7.0.0 ですが、これらの系列内のすべてのパッチ版を同じ意味で保証するものではありません。Ruby は選択した Redmine 版がサポートする版を使います。

通常運用に Node.js は不要です。ソースから SPA をビルドする場合やフロントエンド開発ツールを使う場合は Node.js 20 以降が必要です。Redmine REST API を有効にしてください。

デスクトップ版 Google Chrome および Microsoft Edge で動作確認しています。その他のブラウザは未検証です。

## 画面構成

画面左側のサイドバーにはチケットの行と選択した列が並び、右側のタイムラインには期間を表すタスクバーと依存関係が表示されます。ツールバーから表示範囲やズームなどを操作できます。具体的な操作は[基本操作](/ja/guide/basic-operations)を参照してください。

## 次に読む

- [インストールと初期設定](/ja/guide/installation)
- [基本操作](/ja/guide/basic-operations)
- [権限](/ja/administration/permissions)、[設定](/ja/administration/settings)、[営業日カレンダー](/ja/administration/calendars)（管理者向けページ）
