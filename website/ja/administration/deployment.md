# デプロイ環境

## Docker Compose

### リポジトリのクイックスタート

リポジトリの `docker-compose.yml` は Redmine 7.0.0 と MariaDB 11.4 を起動し、このチェックアウトをプラグインとしてマウントします。使い捨てのローカル評価環境向けです。Redmine はポート `3000` で公開され、既知のサンプル DB パスワードと secret key を使います。ネットワークへ公開したり、本番データに使ったりしないでください。Docker Engine と Docker Compose v2 を用意し、ポート `3000` が空いていることを確認してください。

この Compose 設定では `RAILS_ENV=production` を維持してください。Redmine 公式イメージには開発環境に必要な `listen` gem が含まれません。

プラグインリポジトリのルートで以下を実行します。

### Redmine を起動する

```sh
docker compose up -d --wait
```

既定イメージは Redmine 7.0.0 です。CI で検証している互換イメージを試すには、起動時に `REDMINE_IMAGE` を指定します。

```sh
REDMINE_IMAGE=redmine:6.1.2 docker compose up -d --wait
```

Redmine 6.0 互換イメージには `redmine:6.0.6` を指定します。サービスが healthy になったらブラウザーで `http://localhost:3000` を開きます。

### Redmine の初期データを初期化する

Redmine 標準の初期データタスクを実行し、その後に Redmine 標準の test fixture を読み込みます。

::: warning fixture の読み込みは新規の使い捨て DB でのみ実行してください
test fixture の読み込みは、対象モデルのレコードを置き換える場合があります。本番 DB や、残す必要があるデータを含む DB では実行しないでください。
:::

```sh
docker compose exec -T -e REDMINE_LANG=en redmine bundle exec rake redmine:load_default_data
docker compose exec -T redmine bundle exec rake db:fixtures:load
```

### Canvas Gantt を有効にする

Redmine の **管理 → 設定 → API** で REST API を有効にします。次にプロジェクトの **設定 → モジュール** で **Canvas Gantt** を有効にします。利用させるロールに `view_canvas_gantt` を付与してください。チケット操作は Redmine 標準のプロジェクト権限で制御し、ベースライン保存を許可するロールだけに `manage_canvas_gantt_baseline` を付与します。詳しくは[インストールと初期設定](/ja/guide/installation)と[権限](/ja/administration/permissions)を参照してください。

### ローカルスタックを停止する

```sh
docker compose down
```

コンテナーとネットワークを削除しますが、名前付き `db-data` volume は保持するため、次回起動時も DB は残ります。このクイックスタートには本番向けのセキュリティ、TLS、バックアップ、secret 管理は含まれていません。

### 営業日カレンダーをマウントする

カレンダーディレクトリをコンテナー内の固定パスにマウントし、`REDMINE_CANVAS_GANTT_CALENDAR_DIR` に同じパスを指定します。

```yaml
services:
  redmine:
    environment:
      REDMINE_CANVAS_GANTT_CALENDAR_DIR: /etc/redmine/business_calendars
    volumes:
      - ./business_calendars:/etc/redmine/business_calendars
```

ホスト側の `./business_calendars` に、YAML 設定一式または `holiday.csv` を配置します。公式 Redmine Docker イメージは起動時に設定ディレクトリの所有者を変更するため、このディレクトリのマウントに `:ro` を付けないでください。起動後、プラグインはファイルを読み取り専用で扱います。

1. Redmine サービスの環境変数とマウントを設定します。
2. カレンダーファイルを配置し、所有者とコンテナーからの読み取り可否を確認します。
3. サービスを起動または再作成します。
4. Gantt 画面を開き、休日・稼働日の表示と日程計算を確認します。

既存の本番デプロイでは、カレンダーディレクトリを含む Redmine プロセスから見たパスを指定してください。ホスト上だけにファイルを置いても、コンテナーへマウントされていなければ読み込まれません。リポジトリのクイックスタートにあるサンプル資格情報や secret を本番環境へ持ち込まないでください。

Kubernetes では、例えば単一の ConfigMap から同じカレンダーファイルを各 Redmine Pod の設定パスへ read-only でマウントし、`REDMINE_CANVAS_GANTT_CALENDAR_DIR` を設定します。Puma worker と Pod はそれぞれ独立したメモリスナップショットを持つため、すべての worker から同じファイルが見える必要があります。ConfigMap の変更は次回の定期再読み込みで検知し、リアルタイム Push は行いません。プラグインを削除しても ConfigMap や外部カレンダーディレクトリは削除されません。

## 更新とロールバック

カレンダーファイルを更新するときは、[営業日カレンダーの書式と制約](/ja/administration/calendars)に沿って構文と参照先を検証してから配布してください。変更後、適用されたカレンダーを Gantt 画面で確認します。読み込み失敗時の動作は営業日カレンダーを参照してください。

プラグインのインストール・アップグレードと Redmine の再起動手順は[インストールガイド](/ja/guide/installation)を参照してください。プラグインをアンインストールしても、外部カレンダーディレクトリは削除されません。

## 互換性と運用上の注意

- 対応 Redmine は 6.0、6.1、7.0 です。Ruby バージョンは利用する Redmine バージョンの要件に従います。
- worker 間で異なるカレンダー設定を配布しないでください。
- 表示設定は各ユーザーのブラウザープロファイルに保存され、サーバー再起動やコンテナー更新では共有されません。

読み込みに問題がある場合は[トラブルシューティング](/ja/troubleshooting/)を参照してください。
