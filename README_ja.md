<div align="center">

# Redmine Canvas Gantt

Redmine 6.0、6.1、7.0 向けの高速な Canvas ベースのガントチャートプラグインです。この README とユーザーマニュアルはプラグイン v0.18.0 の内容です。

[日本語マニュアル](https://tiohsa.github.io/redmine_canvas_gantt/ja/) · [English user manual](https://tiohsa.github.io/redmine_canvas_gantt/en/) · [開発者向けガイド](spa/README_ja.md)

詳しい機能、導入、管理手順はマニュアルのナビゲーションから確認できます。

[![License](https://img.shields.io/github/license/tiohsa/redmine_canvas_gantt)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/tiohsa/redmine_canvas_gantt/ci.yml?branch=main\&label=CI)](https://github.com/tiohsa/redmine_canvas_gantt/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/tiohsa/redmine_canvas_gantt)](https://github.com/tiohsa/redmine_canvas_gantt/releases)
[![Redmine](https://img.shields.io/badge/Redmine-6.0%20%7C%206.1%20%7C%207.0-red)](#必要環境)
[![Ruby](https://img.shields.io/badge/Ruby-Redmine公式要件に準拠-cc342d)](#必要環境)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933)](#必要環境)

[Redmine プラグインディレクトリ](https://www.redmine.org/plugins/redmine_canvas_gantt) · [リリース](https://github.com/tiohsa/redmine_canvas_gantt/releases) · [Issue](https://github.com/tiohsa/redmine_canvas_gantt/issues) · [English README](README.md)

</div>

## このプラグインを選ぶ理由

Canvas Gantt は、Redmine のチケット、権限、保存済みクエリを利用しながら、滑らかなタイムライン表示と日程編集を提供します。

## 主なメリット

- **高速:** Canvas 描画により、スクロールやズームを滑らかに操作できます。
- **対話的:** チャート上で日程、依存関係、親子関係、チケット項目を編集できます。
- **影響を抑えた導入:** DB マイグレーションは不要です。アンインストールタスクでプラグイン設定と保存済みベースラインを削除できます。
- **互換性:** Redmine 6.0、6.1、7.0 系列を対象にしています。

## 概要

チケット一覧とタイムラインを並べて、プロジェクトの日程を確認・編集できます。

## 主な特徴

- 日程とチケット項目を編集し、未保存変更を管理できます。
- 親子関係と依存関係を管理し、フィルターや保存済みクエリで表示を絞り込んで共有できます。
- ベースラインで日程を比較し、ワークロードを確認したり、作業時間タイマーで作業を計測したりできます。
- チャートの表示を調整し、PNG または CSV に出力できます。

## デモ

![Canvas Gantt のデモ: 日程編集と依存関係の作成](./docs/demo-current.gif)

[日程編集](./website/public/videos/schedule-edit.mp4)と[依存関係の作成](./website/public/videos/dependency-create.mp4)の動画もあります。

## 必要環境

- Redmine 6.0、6.1、7.0 と、その Redmine 版がサポートする Ruby
- Redmine REST API と、デスクトップ版 Google Chrome または Microsoft Edge
- Node.js 20 以降は SPA をソースからビルドする場合のみ必要です。同梱済みアセットで通常運用する場合は不要です。

<a id="対応ブラウザ"></a>

### 動作確認環境

デスクトップ版 Google Chrome および Microsoft Edge で動作確認しています。その他のブラウザーは未検証です。

### セキュリティと影響

DB マイグレーションは不要です。チャートの表示には `view_canvas_gantt`、ベースライン保存には `manage_canvas_gantt_baseline` が必要です。チケット操作には、対象チケットのプロジェクトにおける Redmine 標準権限が適用されます。プラグイン削除前にアンインストールタスクを実行してください。このタスクは保存済みベースラインを含むプラグイン設定行全体を削除します。

## インストール

v0.18.0 を Redmine の `plugins/` に clone して Redmine を再起動します。

```sh
cd /path/to/redmine/plugins
git clone --branch v0.18.0 --depth 1 https://github.com/tiohsa/redmine_canvas_gantt.git
```

REST API とプロジェクトの Canvas Gantt モジュールを有効にし、利用ロールに `view_canvas_gantt` を付与します。

### アップグレード

Redmine をバックアップしてプラグインファイルを更新し、再起動後にロール権限を確認します。通常の更新で DB マイグレーションは不要です。

### アンインストール

プラグインが存在する間に Redmine アプリケーションディレクトリから `bundle exec rake redmine_canvas_gantt:uninstall RAILS_ENV=production` を実行し、その後プラグインディレクトリを削除して Redmine を再起動します。`plugin_redmine_canvas_gantt` 設定行全体が削除され、ベースラインとプラグイン既定値も消去されます。ブラウザーの `localStorage` は削除されません。Docker では Redmine サービス内でタスクを実行してください。

## 使い方

Redmine REST API とプロジェクトの **設定 → モジュール** にある **Canvas Gantt** を有効化し、`view_canvas_gantt` を付与してプロジェクトメニューからチャートを開きます。チケットの編集・作成・削除・関連付けには対象プロジェクトの Redmine 標準権限が必要です。ベースライン保存を許可するロールにだけ `manage_canvas_gantt_baseline` を付与してください。

### 作業タイマー

チケットの作業時間を計測し、Redmine 標準の作業時間入力フォームで記録できます。

### ベースライン snapshot

プロジェクトごとに 1 件の日程 snapshot を保存し、現在のチャートと比較できます。新しい snapshot を保存すると前のものが置き換わります。

### ワークロード、表示設定、出力

予定・実績のワークロードを確認し、ブラウザープロファイルに表示設定を保存して、現在のビューを出力できます。

## 共有ビュー、フィルタ、クエリパラメータ

対応する URL パラメータと Redmine 保存済みクエリで、業務上のフィルタや表示状態を共有できます。

## 設定

Canvas Gantt にプラグイン設定画面はありません。ベースラインは Redmine のプラグイン設定に、表示設定は各ブラウザープロファイルに保存されます。

### データ payload の安全上限

data endpoint は、上限を超えた完全な payload を途中で切り詰めず拒否します。管理者は組み込み上限を環境変数で引き下げられます。

### 業務カレンダー

名前付き業務カレンダーでは、週次非稼働日、祝日、会社休日、振替稼働日を設定できます。カレンダーディレクトリでは YAML 設定一式または全プロジェクト共通の単一 `holiday.csv` を使用し、CSV と YAML は同じ場所に共存できません。

#### YAMLで詳細なカレンダーを設定する

YAML では名前付きカレンダー、プロジェクト割当、継承、稼働日上書きを設定できます。

#### CSVで全プロジェクト共通の休日一覧を設定する

全プロジェクト共通の休日一覧には、カレンダーディレクトリ直下に `holiday.csv` を 1 つ配置します。同じディレクトリに YAML カレンダーファイルを置かないでください。

#### YAML形式で休日ファイルを生成する

リポジトリには国別休日カレンダーの生成ツールがあります。

#### 再読込

実行時にカレンダーファイルを確認し、不正な再読込では直前の正常な snapshot を維持します。

### 互換性メモ

Redmica UI Extension の Select2 の挙動がチャート操作に干渉する場合は、同拡張の設定で検索可能なセレクトボックスを無効にしてください。

## Docker クイックスタート

このリポジトリには、ローカルでの評価用に使い捨ての Docker Compose 環境があります。サンプル資格情報を使用するため、ネットワークへ公開したり、本番データに使ったりしないでください。

### スタックを起動

リポジトリのルートで `docker compose up -d --wait` を実行します。

### 初期データを投入

初期データの投入方法は上記マニュアルのナビゲーションから確認してください。テスト fixture は新規の使い捨て DB だけで読み込んでください。既存レコードを上書きする場合があります。

### プロジェクトで Canvas Gantt を有効化

プロジェクトのモジュールを有効にし、`view_canvas_gantt` と、必要なチケット操作に応じた Redmine 標準権限を付与します。

### スタックを停止

リポジトリのルートで `docker compose down` を実行します。

## 開発

SPA は `spa/` にあります。フロントエンドの準備と開発コマンドは[spa/README_ja.md](spa/README_ja.md)を参照してください。
