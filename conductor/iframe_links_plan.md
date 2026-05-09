# iframe内リンクの別タブ表示対応プラン

## Objective (目的)
iframeダイアログ内で表示されるRedmineチケットの詳細画面において、ユーザーが入力した説明やコメント（Wikiフォーマット部分）のリンクをクリックした際に、別タブ（`target="_blank"`）で開くように挙動を修正します。

## Key Files & Context (関連ファイル)
*   **`spa/src/utils/iframeStyles.ts`**: iframe内のDOM操作・スタイル調整用ユーティリティ。リンクを書き換える処理をここに追加します。
*   **`spa/src/components/IssueIframeDialog.tsx`**: iframeの読み込み完了イベントをフックし、DOM操作ユーティリティを呼び出しているメインコンポーネント。
*   **`spa/src/utils/iframeStyles.test.ts`**: 追加するロジックに対する単体テストファイル。

## Implementation Steps (実装手順)
1.  **リンク書き換え関数の追加 (`spa/src/utils/iframeStyles.ts`)**
    *   引数として`Document`を受け取る `updateIframeLinksTarget(doc: Document): void` 関数を追加します。
    *   `doc.querySelectorAll('.wiki a')` で対象のリンク要素を取得します。
    *   各リンクについて、`href`属性が `#` から始まるページ内アンカーリンク（目次やコメントへのジャンプ用）を除外します。
    *   対象リンクに `target="_blank"` と `rel="noopener noreferrer"` を設定します。
    *   ※同ファイルからの`export`を追加します。

2.  **イベント処理への組み込み (`spa/src/components/IssueIframeDialog.tsx`)**
    *   `handleIframeLoad` 関数内において、iframe内のドキュメントの読み込み（`const doc = ...`）が完了した直後のタイミング（`applyIssueDialogStyles`の呼び出し付近）で、作成した `updateIframeLinksTarget(doc)` を呼び出します。

3.  **テストの実装 (`spa/src/utils/iframeStyles.test.ts`)**
    *   `updateIframeLinksTarget` 関数のユニットテストを追加します。
    *   通常のリンクに `target="_blank"` と `rel="noopener noreferrer"` が付与されること。
    *   ページ内リンク (`<a href="#note-1">`) の属性が書き換わらないこと。
    *   `.wiki` クラス外のリンクが影響を受けないこと。

## Verification & Testing (検証方法)
*   **単体テスト**: `npm run test` (または `pnpm test`) を実行し、追加したテストが通過することを確認します。
*   **動作確認**: 開発環境を起動し、ガントチャート上のタスクからダイアログを開きます。説明文やコメントに含まれるURLや外部サイトへのリンクをクリックし、現在のダイアログが閉じられずに新しいタブでリンク先が表示されることを確認します。ページ内の目次等をクリックした場合はダイアログ内でスクロール・ジャンプが正常に動作することを確認します。