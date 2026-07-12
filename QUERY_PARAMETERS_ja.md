# Canvas Gantt の URL とクエリパラメータ

この文書では、Canvas Gantt の表示を共有する URL の仕様を説明します。
URL または保存済み Redmine クエリは他のユーザーへ渡せますが、ブラウザに
保存された個人設定は、クエリパラメータで明示されない限り共有されません。

## 状態の優先順位

表示条件は次の順で解決されます。

1. URL に明示されたパラメータ
2. `query_id` で指定された保存済み Redmine クエリ
3. 現在のプロジェクトについて同じブラウザプロファイルの
   `localStorage` に保存された、直前のクエリ状態（個人用のフォールバック）
4. 既定値

保存済みクエリが基底条件となり、URL の Canvas／Redmine フィルタが同じ項目を
上書きします。

## 共有できるクエリ状態と個人状態

URL または保存済みクエリに含めれば、次の条件を共有できます。

- ステータス、担当者、プロジェクト、対象バージョン、サブプロジェクトのフィルタ
- `query_id`
- グループ化、ソート、表示列
- サブプロジェクトを表示するかどうか

ツールバーの題名テキストフィルタとワークロードのフォーカスフィルタは、
共有 URL には保存されない個人用のブラウザ状態です。ズーム、表示位置、行高、
サイドバー幅、フォントサイズなどの表示設定も個人用のブラウザ設定です。
表示設定の「全プロジェクトで共有」は、同じブラウザプロファイルの全プロジェクトに
適用するという意味であり、Redmine のユーザー情報に紐づく設定でも、全ユーザーに共有
する設定でもありません。同じプロファイルを使う人には表示されます。

## フィルタ可能項目とグループ化可能項目

Canvas Gantt でフィルタできる項目:

- 題名テキスト（個人用、ローカルのみ）
- ステータス
- 担当者（未割当を含む）
- プロジェクト
- 対象バージョン（バージョンなしを含む）
- 下記の互換表に記載された Redmine 保存済みクエリの項目

Canvas Gantt でグループ化できる項目:

- プロジェクト
- 担当者

対象バージョンのヘッダー表示は、グループ化とは別の表示切り替えです。

## Canvas パラメータ

| パラメータ | 説明 |
| :--- | :--- |
| `query_id` | 閲覧可能な保存済み Redmine クエリを基底条件として使用 |
| `status_ids[]` | ステータス ID で絞り込み |
| `assigned_to_ids[]` | 担当者 ID で絞り込み。未割当は `none` |
| `canvas_project_ids[]` | 現在のプロジェクト／サブプロジェクト範囲内でプロジェクトを選択。`none` は 0 件を明示 |
| `project_id` | Redmine 標準入力。Canvas のプロジェクト範囲へ正規化 |
| `project_ids[]` | 後方互換のプロジェクト範囲入力。Canvas Gantt からは生成しない |
| `fixed_version_ids[]` | 対象バージョン ID で絞り込み。バージョンなしは `none` |
| `group_by` | `project`、`assigned_to`、または `none` |
| `sort` | フロントエンドのソートキーと方向。例: `subject:asc` |
| `c[]` | 表示列。Redmine の `c[]` と互換 |
| `show_subprojects` | `0` で非表示、省略または `1` で表示 |

## Redmine チケット一覧との互換性

対応パラメータは `set_filter=1`、`f[]`、`op[field]`、`v[field][]`、`c[]`、
`group_by`、`sort` です。対応フィールドは `status_id`、`assigned_to_id`、
`project_id`、`fixed_version_id`、`subproject_id` です。

対応演算子は次の通りです。

- `status_id`: `=`、`*`、`o`、`c`
- `assigned_to_id`: `=`、`*`、`!*`
- `project_id` と `fixed_version_id`: `=`、`*`
- `subproject_id`: `*`、`!*`

未対応のフィールドや演算子は warning を表示して無視します。特定の担当者と
未割当を組み合わせた条件は Redmine 標準 URL へ正確に書き戻せないため、未割当側を
省略します。バージョンなしは Canvas URL では対応しますが、Redmine 標準 URL へ
戻す際は省略されます。既定ソートも省略される場合があります。

## 例

```text
/projects/demo/canvas_gantt?query_id=12
/projects/demo/canvas_gantt?query_id=12&status_ids[]=1&assigned_to_ids[]=5
/projects/demo/canvas_gantt?canvas_project_ids[]=3&fixed_version_ids[]=7&group_by=project
/projects/demo/canvas_gantt?assigned_to_ids[]=none&show_subprojects=0
```
