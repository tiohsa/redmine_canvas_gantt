# デプロイ環境

## Docker Compose

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

既存の本番デプロイでは、カレンダーディレクトリを含む Redmine プロセスから見たパスを指定してください。ホスト上だけにファイルを置いても、コンテナーへマウントされていなければ読み込まれません。

## Kubernetes

ConfigMap などで配布した設定ファイルを、Redmine コンテナー内の `REDMINE_CANVAS_GANTT_CALENDAR_DIR` が指すパスへマウントします。読み取り専用マウントを使用できます。

```yaml
env:
  - name: REDMINE_CANVAS_GANTT_CALENDAR_DIR
    value: /etc/redmine/business_calendars
volumeMounts:
  - name: business-calendars
    mountPath: /etc/redmine/business_calendars
    readOnly: true
```

Volume の定義・ConfigMap の `items`・Pod の詳細は、クラスタで使っているマニフェストに追加してください。上記は環境変数とマウントパスの断片で、単体で適用できる Deployment 全体ではありません。

各 Puma worker / Pod は独立したメモリ上のカレンダースナップショットを保持します。そのため、すべての Pod が同じカレンダーファイルを参照する必要があります。ConfigMap の変更は定期確認時に検知されますが、即時 Push はありません。確認間隔は `REDMINE_CANVAS_GANTT_CALENDAR_RELOAD_INTERVAL` で調整できます。

## 更新とロールバック

カレンダーファイルを更新するときは、[営業日カレンダーの書式と制約](/ja/administration/calendars)に沿って構文と参照先を検証してから配布してください。変更後、適用されたカレンダーを Gantt 画面で確認します。読み込み失敗時の動作は営業日カレンダーを参照してください。

プラグインのインストール・アップグレードと Redmine の再起動手順は[インストールガイド](/ja/guide/installation)を参照してください。プラグインをアンインストールしても、外部カレンダーディレクトリや ConfigMap は削除されません。

## 互換性と運用上の注意

- 対応 Redmine は 6.0、6.1、7.0 です。Ruby バージョンは利用する Redmine バージョンの要件に従います。
- Pod / worker 間で異なるカレンダー設定を配布しないでください。
- 表示設定は各ユーザーのブラウザープロファイルに保存され、サーバー再起動やコンテナー更新では共有されません。

読み込みに問題がある場合は[トラブルシューティング](/ja/troubleshooting/)を参照してください。
