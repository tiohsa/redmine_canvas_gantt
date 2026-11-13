# Shared TimerSession contract — 移行案内

共有ストレージ、version 4、記録試行の状態遷移と復旧契約の正本は、[作業タイマー・時間記録仕様](specifications/timer.md) に統合しました。このパスは既存リンクのために維持します。

`redmine_kanban` と `redmine_canvas_gantt` の共有契約であるため、phase・version・スキーマを変更する際は両プラグインを一緒に更新・検証してください。`confirmed` 後は cleanup の再試行のみを許し、Time Entry POST を再送しない契約も移行先に維持しています。
