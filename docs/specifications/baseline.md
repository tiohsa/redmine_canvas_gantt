# ベースラインの現行仕様

対象: HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`、2026-11-13 時点の実装（プラグイン 0.20.0）。公開マニュアルの対象は v0.19.0 であり、本書は開発中の実装を記述する。

## 目的とデータ

ベースラインは保存時のチケットの開始日・期日を記録し、現在のガント上の日付と比較する。履歴を複数世代保存する機能ではなく、対象プロジェクトごとに 1 件を保持し、再保存で置換する。タスクの更新経路は [永続化](persistence.md)、対象の選択は [クエリと範囲](query-scope.md)を参照。

`BaselineSnapshot` のメタデータは `snapshot_id`、`project_id`、UTC の `captured_at`、`captured_by_id`、`captured_by_name`、`scope`。各チケットは ID と `baseline_start_date`、`baseline_due_date` のみを保持し、日付は欠損し得る。API はチケット ID をキーにした `tasks_by_issue_id` を返す。チケット名、担当者、進捗、見積時間などの履歴は保存しない。

## 作成と表示

1. `POST /projects/:project_id/canvas_gantt/baseline.json` は `manage_canvas_gantt_baseline` の権限を確認する。
2. `scope` は `filtered` または `project`。省略時は `filtered`、その他の値はエラー。
3. `filtered` は現在のクエリ解決結果を保存する。`project` は対象プロジェクトと子孫の可視チケットをクエリのフィルターによらず取得する。いずれも取得件数の上限に従う。
4. サーバー上のチケットの日付から新しい ID と取得時刻を生成し、プロジェクトの既存スナップショットを置換する。クエリの警告も応答に含まれ得る。
5. 通常のガントデータ取得時にはスナップショットを読み、現在のユーザーに可視で対象プロジェクト範囲内のチケットだけを含めて返す。元の保存内容をこの読み出しで変更しない。

保存先はプラグイン設定の `baseline_snapshots`。設定行をロックしたトランザクションで置換・削除し、設定キャッシュを更新する。メモリー設定など DB ロックを利用しない場合はプロセス内 mutex を使用する。

保存ハッシュではプロジェクト ID の文字列をキーにし、メタデータと `task_states` 配列を格納する。各配列要素は `issue_id`、`baseline_start_date`、`baseline_due_date`。読み出しは旧形式の `task_states` ハッシュや `tasks_by_issue_id` ハッシュも受け付け、`scope` 欠損時は `filtered` と解釈する。保存形式に独立した schema version フィールドはない。

`snapshot_id` は UUID として新規保存ごとに作られる識別子で、各チケットの `lock_version` とは別物。作成・置換は以前の ID を期待値として検証しないため、並行した保存は後に完了した置換が残る。一方、削除は下記のとおり期待 ID を検証する。保存時には未保存の SPA draft をスナップショットとして直接送信せず、サーバーのチケットを取得する。

SPA の [BaselineStore](../../spa/src/stores/BaselineStore.ts) はスナップショット、警告、保存・削除状態とエラーを保持する。表示切替と比較は保存内容を変更しない。保存対象外や新規チケットには対応するベースラインがない。

## 比較

[比較計算](../../spa/src/utils/baseline.ts)は現在と保存時の開始・期日の差を暦日で計算する。両端がある期間は両端を含み最小 1 日、片端のみでも 1 日、両端がない場合は期間なし。両方の値がある場合に開始差、期日差、期間差を算出し、欠けた値は差なしの数値に置き換えない。開始または期日の欠損状態が異なる場合も差分として扱う。営業日数の差ではない。

## 削除と失敗

`DELETE /projects/:project_id/canvas_gantt/baseline.json` も管理権限を要し、観測した `snapshot_id` を渡す。ロック内で現在の ID と比較し、一致時のみ削除する。ID 不正は 422、対象なしは 404、他の操作による置換後の古い ID は 409 で、クライアントに再取得を促す。成功応答は `baseline: null` と `deleted_snapshot_id` を含む。古い削除要求が新しいスナップショットを消すことはない。

保存データの必須メタデータ不備やプロジェクト ID 不一致は警告とともにスナップショットを返さない。個々の無効なチケット状態も検証され、警告が返される。通信や権限、ペイロード上限のエラーは成功として扱わない。

無効な issue ID や解析できない日付を持つチケット状態は除外して残りを読み、警告を返す。scope が不正などスナップショット全体の構築に失敗した場合はスナップショットを返さない。現在の可視性によりフィルタリングされた結果は、保存時の対象数と異なり得る。

## 実装と検証

- [リポジトリ](../../lib/redmine_canvas_gantt/baseline_repository.rb)、[スナップショット](../../lib/redmine_canvas_gantt/baseline_snapshot.rb)、[チケット状態](../../lib/redmine_canvas_gantt/baseline_task_state.rb)、[コントローラー](../../app/controllers/canvas_gantts_controller.rb)。
- [リポジトリテスト](../../spec/lib/redmine_canvas_gantt/baseline_repository_spec.rb)、[モデルテスト](../../spec/lib/redmine_canvas_gantt/baseline_snapshot_spec.rb)、[比較テスト](../../spa/src/utils/baseline.test.ts)、[権限 E2E](../../spa/tests/e2e-redmine/baseline-permissions.pw.ts)、[削除ダイアログ E2E](../../spa/tests/e2e/dialog-settings-baseline-delete.pw.ts)。
- プロジェクトごとに 1 件なので、置換や削除から過去の状態を復元する機能はない。現在の可視性に応じて返るチケット数は変わる。
