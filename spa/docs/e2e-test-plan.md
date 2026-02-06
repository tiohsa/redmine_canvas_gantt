# Playwright E2Eテスト計画

本ドキュメントは、Redmine Canvas Gantt SPAのPlaywrightによるE2Eテスト計画を定義します。

## 実行方法

```bash
# 全テスト実行
npm run test:e2e

# ヘッドレスモードで実行（ブラウザ表示あり）
npm run test:e2e:headed
```

---

## 1. ガントチャート表示

### 1.1 初期表示
| テスト名 | 説明 |
|---------|------|
| `renders gantt chart on load` | ページ読み込み時にガントチャートが表示される |
| `displays task bars correctly` | タスクバーが正しい位置・幅で表示される |
| `shows timeline header with dates` | タイムラインヘッダーに日付が表示される |

### 1.2 サイドバー
| テスト名 | 説明 |
|---------|------|
| `renders sidebar with task list` | サイドバーにタスク一覧が表示される |
| `resizing left pane does not shrink column width` | サイドバーリサイズ時にカラム幅が維持される |
| `sidebar columns can be reordered` | カラムの並び替えが機能する |

---

## 2. ナビゲーション・ズーム

### 2.1 ビューモード切り替え
| テスト名 | 説明 |
|---------|------|
| `switches to Month view` | 月ビューに切り替わる |
| `switches to Week view` | 週ビューに切り替わる |
| `switches to Day view` | 日ビューに切り替わる |
| `maintains center position on view change` | ビュー切り替え時に表示中央が維持される |

### 2.2 ズーム操作
| テスト名 | 説明 |
|---------|------|
| `zooms in with toolbar button` | ツールバーのズームインボタンが機能する |
| `zooms out with toolbar button` | ツールバーのズームアウトボタンが機能する |
| `zooms with mouse wheel` | マウスホイールでズームできる |

### 2.3 スクロール
| テスト名 | 説明 |
|---------|------|
| `scrolls horizontally` | 横スクロールが機能する |
| `scrolls vertically` | 縦スクロールが機能する |
| `navigates to Today` | 「今日」ボタンで今日の日付に移動する |

---

## 3. タスク操作

### 3.1 タスク選択
| テスト名 | 説明 |
|---------|------|
| `selects task on click` | タスクをクリックで選択できる |
| `opens task detail panel on selection` | タスク選択時に詳細パネルが開く |
| `deselects task on background click` | 背景クリックで選択解除される |

### 3.2 タスクのドラッグ&ドロップ
| テスト名 | 説明 |
|---------|------|
| `moves task by dragging` | タスクバーをドラッグして日程変更できる |
| `resizes task by dragging edge` | タスクバーの端をドラッグして期間変更できる |
| `shows ghost bar while dragging` | ドラッグ中にゴーストバーが表示される |
| `saves task after drop` | ドロップ後にAPIに保存される |

### 3.3 インライン編集
| テスト名 | 説明 |
|---------|------|
| `edits status inline` | ステータスをインライン編集できる |
| `edits assignee inline` | 担当者をインライン編集できる |
| `edits progress inline` | 進捗率をインライン編集できる |
| `saves on blur` | フォーカスアウト時に保存される |
| `cancels on Escape` | Escキーで編集キャンセルされる |

---

## 4. 依存関係

### 4.1 依存関係の表示
| テスト名 | 説明 |
|---------|------|
| `displays dependency arrows` | 依存関係の矢印が表示される |
| `highlights dependencies on task hover` | タスクホバー時に関連する依存関係がハイライトされる |

### 4.2 依存関係の作成・削除
| テスト名 | 説明 |
|---------|------|
| `creates dependency by dragging` | ドラッグで依存関係を作成できる |
| `deletes dependency via context menu` | コンテキストメニューから依存関係を削除できる |

---

## 5. フィルタリング

### 5.1 テキストフィルタ
| テスト名 | 説明 |
|---------|------|
| `filters tasks by text` | テキスト入力でタスクがフィルタリングされる |
| `shows parent tasks when child matches` | 子タスクがマッチした場合に親タスクも表示される |
| `clears filter on button click` | クリアボタンでフィルタが解除される |

### 5.2 ドロップダウンフィルタ
| テスト名 | 説明 |
|---------|------|
| `filters by project` | プロジェクトでフィルタリングできる |
| `filters by version` | バージョンでフィルタリングできる |
| `filters by status` | ステータスでフィルタリングできる |
| `filters by assignee` | 担当者でフィルタリングできる |

---

## 6. 表示オプション

### 6.1 プロジェクトグループ化
| テスト名 | 説明 |
|---------|------|
| `groups tasks by project` | プロジェクトごとにタスクがグループ化される |
| `collapses project group` | プロジェクトグループを折りたためる |
| `expands project group` | プロジェクトグループを展開できる |

### 6.2 バージョン・進捗線
| テスト名 | 説明 |
|---------|------|
| `shows version milestones` | バージョンマイルストーンが表示される |
| `shows progress line` | 進捗線が表示される |
| `toggles dependency lines` | 依存関係線の表示切り替えができる |

---

## 7. タスク詳細パネル

### 7.1 表示
| テスト名 | 説明 |
|---------|------|
| `displays task details` | タスク詳細が表示される |
| `shows custom fields` | カスタムフィールドが表示される |

### 7.2 編集
| テスト名 | 説明 |
|---------|------|
| `edits task subject` | タスク名を編集できる |
| `edits start date` | 開始日を編集できる |
| `edits due date` | 期日を編集できる |
| `saves changes` | 変更が保存される |

---

## 8. エラーハンドリング

| テスト名 | 説明 |
|---------|------|
| `shows error toast on API failure` | API失敗時にエラートーストが表示される |
| `handles conflict error` | コンフリクトエラーを適切に処理する |
| `retries failed request` | 失敗したリクエストをリトライできる |

---

## 9. アクセシビリティ

| テスト名 | 説明 |
|---------|------|
| `supports keyboard navigation` | キーボードナビゲーションが機能する |
| `has proper ARIA labels` | 適切なARIAラベルが設定されている |
| `focuses first task on Tab` | Tabキーで最初のタスクにフォーカスが移る |

---

## モックデータ構造

テストで使用するモックデータの基本構造:

```typescript
const mockData = {
  tasks: [
    {
      id: 101,
      subject: 'タスク名',
      project_id: 1,
      project_name: 'プロジェクト名',
      start_date: '2026-02-01',
      due_date: '2026-02-10',
      ratio_done: 40,
      status_id: 1,
      status_name: 'New',
      assigned_to_id: 10,
      assigned_to_name: 'ユーザー名',
      lock_version: 1,
      editable: true,
      display_order: 0,
      has_children: false,
    },
  ],
  relations: [
    { id: 1, issue_from_id: 101, issue_to_id: 102, relation_type: 'precedes' }
  ],
  versions: [
    { id: 1, name: 'v1.0', effective_date: '2026-02-28', status: 'open' }
  ],
  statuses: [
    { id: 1, name: 'New', is_closed: false },
    { id: 2, name: 'In Progress', is_closed: false },
    { id: 3, name: 'Closed', is_closed: true }
  ],
  project: { id: 1, name: 'Canvas Gantt' },
  permissions: { editable: true, viewable: true },
};
```

---

## テストファイル構成

```
tests/e2e/
├── gantt-display.pw.ts      # ガントチャート表示テスト
├── gantt-navigation.pw.ts   # ナビゲーション・ズームテスト
├── gantt-task-ops.pw.ts     # タスク操作テスト
├── gantt-dependency.pw.ts   # 依存関係テスト
├── gantt-filters.pw.ts      # フィルタリングテスト
├── gantt-sidebar.pw.ts      # サイドバーテスト（既存）
├── gantt-detail-panel.pw.ts # 詳細パネルテスト
└── gantt-a11y.pw.ts         # アクセシビリティテスト
```
