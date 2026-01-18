# Redmine Canvas Gantt SPA

[English](README.md) | 日本語

Redmine Canvas Gantt プラグイン向けの SPA フロントエンドです。React、TypeScript、Vite で構成され、Redmine 内でインタラクティブなガントチャートを表示します。

## 主な特徴

- タスク・関連・バージョンにフォーカスしたガント表示
- Redmine API と連携したインライン編集とリスケジュール
- 大規模タイムライン向けの Canvas レンダリング
- Zustand による状態分離と整理

## 技術スタック

- React 19
- TypeScript 5
- Vite 7
- Zustand 5
- Vitest

## 必要環境

- Node.js（LTS 推奨）
- npm または pnpm

## クイックスタート

```bash
npm install
```

```bash
npm run dev
```

開発サーバーは `http://localhost:5173` で起動します（CORS 有効、`vite.config.ts` を参照）。

## スクリプト

```bash
npm run dev      # Vite 開発サーバー起動
npm run build    # ../assets/build にビルド（manifest 出力）
npm run test     # 単体テスト（Vitest）
npm run lint     # ESLint
```

## ビルド成果物

- 出力先: `../assets/build`
- マニフェスト: `../assets/build/.vite/manifest.json`

これらのアセットは Redmine プラグイン側で読み込まれます。

## Redmine への組み込み

1. このディレクトリで SPA をビルドします。
2. Redmine プラグインが成果物を配信します。
3. ホストページで `window.RedmineCanvasGantt` を注入します。

```ts
window.RedmineCanvasGantt = {
  projectId: 1,
  apiBase: '/projects/1/canvas_gantt',
  redmineBase: '',
  authToken: 'csrf-token',
  apiKey: 'api-key',
  settings: {
    row_height: '32',
    inline_edit_subject: '1',
    inline_edit_status: '1',
    inline_edit_start_date: '1'
  },
  i18n: {
    field_subject: 'Subject',
    field_assigned_to: 'Assignee'
  }
}
```

## ディレクトリ構成

- `src/api/` Redmine API クライアント
- `src/components/` UI コンポーネント
- `src/engines/` レイアウト／操作ロジック
- `src/renderers/` Canvas レンダラ
- `src/stores/` Zustand ストア
- `src/types/` 型定義

## テスト補足

jsdom 環境では `HTMLCanvasElement.getContext()` の警告が出ることがありますが、テストの失敗にはなりません。

## ライセンス

本 SPA は Redmine Canvas Gantt プラグインの一部です。ライセンスはルートプロジェクトを参照してください。
