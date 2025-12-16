### 1. ディレクトリ作成と移動

WSL2（Ubuntuなど）のターミナルで実行してください。

```bash
mkdir redmine-dev
cd redmine-dev
mkdir plugins
mkdir themes
```

### 2. `docker-compose.yml` の作成

以前の構成に加え、エラー回避のために `RAILS_ENV: development` などを最初から設定に含めた決定版です。

```yaml
services:
  redmine:
    image: redmine:latest
    container_name: redmine-dev
    ports:
      - "8080:3000"
    environment:
      # 開発モードに固定（これで各種エラーを回避しやすくなります）
      RAILS_ENV: development
      REDMINE_DB_MYSQL: db
      REDMINE_DB_PASSWORD: password
      # 念のため両方の形式でキーを設定
      REDMINE_SECRET_KEY_BASE: supersecretkey
      SECRET_KEY_BASE: supersecretkey
    volumes:
      - ./plugins:/usr/src/redmine/plugins
      - ./themes:/usr/src/redmine/public/themes
    depends_on:
      - db

  db:
    image: mariadb:10
    container_name: redmine-db
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: redmine
      MYSQL_USER: redmine
      MYSQL_PASSWORD: password
    volumes:
      - db-data:/var/lib/mysql

volumes:
  db-data:
```

### 3. コンテナの起動

古いコンテナが残っている可能性があるので、一度綺麗にしてから起動します。

```bash
# 念のため古いものを削除
docker compose down

# 新しい設定で起動
docker compose up -d
```

起動後、少し待ってからブラウザで `http://localhost:8080` にアクセスし、Redmineが表示されることを確認してください。

### 4. プラグイン雛形の生成

先ほどのエラー（`secret_key_base` がない問題）は、手順2の設定で解決済みです。以下のコマンドで作成できます。

```bash
# 書式: docker compose exec redmine bundle exec rails generate redmine_plugin <プラグイン名>
docker compose exec redmine bundle exec rails generate redmine_plugin my_gantt_plugin
```

### 5. `init.rb` の編集（任意）

ローカルの `plugins/my_gantt_plugin/init.rb` を開き、プラグイン情報を編集します。

```ruby
Redmine::Plugin.register :my_gantt_plugin do
  name 'My Gantt Plugin plugin'
  author 'Your Name'
  description 'This is a plugin for Redmine'
  version '0.0.1'
end
```

### 6. 設定適用のための再起動

プラグインを認識させるために再起動します。

```bash
docker compose restart redmine
```


### 7. テストデータの投入

```bash
docker compose exec -e REDMINE_LANG=ja redmine bundle exec rake redmine:load_default_data

docker compose exec redmine  bundle exec rake redmine:generate_issues
```
