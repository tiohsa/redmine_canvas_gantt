# 子チケット一括作成の現行仕様

対象: 開発 HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`（コード 0.20.0、2026-11-13）。公開マニュアル v0.19.0 とは対象が異なる。

## 入力と操作

- 子チケット入力はテキストと表の２モードを持ち、テキストは１行１題名、表は題名とトラッカーを扱う。表には最低３行を用意する。
- モード変更時に行の題名を維持し、テキスト編集時は対応する既存行のトラッカーを可能な範囲で維持する。新規行は既定トラッカーを使う。
- 送信前に題名を trim し、空行を除外する。題名がなければリクエストを送らず成功・失敗とも０を返す。
- 既存親からの単独実行に加え、Redmine の親チケットフォームを保存した後にも実行できる。後者は保存後の遷移先から親 ID が確認でき、フォームにエラーがない場合に子を作る。親の保存失敗時に子を送信しない。
- 親保存と子の一括作成は別リクエストである。子の作成が失敗しても親の保存は取り消されない。
- issue 詳細で題名がなければ主ボタンは編集画面へ移動する。題名があれば編集画面に移動して親フォームを自動送信し、その保存成功後に子を送る。ダイアログを開き直すと送信中状態はリセットされる。

## API と認可

`POST /canvas_gantt/subtasks/bulk.json` およびプロジェクト配下の同等ルートを提供する。グローバルルートでは表示コンテキストのルートプロジェクトを指定する。

| 入力 | 意味 |
| --- | --- |
| `parent_issue_id` | 親チケット ID |
| `subjects` | 題名配列。トラッカー個別指定がない形式 |
| `subtasks` | `{subject, tracker_id?}` の配列。指定時はこちらを使用 |
| `operation_issue_ids` | 操作範囲の ID。SPA は親 ID を指定する |
| `client_operation_id` | 任意の操作識別子 |

- 親は `Issue.visible` から取得し、現在のプロジェクト範囲と、指定された操作範囲に入る必要がある。
- 親プロジェクトに `add_issues` と `manage_subtasks` の両権限が必要である。権限不足は 403、親が見つからない場合は 404、題名配列も行配列も空の場合は 422 を返す。
- トラッカー候補は `GET /canvas_gantt/subtasks/trackers.json` から取得する。各行のトラッカーは親プロジェクトで利用できるものに制限される。

## 作成と失敗

1. サーバーは親の `parent_issue_id`、`project_id`、`tracker_id`、`status_id`、`priority_id`、`assigned_to_id` を継承属性として用意する。
2. 各行で題名を trim し、空ならエラーとする。トラッカー指定があれば親の値を上書きし、プロジェクトのトラッカー一覧に含まれることを検証する。
3. 現在ユーザーを作成者とし、Redmine の `safe_attributes` と保存処理を通す。保存後に親子リンクを確認し、一致しなければエラーとする。
4. 全行を一つのトランザクションで処理する。１件でもエラーがあれば全件ロールバックし、成功していた行もロールバックのエラーに変換する。
5. 応答は `status: ok`、`success_count`、`fail_count`、行ごとの `status`、`subject`、成功時 `issue_id` または失敗時 `errors` を含む。`completeness: partial` と親・作成 ID の `invalidated_entity_ids` は更新後の再取得を助けるメタデータであり、部分コミットの意味ではない。

SPA は成功件数と失敗件数を通知し、失敗時は最初の行エラーを表示する。全件成功時だけ入力をクリアして折りたたむ。失敗時は入力を残す。HTTP エラーや通信例外では一般的な保存失敗を通知する。更新メタデータは既存のタスク状態更新経路に渡す。親フォームが検証エラーなら子の入力は送信前のまま維持される。保持は開いているコンポーネント内の状態であり、ダイアログを閉じて再度開いた後の永続化を保証しない。

## 実装と回帰確認箇所

- [画面](../../spa/src/components/BulkSubtaskCreator.tsx)、[親フォームとの順序](../../spa/src/components/IssueIframeDialog.tsx)、[API クライアント](../../spa/src/api/client.ts)
- [コントローラー](../../app/controllers/canvas_gantts_controller.rb)、[作成サービス](../../lib/redmine_canvas_gantt/bulk_subtask_creator.rb)、[認可](../../lib/redmine_canvas_gantt/mutation_authorization_policy.rb)
- [サーバーテスト](../../spec/lib/redmine_canvas_gantt/bulk_subtask_creator_spec.rb)、[画面テスト](../../spa/src/components/BulkSubtaskCreator.test.tsx)、[E2E](../../spa/tests/e2e/gantt-bulk-subtasks.pw.ts)

今回テストは実行していない。
