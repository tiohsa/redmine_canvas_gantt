# Redmine Canvas Gantt マニュアル

Redmine Canvas Gantt の導入と日々の操作を説明します。このマニュアルは 2026-10-11 に確認した安定版 v0.18.0 を対象にし、リポジトリ内の実装と資料に基づいています。[v0.18.0 Release](https://github.com/tiohsa/redmine_canvas_gantt/releases/tag/v0.18.0)

## 目的から探す

- 初めて使う: [はじめに](/ja/guide/introduction)、[インストールと初期設定](/ja/guide/installation)
- チャートを操作する: [基本操作](/ja/guide/basic-operations)
- チケット間の関係を管理する: [親子関係](/ja/features/hierarchy)、[依存関係](/ja/features/dependencies)
- 表示を絞り込む・共有する: [フィルタとクエリ](/ja/features/filters)、[URL とクエリパラメータ](/ja/features/query-parameters)
- 進捗や工数を扱う: [ベースライン](/ja/features/baseline)、[ワークロード](/ja/features/workload)、[作業時間タイマー](/ja/features/work-timer)
- 表示と出力を調整する: [表示設定とエクスポート](/ja/features/display-export)

## Canvas Gantt について

Canvas Gantt は、Redmine の Issue を HTML Canvas のタイムラインに表示し、左側の一覧からも編集できるプラグインです。ドラッグによるスケジュール調整、依存関係、インライン編集、保存済みクエリとの連携などを提供します。データの閲覧と更新には Redmine の権限が適用されます。

![Redmine 7.0.0.stable 上の Canvas Gantt 0.18.0 の英語 UI。架空の Issue と依存関係を表示した日表示の画面。](/images/canvas-gantt-overview-en.png)

2026-10-11 に Redmine 7.0.0.stable と Canvas Gantt 0.18.0 で撮影した英語 UI の実画面です。架空のデモ Issue を使っています。[画像を拡大](/images/canvas-gantt-overview-en.png)

## 対応環境

対応する Redmine は 6.0、6.1、7.0 系列です。REST API を有効にしてください。対応ブラウザーは Canvas、ES modules、`localStorage` が使える最新のデスクトップ版 Chrome、Edge、Firefox、Safari です。Internet Explorer、モバイルブラウザー、埋め込み WebView はテスト対象外です。詳細は [はじめに](/ja/guide/introduction) と [インストール](/ja/guide/installation) を参照してください。

## 対象バージョン

このマニュアルは 2026-10-11 に確認した安定版 v0.18.0 を対象にしています。過去の UI を示す画像には歴史的キャプチャであることを明記しています。
