# 権限設計

Canvas Gantt の表示権限と、チケットに対する操作権限は別々に判定されます。ロールには必要な権限だけを付与し、対象チケットが属するプロジェクトの Redmine 標準権限も確認してください。

## Canvas Gantt 固有の権限

| 権限 | 用途 |
| --- | --- |
| `view_canvas_gantt` | プロジェクトの Canvas Gantt を表示する |
| `manage_canvas_gantt_baseline` | ベースラインを保存・置換する |

ベースラインの比較表示には `view_canvas_gantt` が必要です。保存には `manage_canvas_gantt_baseline` が必要です。ベースラインはプロジェクトごとに 1 件で、新しい保存は既存スナップショットを置き換えます。

![Canvas Gantt の権限設定。](/images/permissions-en.png)

[画像を拡大](/images/permissions-en.png)

旧 `edit_canvas_gantt` 権限を使っていた場合、現在の権限へ自動移行されません。ベースライン保存を続けるロールにだけ `manage_canvas_gantt_baseline` を付け直してください。通常のチケット編集権限の代わりに Canvas Gantt 固有権限を使うことはありません。

<a id="issue-操作に使われる-redmine-標準権限"></a>

## チケット操作に使われる Redmine 標準権限

| 操作 | 対象チケットのプロジェクトで確認する権限 |
| --- | --- |
| チケットの項目や日程の編集 | `edit_issues` と Redmine のチケット編集可否 |
| チケットの削除 | `delete_issues` |
| 子チケットの作成 | `add_issues` と `manage_subtasks` |
| 関連の作成・変更 | 関連するチケットの編集可否。別プロジェクト間は `cross_project_issue_relations` の設定も適用 |

これらは Canvas Gantt を開いたプロジェクトではなく、操作対象チケットが属するプロジェクトの権限で判定します。別プロジェクトのチケットも Redmine の可視性ルールに従います。Canvas Gantt の表示権限を、チケットの閲覧・編集権限の代わりにすることはできません。

## 推奨する確認手順

1. **管理 → ロールと権限**で、閲覧者には必要に応じて `view_canvas_gantt` を付与します。
2. ベースライン保存担当のロールにだけ `manage_canvas_gantt_baseline` を付与します。
3. チケットの編集、削除、子チケット作成を許可する場合は、対象プロジェクトの標準権限をそれぞれ設定します。
4. プロジェクトの**設定 → モジュール**で Canvas Gantt が有効なことを確認します。
5. 権限を付与したテストユーザーで対象プロジェクトと、必要なら別プロジェクトのチケットを確認します。

実際のメニュー名は Redmine の言語設定により異なる場合があります。制限されたチケットや作業時間の情報は、サーバー側で Redmine の可視性に従って扱われます。

権限があるのに操作できない場合は[トラブルシューティング](/ja/troubleshooting/)を参照してください。
