# AGENTS.md — SPA (React Frontend)

## Project overview

Redmine Canvas Gantt の SPA フロントエンド。Canvas ベースのインタラクティブなガントチャートを提供する。

- Language: TypeScript
- Framework: React 19, Vite 7
- State Management: Zustand 5
- Testing: Vitest (unit), Playwright (E2E)

## Dev environment setup

- 依存インストール: `npm ci`
- 開発サーバー: `npm run dev` (http://localhost:5173)
- Node.js バージョン: 20 以上

## Build commands

- ビルド: `npm run build` (`tsc -b && vite build` → `../assets/build/` に出力)
- 開発サーバー: `npm run dev`
- 型チェック: `tsc -b`
- プレビュー: `npm run preview`

## Testing instructions

### ユニットテスト (Vitest + jsdom)

- 全テスト実行: `npm run test -- --run`
- ウォッチモード: `npm run test`
- 単一ファイル: `npx vitest run src/components/GanttContainer.resize.test.tsx`
- テスト環境: jsdom (`vite.config.ts` の `test` セクション)
- セットアップ: `src/setupTests.ts`

### E2E テスト (Playwright)

- スタンドアロン: `npm run test:e2e` (Chromium, `tests/e2e/` ディレクトリ)
- ヘッド付き: `npm run test:e2e:headed`
- Redmine 統合: `npx playwright test -c playwright.redmine.config.ts`
- テストファイルパターン: `*.pw.ts`

## Code style

- Linter: `npm run lint`
- ESLint 9 flat config (`eslint.config.js`):
  - `@eslint/js` recommended
  - `typescript-eslint` recommended
  - `eslint-plugin-react-hooks`
  - `eslint-plugin-react-refresh`
- TypeScript strict モード:
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `noFallthroughCasesInSwitch: true`
  - `erasableSyntaxOnly: true`
- ターゲット: ES2022
- モジュール: ESNext (bundler resolution)
- JSX: react-jsx

## Architecture

```
src/
├── main.tsx              # エントリーポイント
├── App.tsx               # ルートコンポーネント (レイアウト・グローバルイベント)
├── App.css / index.css   # グローバルスタイル
├── constants.ts          # 定数定義
├── api/                  # Redmine API クライアント (REST API 通信)
├── components/           # React コンポーネント
│   ├── GanttContainer.tsx    # ガントチャート本体
│   ├── GanttToolbar.tsx      # ツールバー (フィルタ・ズーム・表示切替)
│   ├── TaskDetailPanel.tsx   # タスク詳細サイドパネル
│   └── ...
├── stores/               # Zustand ストア
│   ├── TaskStore.ts          # データ管理 (タスク・リレーション・バージョン)
│   └── UIStore.ts            # UI 状態管理 (サイドバー・カラム)
├── engines/              # レイアウト・インタラクションロジック (D&D等)
├── renderers/            # Canvas 描画ロジック
├── services/             # ビジネスロジックサービス
├── types/                # TypeScript 型定義 (Redmine エンティティ)
└── utils/                # 共有ユーティリティ
```

### 設計方針

- **状態管理**: Zustand でドメイン別にストアを分割 (`TaskStore` / `UIStore`)。Props のバケツリレーを避ける
- **API 通信**: `src/api/client.ts` に集約。`window.RedmineCanvasGantt` から設定を取得
- **描画**: Canvas ベースの高性能レンダリング。重い描画ロジックは `renderers/` に分離
- **テスト**: `@testing-library/react` でコンポーネントテスト、Playwright で E2E
