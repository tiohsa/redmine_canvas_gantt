# インストールと初期設定

管理者向けの導入・更新手順です。パスやサービス名は Redmine の配置に合わせてください。

## 動作要件

- Redmine 6.0、6.1、または 7.0
- 選択した Redmine がサポートする Ruby
- Redmine REST API を有効化
- デスクトップ版 Google Chrome または Microsoft Edge（その他のブラウザは未検証）
- SPA をソースからビルドするときのみ Node.js 20 以降

## 新規インストール

1. Redmine アプリケーションの `plugins/` ディレクトリでプラグインを取得します。

   ```sh
   cd /path/to/redmine/plugins
   git clone --branch v0.18.1 --depth 1 https://github.com/tiohsa/redmine_canvas_gantt.git
   ```

2. Redmine アプリケーションサーバーを再起動します。
3. 管理者として **管理 → 設定 → API** を開き、**REST による Web サービスを有効にする** をオンにします。表示名は Redmine の言語により異なる場合があります。
4. 対象プロジェクトの **設定 → モジュール** で **Canvas Gantt** を有効にします。
5. **管理 → ロールと権限** で利用ロールに `view_canvas_gantt` を付与します。
6. プロジェクトメニューの **Canvas Gantt** を開きます。

DB マイグレーションは不要です。チケット操作に必要な標準権限は[権限設計](/ja/administration/permissions)を確認してください。ベースライン保存を許可するロールには `manage_canvas_gantt_baseline` も付与します。

## アップグレード

1. Redmine データベースとプラグインディレクトリをバックアップします。
2. プラグインディレクトリを更新するリリースの内容に置き換えます。ソース変更などでビルドが必要な場合は、再起動前に下記の[ソースからビルドする](#build-from-source)を実行します。
3. Redmine を再起動し、プロジェクトのモジュールとロール権限を確認します。

アップグレード時に DB マイグレーションはありません。Redmine 設定領域に保存したベースラインと、利用者のブラウザーにある表示設定は通常の更新では保持されます。旧権限 `edit_canvas_gantt` は自動移行されません。既存ロールを確認し、必要な場合にだけ `manage_canvas_gantt_baseline` を付与します。

### ソースからビルドする（必要な場合のみ） {#build-from-source}

リリースに含まれるビルド済みの `assets/build/` をそのまま使う場合、この操作と Node.js / npm は不要です。SPA のソースを変更した場合や、ビルド済みアセットを含まないソースから導入する場合のみ、Node.js 20 以降で実行します。

```sh
cd /path/to/redmine/plugins/redmine_canvas_gantt/spa
npm ci
npm run build
```

## アンインストール

ベースラインやプラグイン設定が必要なら Redmine データベースをバックアップします。アンインストールタスクはプラグインディレクトリを削除する前に実行します。タスクは `plugin_redmine_canvas_gantt` の設定行を削除し、ベースラインを含むプラグイン設定を消去します。ブラウザーの `localStorage` は消去しません。

Redmine アプリケーションディレクトリ（`Gemfile` がある場所）から実行します。

```sh
bundle exec rake redmine_canvas_gantt:uninstall RAILS_ENV=production
```

Docker Compose の場合は Redmine サービス内で実行します。

```sh
docker compose exec -T redmine bundle exec rake redmine_canvas_gantt:uninstall
```

完了後にプラグインディレクトリ（または対応するコンテナ volume / bind mount）を削除し、Redmine を再起動します。Docker だけで Redmine を動かす構成では、ホスト側のプラグインディレクトリから `bundle exec` を実行しないでください。そこには Redmine の `Gemfile` がありません。

## 初回起動時に確認すること

- プロジェクトでモジュールが有効か
- 利用者が `view_canvas_gantt` を持つか
- REST API が有効か
- チケットの表示範囲や編集可否が Redmine の可視性・権限に合うか
- 画面が空なら開始日・期日とフィルター条件を確認する

詳しくは [権限](/ja/administration/permissions)、[設定](/ja/administration/settings)、[営業日カレンダー](/ja/administration/calendars)、[Docker Compose での配置](/ja/administration/deployment) を参照してください。
