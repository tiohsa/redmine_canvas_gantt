<!--
タイトル: Redmineのガントチャートが重い？Canvas描画で爆速にするプラグインを作った
タグ: Redmine, ガントチャート, プロジェクト管理, React, Canvas
-->

# Redmineのガントチャートが重い？Canvas描画で爆速にするプラグインを作った

## はじめに

Redmineを使っていて、こんな経験はありませんか？

- チケットが100件を超えると**ガントチャートの表示が遅い**
- スクロールがカクつく
- ドラッグ&ドロップでスケジュール変更したいのに**できない**
- 依存関係の設定が面倒

そんな悩みを解決するために、**Canvas描画で高速動作するガントチャートプラグイン** を開発しました。

https://github.com/tiohsa/redmine_canvas_gantt

![Canvas Gantt Demo](https://raw.githubusercontent.com/tiohsa/redmine_canvas_gantt/main/docs/demo.gif)

## 標準ガントチャートの課題

Redmineの標準ガントチャートには以下の課題があります：

| 課題 | 詳細 |
|-----|-----|
| **パフォーマンス** | DOM要素を大量生成するため、チケット数が増えると重くなる |
| **操作性** | 閲覧専用で、ドラッグ操作ができない |
| **依存関係** | ガントチャート上で依存関係を作成・編集できない |
| **編集** | 各チケットページに遷移しないと編集できない |

## Canvas Ganttの特徴

### 🚀 Canvas描画で高速

HTML5 Canvasを使用してタイムライン部分を描画しています。DOMノードを大量に生成しないため、**1000件以上のチケットでもサクサク動作**します。

```
従来方式: チケット数 × 日数 のDOM要素を生成
Canvas方式: 1つのCanvas要素に描画
```

### 🎯 ドラッグ&ドロップでスケジュール変更

タスクバーを**ドラッグするだけで日程変更**が可能です。

- **移動**: バーをドラッグして開始日・終了日を同時に変更
- **リサイズ**: バーの端をドラッグして期間を変更
- **即時反映**: ドロップ時にAPIで自動保存

![ドラッグ操作デモ](https://raw.githubusercontent.com/tiohsa/redmine_canvas_gantt/main/docs/demo2.gif)

### 🔗 依存関係の視覚化と編集

タスク間の依存関係（先行・後続）を矢印で視覚化します。

- タスクの**端点からドラッグ**して新しい依存関係を作成
- 既存の依存関係は矢印で表示
- 循環依存のチェックも実装

### ✏️ サイドバーでインライン編集

チケットページに遷移せずに、サイドバーから直接編集できます。

**編集可能な項目:**
- 件名
- ステータス
- 担当者
- 優先度
- 開始日・期日
- 進捗率
- トラッカー
- カテゴリ
- 対象バージョン
- プロジェクト

### 📊 豊富なフィルタリング

ツールバーから様々な条件でフィルタリングできます：

- プロジェクト
- バージョン
- ステータス
- 担当者
- テキスト検索

### 🎨 表示カスタマイズ

- **ズーム**: 月/週/日の3段階 + 細かいズーム調整
- **行高**: 設定画面で調整可能
- **表示列**: サイドバーの列を自由に選択・並び替え
- **プロジェクトグループ化**: 複数プロジェクトを階層表示

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| **フロントエンド** | React 19 + TypeScript |
| **状態管理** | Zustand |
| **描画** | HTML5 Canvas |
| **ビルド** | Vite |
| **テスト** | Vitest + Playwright |
| **バックエンド** | Redmine Plugin (Ruby) |

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                        React SPA                            │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │
│  │  Toolbar   │  │  Sidebar   │  │    Canvas Timeline     │ │
│  │ (filters)  │  │ (editable) │  │  ┌──────────────────┐  │ │
│  └────────────┘  └────────────┘  │  │ TaskRenderer     │  │ │
│                                  │  │ OverlayRenderer  │  │ │
│                                  │  │ BackgroundRender │  │ │
│                                  │  └──────────────────┘  │ │
│                                  └────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    Zustand Stores                           │
│           (TaskStore, UIStore, EditMetaStore)               │
├─────────────────────────────────────────────────────────────┤
│                      API Client                             │
│              (fetch → Redmine REST API)                     │
└─────────────────────────────────────────────────────────────┘
```

## インストール方法

### 1. プラグインをクローン

```bash
cd /path/to/redmine/plugins
git clone https://github.com/tiohsa/redmine_canvas_gantt.git
```

### 2. Redmineを再起動

```bash
# Pumaの場合
bundle exec pumactl restart

# Passengerの場合
touch tmp/restart.txt
```

### 3. REST APIを有効化

1. 管理者としてログイン
2. **管理** → **設定** → **API**
3. **RESTによるWebサービスを有効にする** にチェック

### 4. モジュールと権限を設定

1. プロジェクト **設定** → **モジュール** で **Canvas Gantt** を有効化
2. **管理** → **ロールと権限** で以下を設定:
   - `View canvas gantt`: ガントチャートの表示
   - `Edit canvas gantt`: ガントチャートからの編集

## Docker Composeで試す

すぐに試したい方のために、Docker Compose設定も用意しています。

```bash
cd plugins/redmine_canvas_gantt
docker compose up -d
```

`http://localhost:3000` でRedmineにアクセスできます。

初期データを投入する場合：

```bash
docker compose exec -e REDMINE_LANG=ja redmine bundle exec rake redmine:load_default_data
```

## 動作環境

- **Redmine**: 6.x
- **Ruby**: 3.x
- **Node.js**: 18+ (開発時のみ)

## 設定オプション

**管理 → プラグイン → Canvas Gantt → 設定** から以下をカスタマイズできます：

| 設定項目 | 説明 |
|---------|------|
| 行の高さ | デフォルトの行高（ピクセル） |
| インライン編集項目 | サイドバーで編集できる項目を選択 |
| Vite dev server | 開発時にホットリロードを有効化 |

## 今後の予定

- [ ] クリティカルパスの表示
- [ ] エクスポート機能（PDF/PNG）
- [ ] カスタムフィールドのサポート強化
- [ ] キーボードショートカット

## おわりに

Redmineの標準ガントチャートに不満を感じている方は、ぜひ試してみてください。

GitHubリポジトリ: https://github.com/tiohsa/redmine_canvas_gantt

Redmine Plugins Directory: https://www.redmine.org/plugins/redmine_canvas_gantt

Issue報告やPull Requestも歓迎です！

## 参考リンク

- [Redmine公式サイト](https://www.redmine.org/)
- [HTML5 Canvas API - MDN](https://developer.mozilla.org/ja/docs/Web/API/Canvas_API)
- [Zustand - GitHub](https://github.com/pmndrs/zustand)
- [Vite](https://vitejs.dev/)
