# URL とクエリパラメータ

Canvas Gantt の URL または Redmine の保存済みクエリを使うと、対応する表示条件を他の利用者へ共有できます。ブラウザーだけに保存される個人設定は、URL に明示しない限り含まれません。

## 条件の優先順位

表示条件は次の順で解決されます。

1. URL に明示されたパラメータ
2. `query_id` が指定する閲覧可能な保存済み Redmine クエリ
3. 現在のプロジェクトで同じブラウザープロファイルの `localStorage` に保存された最後のクエリ状態
4. 既定値

保存済みクエリが基底条件になり、URL で指定したフィルターが同じ項目を上書きします。

## Canvas URL パラメータ

| パラメータ | 意味 |
| --- | --- |
| `query_id` | 閲覧可能な保存済みクエリを基底条件として使う |
| `status_ids[]` | ステータス ID |
| `assigned_to_ids[]` | 担当者 ID。未割当は `none` |
| `canvas_project_ids[]` | 明示的に選択したプロジェクト ID。表示可能な範囲は下記「プロジェクト範囲」を参照。`none` は 0 件を明示 |
| `project_id` | Redmine の標準チケット検索条件。`set_filter=1`、`f[]=project_id`、`op[project_id]`、`v[project_id][]` と組み合わせる。Canvas のプロジェクト範囲には `canvas_project_ids[]` を使う |
| `project_ids[]` | 後方互換の入力。Canvas Gantt はこの形式を生成しない |
| `fixed_version_ids[]` | 対象バージョン ID。バージョンなしは `none` |
| `tracker_ids[]` | トラッカー ID |
| `group_by` | `project`、`assigned_to`、`none` のいずれか |
| `sort` | フロントエンドのキーと方向。例: `subject:asc` |
| `c[]` | 表示列。Redmine 標準の `c[]` と互換 |
| `show_subprojects` | `0` は非表示、省略または `1` は表示 |

## Redmine チケット一覧との互換性 {#redmine-issue-一覧との互換性}

対応するパラメータは `set_filter=1`、`f[]`、`op[field]`、`v[field][]`、`c[]`、`group_by`、`sort` です。対応フィールドは `status_id`、`assigned_to_id`、`project_id`、`fixed_version_id`、`tracker_id`、`subproject_id` です。`tracker_id` は `=` または `*` に対応します。Canvas URL では `tracker_ids[]` を使います。

| フィールド | 対応演算子 |
| --- | --- |
| `status_id` | `=`、`*`、`o`、`c` |
| `assigned_to_id` | `=`、`*`、`!*` |
| `project_id`、`fixed_version_id`、`tracker_id` | `=`、`*` |
| `subproject_id` | `*`、`!*` |

未対応のフィールドや演算子は warning とともに無視されます。特定の担当者と未割当を同時に含む条件は Redmine 標準 URL に正確に戻せないため、未割当側は省略されます。バージョンなし条件は Canvas URL では対応しますが、Redmine 標準 URL へ出力する場合は省略されます。既定ソートも出力時に省略される場合があります。

## 共有されない状態

件名テキストフィルターとワークロードのフォーカス条件は個人用ブラウザー状態です。ズーム、表示位置、行高、サイドバー幅、フォントサイズなどもブラウザー表示設定であり、同じブラウザープロファイル内の設定です。

## 例

```text
/projects/demo/canvas_gantt?query_id=12
/projects/demo/canvas_gantt?query_id=12&status_ids[]=1&assigned_to_ids[]=5
/projects/demo/canvas_gantt?canvas_project_ids[]=3&fixed_version_ids[]=7&group_by=project
/projects/demo/canvas_gantt?assigned_to_ids[]=none&show_subprojects=0
```

実際に開けるプロジェクト、チケット、保存済みクエリは利用者の Redmine 権限と可視性で決まります。

## プロジェクト範囲

通常は候補が開いているプロジェクトのツリー内に限られます。**所属プロジェクトのみ** を有効にすると、利用者が直接またはグループ経由で所属する、閲覧可能なアクティブプロジェクトが候補になります。管理者には閲覧可能なアクティブプロジェクトが候補になります。閉鎖・アーカイブ済みプロジェクトは候補に含まれません。

開いているプロジェクトのツリー外のプロジェクトは、プロジェクトフィルターで明示的に選ぶまでそのチケットを表示しません。表示可能かつ編集可能な外部プロジェクトのチケットを選ぶと、通常のチケット権限に従ってスケジュール操作できます。外部プロジェクト間の依存関係は Redmine の `cross_project_issue_relations` 設定にも従います。
