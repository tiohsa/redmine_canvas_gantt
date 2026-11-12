# 作業時間タイマー仕様

対象: 開発 HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`（2026-11-13、コード 0.20.0）。公開マニュアルは v0.19.0 を対象とする。本書は現行実装の開発者向け記録であり、リリース済み機能の表明ではない。

## 目的と境界

[構成・計測状態・記録予約・時間記録フローの図](../architecture/timer-session-architecture.md)を併せて参照する。図も本仕様と同時に更新する。

チケットごとの経過時間をブラウザーで計測し、Redmine 標準の作業時間記録フォームへ引き継ぐ。タイマー列は初期状態で非表示であり、開始には対象チケットの `log_time` 権限が必要。同一ブラウザープロファイルの同一 Redmine インスタンス・ユーザーに対して、実行中または記録待ちのセッションを一つ保持する。ブラウザー間や端末間での共有は保証しない。

開始時の目標は 5、10、15、30、60 分。自動停止の既定値はオフ。手動停止または期限到達時の自動停止後は記録待ちになり、再開・延長・破棄・記録を選べる。既存セッションがある場合は新規開始を競合させず、既存作業の通知を出す。

## セッションと時計

- 保存形式は `TimerSession` version 4。`sessionId`、単調増加する `revision`、issue ID、件名、状態、時刻、区間、期限、自動停止、任意の記録試行を持つ。
- `running` は計測中、`expired` は自動停止オフで目標を過ぎても計測中、`stopped_pending_record` は停止済みで登録待ち。
- 時刻は epoch milliseconds の実際の瞬間である。経過時間は各 `startedAt` から `stoppedAt` または現在時刻までの合計。停止後の再開は新しい区間を作り、停止中の空白を計上しない。
- 自動停止オンではコールバックが遅れても最後の区間を期限ちょうどで閉じる。オフでは期限後も区間を開いたままにする。起動時・tick で期限を再評価し、通知の請求も共有状態で調停する。
- 記録用時間は区間の合計を時間に換算して小数第 2 位に丸める。短い計測は `0.00` になり得る。入力の受理は Redmine の検証に従う。
- 経過時間はローカル日付や DST の境界で区切らない。日付のみの値とは異なり、タイムゾーンに依存しない時刻差を使う。

## 操作と状態遷移

| 操作・事象 | 前提 | 結果 |
| --- | --- | --- |
| 開始 | 正本にセッションがなく、チケットで計測可能 | `running`、最初の開いた区間と期限を作成。取得競合時は開始しない |
| 期限到達 | `running`、自動停止オフ | `expired`、区間を開いたまま計測を継続 |
| 期限到達 | `running`、自動停止オン | 期限で区間を閉じ `stopped_pending_record` |
| 延長 | `running` / `expired`、記録試行なし | 前者は既存期限から延長、後者は現在から期限を設定して `running` |
| 手動停止 | `running` / `expired`、記録試行なし | 区間を閉じ、記録待ちと `editing` 予約を作りフォームを開く |
| 再開 | `stopped_pending_record`、記録試行なし | 新しい区間を開き、現在から期限を設定して `running` |
| 記録 | `stopped_pending_record`、記録試行なし | `editing` 予約を作って標準フォームを開く |
| 破棄 | `stopped_pending_record`、記録試行なし | 正本を削除 |

操作は正本の session ID と記録試行を再確認する。状態が変わっていたり保存に失敗した場合は、目的の変更が適用されたと見なさない。

## 保存と同期

`localStorage` の `redmine_canvas_gantt_timer_session`、`redmine_canvas_gantt_timer_preferences`、`redmine_canvas_gantt_timer_lock` に、エンコードした origin + Redmine base と user ID の接尾辞を付ける。タブ ID は `sessionStorage` に保持する。スコープが異なるユーザーやインスタンスのセッションを混同しない。

変更は共有ストレージの正本を読み直して適用する。Web Locks、IndexedDB、localStorage ロックの経路があり、同時操作と取得競合を扱う。storage イベントで他タブのスナップショットを取り込み、同一セッションの古い revision は採用しない。読み取り不能・不正データ・ロック競合時に既存データを空として上書きしない。v2/v3 の妥当なデータは v4 に移行し、旧記録試行の不確実な状態は安全側に扱う。

`redmine_kanban` とストレージキー・スキーマ・version 4 を共有する契約がある。phase や version を変更する場合は両プラグインで一緒に実装・検証すること。この共有契約は旧 [timer-session-contract.md](../timer-session-contract.md) の内容を引き継ぐ。

## 記録処理と失敗

記録は `/issues/:id/time_entries/new?time_entry[hours]=...` を iframe で開く。保存自体は Redmine のフォームが行う。タイマー由来の context はスコープ、session ID、attempt ID、所有タブを照合し、無関係な画面の遷移でセッションを消さない。

| 記録試行 phase | 意味と遷移 |
| --- | --- |
| `editing` | フォーム編集中。キャンセルすると試行を解除し記録待ちを残す。 |
| `submitting` | フォーム送信中。検証エラーは `editing` に戻し、不明な結果は `unknown` とする。 |
| `confirmed` | Redmine の成功を確認済み。残るのはローカルセッションの削除のみ。 |
| `unknown` | 送信結果を安全に判断できない。利用者が Redmine の作業時間一覧を確認し、記録済み／未登録を解決する。 |

成功経路は `editing → submitting → confirmed → cleanup`。cleanup が失敗したら `confirmed` を保持し、同期・cleanup の再試行だけを許す。`unknown`、`editing`、`submitting` に戻したり Time Entry POST を再送したりしない。フォーム編集中・送信中は他タブから再開・延長・破棄・記録できない。所有タブを失った試行の明示的な回復では、送信中の結果を `unknown` として扱う。一般的なネットワーク障害ではサーバー側の成否を推測しない。

明示回復では `editing` の予約は解除され、`submitting` は `unknown` になる。`unknown` を「記録済み」と確認すればセッションを削除し、「未登録」と確認すれば試行だけを解除して記録待ちに戻す。`confirmed` は結果不明として解決せず、cleanup のみを再試行する。試行 ID や所有コンテキストが一致しない操作は適用しない。

正本の読み取り・書き込みが失敗した場合は、欠損と誤認して新規セッションを作らず、既存の表示状態を保つ。フォームの予約・送信状態を永続化できなければ処理を進めない。Redmine が受理した後のローカル cleanup が失敗した場合は、確認済み状態を残して再同期する。

## 実装と検証根拠

- [型](../../spa/src/types/timer.ts)、[時間・状態遷移](../../spa/src/domain/timer/timerDomain.ts)、[ストレージ](../../spa/src/services/timerStorage.ts)、[ストア](../../spa/src/stores/TimerStore.ts)
- [フォームと結果判定](../../spa/src/components/IssueIframeDialog.tsx)、[判定ロジック](../../spa/src/domain/timer/timerRecordingOutcome.ts)
- [時刻・DST テスト](../../spa/src/domain/timer/timerDomain.timezone.test.ts)、[ストレージテスト](../../spa/src/services/timerStorage.test.ts)、[ストアテスト](../../spa/src/stores/TimerStore.test.ts)、[複数タブ E2E](../../spa/tests/e2e/gantt-work-timer-multitab.pw.ts)、[Redmine E2E](../../spa/tests/e2e-redmine/work-timer.pw.ts)
- この文書の作成にあたりテストを実行したという意味ではない。サイトデータ消去、別ブラウザー、他プラグイン側の実装状態は本書だけでは確認できない。
