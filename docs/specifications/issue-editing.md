# チケット編集の現行仕様

対象: 開発 HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`（コード 0.20.0、2026-11-13）。公開マニュアル v0.19.0 を更新するものではない。

## 編集経路

- サイドバーのインライン編集は編集可能なセルを操作し、既存のタスク状態と保存経路に変更を渡す。自動保存と手動保存、変更中の値、競合回復は [保存仕様](persistence.md) の責務である。
- コントローラーの `CANVAS_GANTT_UI_SETTINGS` は題名、担当者、状態、進捗、期日、カスタムフィールドを固定で有効にする。SPA の設定型には開始日や予定工数もあるが、これを管理者が変更できる設定と決めつけない。各 issue と各フィールドの権限はサーバーの編集メタデータで判断し、Redmine が安全な属性として許さない値は編集可能にならない。設定と権限の範囲は [権限・設定](permissions-settings.md) を参照する。
- Redmine の issue 表示・新規作成・編集等は iframe ダイアログ内でネイティブフォームを使用する。フォーム送信と Redmine の検証結果、リダイレクトを監視し、保存成功後はデータを更新する。エラーが残ったフォームはそのまま扱う。
- ダイアログでの親保存と一括子作成の順序は [子チケット一括作成](bulk-subtasks.md) を参照する。ネイティブフォームはインライン編集の JSON API と独立した保存経路である。

## 編集メタデータとプレビュー

`GET /canvas_gantt/tasks/:id/edit_meta.json` は保存済みチケット、フィールドごとの編集可能性、選択肢、カスタムフィールド情報を返す。プロジェクト配下にも同等のルートがある。GET は互換用に `target_project_id`、`target_tracker_id`、`target_status_id` を受け付ける。

`POST /canvas_gantt/tasks/:id/edit_meta/preview.json` は `{ "task": { ... } }` の下書きを評価する。保存は行わない。対象 issue の可視性・現在の範囲に加えて編集権限を確認する。プロジェクト、トラッカー、ステータスの変更後の候補と能力を下書きの文脈で計算できる。

GET は対象の閲覧と範囲を検査し、編集不可でも `editable` にその結果を返せる。プレビューは編集権限を必須とする。GET に互換の対象文脈がある場合も評価され、評価中の権限違反は 403 となる。

応答に含まれる主な情報は次のとおり。

| 項目 | 意味 |
| --- | --- |
| `task` | 保存済み値と `lock_version` |
| `editable` | 題名、担当者、状態、進捗、日付、優先度、カテゴリ、予定工数、プロジェクト、トラッカー、バージョン、カスタムフィールドの編集可能性 |
| `options` | 状態、担当者、優先度、カテゴリ、プロジェクト、トラッカー、バージョン、カスタムフィールドの候補 |
| `custom_field_values` | 現在のカスタムフィールド値 |
| `capability_context` | 評価に使った issue、プロジェクト、トラッカー、状態 |
| `draft_contract` | 下書き評価時の基準 revision、実体化された値、正規化、違反 |

編集可能なカスタムフィールド形式は string、int、float、list、bool、date、text である。評価で権限違反が判明すれば 403、対象が見つからなければ 404 を返す。リビジョンが古い下書きは競合として評価される。クライアントは応答の文脈を確認し、古いプレビューが現在の編集内容を上書きしないようにする。

プレビューで古い `lock_version` は `draft_contract.violations` の `stale_revision` として表す。更新時の同じ条件は 409 と最新 entity / revision になる。更新時の通常の下書き検証失敗は 422 の `status: validation_error`、`errors`、`draft_contract` を返す。正規化には `field`、変更前後、`source`、違反には `field`、`code`、`message` がある。

## 更新、移動、削除

`PATCH /canvas_gantt/tasks/:id.json` は `task` オブジェクトで `subject`、`assigned_to_id`、`status_id`、`done_ratio`、`start_date`、`due_date`、`priority_id`、`category_id`、`estimated_hours`、`project_id`、`tracker_id`、`fixed_version_id`、`parent_issue_id`、`lock_version`、`custom_field_values` 等を受け付ける。日付意図には日付更新・配置モードも用いる。

- issue は可視で現在のプロジェクト範囲内でなければならない。編集にはプロジェクトの `edit_issues` と issue の `editable?` が必要である。
- 更新前にリビジョンと下書きを検証し、日付・親の変更を前処理する。プロジェクト移動時は移動先の認可された文脈で候補と日付を評価する。親の指定はリンクの成立も検証する。
- 親変更の応答にある `sibling_position: tail` は新しい兄弟集合の末尾への配置をクライアントに伝える。任意の兄弟順序を指定する API ではない。親の指定後に Redmine が実際に設定した親が一致しなければ 422 を返す。
- 正常応答は `status: ok`、`entity`、`revision` / `lock_version`、`task_id`、`parent_id`、`sibling_position: tail`、変更対象や旧・新親の `invalidated_entity_ids` を返す。`completeness: partial` は再取得が必要な関連状態があることを表す。
- 検証・保存・親リンクの失敗は 422、権限不足は 403、対象不在は 404、古い revision は 409 となる。競合応答には取得可能な最新 entity と revision を含む場合がある。クライアントは異常な応答もプロトコルエラーとして扱う。
- 日付に関わる意図は業務カレンダー revision の検査対象となる。日付のみの値はタイムゾーン付き時刻に変換しない。親の集約日付は Redmine に任せ、クライアントが親の更新を合成しない。
- `DELETE /canvas_gantt/tasks/:id.json` は可視性、範囲、`delete_issues` と `deletable?` を確認する。成功時は削除 ID と、対象および親の無効化 ID を返す。削除権限は編集権限とは別である。

## 実装と回帰確認箇所

- [インライン編集](../../spa/src/components/sidebar/useSidebarInlineEdit.ts)、[エディター](../../spa/src/components/InlineEditors.tsx)、[編集メタデータ状態](../../spa/src/stores/EditMetaStore.ts)
- [iframe ダイアログ](../../spa/src/components/IssueIframeDialog.tsx)、[API クライアント](../../spa/src/api/client.ts)、[コントローラー](../../app/controllers/canvas_gantts_controller.rb)
- [下書き評価](../../lib/redmine_canvas_gantt/issue_draft_evaluator.rb)、[認可](../../lib/redmine_canvas_gantt/mutation_authorization_policy.rb)
- [メタデータ状態テスト](../../spa/src/stores/EditMetaStore.test.ts)、[インライン編集テスト](../../spa/src/components/sidebar/useSidebarInlineEdit.test.tsx)、[ダイアログテスト](../../spa/src/components/IssueIframeDialog.test.tsx)

今回テストは実行していない。Redmine のフォームやワークフローはインストール済みプラグインと権限設定に依存する。
