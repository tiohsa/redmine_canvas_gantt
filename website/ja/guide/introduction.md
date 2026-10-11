# はじめに

## Redmine Canvas Gantt とは

Redmine Canvas Gantt は、Redmine の Issue を HTML5 Canvas のガントチャートに描画するプラグインです。このページは 2026-10-11 に確認した安定版 v0.18.0 を対象にします。[v0.18.0 Release](https://github.com/tiohsa/redmine_canvas_gantt/releases/tag/v0.18.0)。左のサイドバーに Issue の列を表示し、右のタイムラインで期間や依存関係を確認します。スクロールやズームを含む操作とスケジュール編集を一つの画面で行えます。

![Redmine 7.0.0.stable 上の Canvas Gantt 0.18.0 の英語日表示。架空の Issue と依存関係を表示したガントチャート。](/images/canvas-gantt-overview-en.png)

2026-10-11 に Redmine 7.0.0.stable と Canvas Gantt 0.18.0 で撮影した英語 UI の実画面です。架空のデモ Issue を使っています。[画像を拡大](/images/canvas-gantt-overview-en.png)

## 主な機能

- タスクバーをドラッグして期間を移動・調整し、タスク端から依存関係を作成
- 担当者、ステータス、進捗率、期日、カスタムフィールドなどのインライン編集
- サイドバーで親子関係を変更し、複数の子 Issue をまとめて作成
- Redmine の保存済みクエリや対応する標準フィルタと連携
- プロジェクトまたは担当者によるグループ化、ベースライン比較、ワークロード表示
- 作業時間タイマー、PNG / CSV 出力、表示設定の保存

## 標準 Gantt との関係

Canvas Gantt は Canvas にタイムラインを描きますが、Issue と権限の管理は Redmine を利用します。独自の Issue テーブルや DB マイグレーションは追加しません。Canvas Gantt の利用には `view_canvas_gantt` が必要です。Issue の編集・追加・削除は対象 Issue のプロジェクトに対する Redmine 標準権限で制御されます。

## 対応環境

対応する Redmine 系列は 6.0、6.1、7.0 です。CI で記載される具体的な検証版は 6.0.6、6.1.2、7.0.0 ですが、これらの系列内のすべてのパッチ版を同じ意味で保証するものではありません。Ruby は選択した Redmine 版がサポートする版を使います。

通常運用に Node.js は不要です。ソースから SPA をビルドする場合やフロントエンド開発ツールを使う場合は Node.js 20 以降が必要です。Redmine REST API を有効にしてください。

ブラウザーは Canvas、ES modules、`localStorage` に対応する最新のデスクトップ版 Chrome、Edge、Firefox、Safari を対象にしています。Internet Explorer は非対応で、モバイルブラウザーと埋め込み WebView はテスト対象に含まれません。

## 画面構成

画面左側のサイドバーには Issue の行と選択した列が並び、右側のタイムラインには期間を表すタスクバーと依存関係が表示されます。ツールバーから表示範囲やズームなどを操作できます。具体的な操作は[基本操作](/ja/guide/basic-operations)を参照してください。

## 次に読む

- [インストールと初期設定](/ja/guide/installation)
- [基本操作](/ja/guide/basic-operations)
- [権限](/ja/administration/permissions)、[設定](/ja/administration/settings)、[業務カレンダー](/ja/administration/calendars)（管理者向けページ）
