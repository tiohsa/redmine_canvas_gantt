# 日程・依存関係・クリティカルパス

対象: 開発 HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`、コード版 0.20.0、確認日 2026-11-13。公開マニュアルはタグ v0.20.0（`0c2b68a`）を対象とし、この開発仕様の確認コミットとは区別する。

## 目的と境界

日付変更と依存関係をガント上で編集し、実際の Redmine データに整合する日程を保存する。表示・プレビューの計算とサーバーでの確定を分ける。手動保存、世代管理、競合回復は [永続化](persistence.md)、カレンダーの構成は [カレンダー](calendars.md)、ガント操作の画面構成は [ガント表示](gantt-view.md) を参照。

日付は `YYYY-MM-DD` の暦日であり、内部の UTC midnight は日時としての意味を持たない。[dateOnly](../../spa/src/utils/dateOnly.ts) を変換の境界に使う。親チケットの日付が子から導出される場合、その確定値は Redmine が所有し、クライアントが親の更新を合成しない。

## 関連と制約

依存関係グラフのスケジューリング辺は `precedes` と `follows` のみで、後者は方向を逆転して先行・後続に正規化する。間隔は `1 + delay` 営業日で、先行の終了日から求める後続の最早開始日に **後続チケットのプロジェクトカレンダー**を使う。他の関連種別は関連として扱うが、この依存制約辺にはしない。[constraintGraph](../../spa/src/scheduling/constraintGraph.ts) を参照。

開始・終了が共にないチケット、片側のみの日付、開始が終了より後の日付、依存循環、制約違反は別々の状態として導出する。日付が不完全なものや循環に含まれるものを、無条件に自動計算できる対象とは扱わない。循環検出は循環に属するノードを特定する。

関連エディターの delay 自動計算では、先行の終了日がなければ開始日を境界に使う。後続開始日が必要で、後続側カレンダーを使う。この fallback は関連編集時の計算であり、不完全な日付範囲を自動スケジュール対象にする意味ではない。[関連編集の計算](../../spa/src/utils/relationEditing.ts)を参照。

関連の作成 API は `relation.issue_from_id`、`issue_to_id`、`relation_type`、任意の `delay` を受け取る。更新では既存状態の期待値を送れる。手動保存時は関連の作成・更新・削除を draft として重ねて表示し、確定済みの関連とは区別する。権限、可視性、対象、循環等のサーバー検証に失敗した変更は確定しない。[API クライアント](../../spa/src/api/client.ts)、[関連バリデーター](../../lib/redmine_canvas_gantt/relation_change_validator.rb)、[手動関連 E2E](../../spa/tests/e2e/gantt-manual-relations.pw.ts) を参照。

## バー操作と日程計算

バーの移動・両端のリサイズ、複数選択の操作では、操作開始時の状態と操作世代を基にプレビューを構築する。保存中に次の操作が始まっても、先行操作の成功・失敗が後続操作の所有権を奪わない。操作できないチケットや不正な日程はそのまま保存しない。[バー操作状態](../../spa/src/stores/taskStore/barOperations.ts)、[バー操作テスト](../../spa/src/stores/taskStore/barOperations.test.ts) を参照。

依存日程の再計算は有効な日付を持つ後続をたどる。制約より早い後続は、後続側の営業日カレンダーで必要な開始日へ移し、営業日単位の期間を保つ。日付が導出される親や無効・不完全な範囲はこのクライアント再計算の対象外となる。リンク先をまとめて移動する計算は、移動後の外部依存関係を検証し、違反する場合は変更を返さずエラーとする。複数操作の結合時には最終グラフを検証する必要がある。

日付の配置モードおよびプロジェクトごとの営業日・休日は日程計算とサーバー検証に影響する。曜日、休日、個別稼働日の扱いは [カレンダー](calendars.md) を参照。表示上の予測がサーバー側の権限、他の利用者による更新、Redmine のコールバックを上書きすることはない。

### 複数移動の対象と検証

複数選択した表示中のチケットをバー本体で移動するとき、親は移動対象から除外される。残る末端がすべて編集可能で、日付導出対象でなく、開始日または期日を少なくとも一つ持つ必要がある。対象がない場合や条件を満たさない末端を含む場合は移動を開始しない。開始日だけ、期日だけのチケットも移動できる。非表示の選択は表示中の移動 cohort に含まれない。[InteractionEngine](../../spa/src/engines/InteractionEngine.ts) を参照。

暦日モードでは各日付を同じ暦日差で移す。営業日モードでは掴んだチケットのカレンダーを基準に移動量を求め、各対象のカレンダーで移動し、両日付がある場合は営業日期間を維持する。選択 cohort を連鎖計算から除外して二重移動を防ぐ。自動スケジュールが有効な複数移動では、選択対象に属する循環を拒否し、選択内部や外部への辺も含めた最終結果で既存の依存違反が悪化しないか検証する。操作の拒否は候補を適用しない。[TaskStore](../../spa/src/stores/TaskStore.ts)、[操作テスト](../../spa/src/engines/InteractionEngine.test.ts)を参照。

バー操作の保存失敗では操作 ID と対象ごとの generation によって rollback / settlement の所有者を判定する。確定的な拒否で操作を戻す場合も、その後の patch や独立して成功した変更は無条件に消さない。競合はリモート取得と解決の対象とし、応答の成否が不明な場合は確定済みと断定しない。保存中の一時的な候補は保存開始時に捕捉しない。詳細は [永続化](persistence.md)を参照。

## 原子的な日程 mutation

`POST /canvas_gantt/schedule_mutation.json` は view context を付けて呼び出す。プロジェクト配下のルートもある。[ルート](../../config/routes.rb)、[コントローラー](../../app/controllers/canvas_gantts_controller.rb)、[coordinator](../../lib/redmine_canvas_gantt/schedule_mutation_coordinator.rb) を参照。

| 要素 | 内容 |
| --- | --- |
| `operation_id` | 必須の操作識別子。空の場合は 422。 |
| `base_revisions` | 対象 task ID ごとの基準 revision。明示的な変更対象に必要。 |
| `changes` | `task_id`、変更する `start_date` / `due_date`、任意の `date_placement_mode`。日付は暦日文字列または null。 |
| `resolution` | 解決操作の対象 `task_ids`、`token`、`preview`、必要に応じて `accepted_adjustments`。 |
| 応答 | `status`、`operation_id`、`completeness`、`entities`、`revisions`、`invalidated_entity_ids`。条件に応じて `resolution_context`、`adjustments`、`errors`、`conflict` / `conflicts`、`failure`。 |

成功は HTTP 200、競合は 409、検証失敗は 422、権限拒否は 403、対象不在は 404。成功時の completeness は `complete`、それ以外は `partial`。クライアントは完全な確認応答を検査し、未確認の応答を確定値として信用しない。

coordinator は対象と revision を確認し、関連・親子・Redmine コールバックの影響範囲を考慮してロック・検証・保存する。明示した対象だけでなく、コールバックにより実際に変更されたチケットのスコープ、可視性、編集権限も検査する。検証や競合で失敗した一括日程変更はトランザクションを巻き戻す。スコープ変化への処理には最大 3 回の試行がある。手動保存のその他のフィールドや関連操作まで、このトランザクションに含まれるわけではない。

各試行はカレンダー snapshot から resolver を作り、正規化と Redmine callback を同じ scoped calendar context で実行する。callback scope の signature をロック前後と保存後に検査し、変化時は試行を rollback して再試行する。上限到達時は scope の競合として扱い、タスクごとの stale revision と区別する。context は処理範囲に限定され、通常の別リクエストにカレンダーを漏らさない。[カレンダー context](../../lib/redmine_canvas_gantt/schedule_calendar_context.rb) を参照。

競合解決では対象グラフ、revision、日付、カレンダーおよび関連設定などから token を作り、プレビューした条件が変わっていないか検証する。調整案の受諾後も最新状態と権限の検証が必要。クライアントは日程 mutation を一つの順序付きキューで送るが、他セッションとの競合は revision 検査で扱う。[解決処理](../../spa/src/stores/taskStore/scheduleConflictResolution.ts)、[coordinator テスト](../../spec/lib/redmine_canvas_gantt/schedule_mutation_coordinator_spec.rb)、[同時実行テスト](../../spec/lib/redmine_canvas_gantt/schedule_mutation_coordinator_concurrency_spec.rb) を参照。

## クリティカルパス

表示中のタスクとスケジューリング辺からトポロジカル順序を作り、営業日を用いて早期・晩期開始／終了、余裕日数を計算する。結果は task ID 別の `durationDays`、`es`、`ef`、`ls`、`lf`、`totalSlackDays`、`critical`、全体の `projectFinish`、順序、除外 ID、循環 ID を含む。有効な開始・終了を持たないタスクと循環に属するタスクは計算対象から除外し、両端が対象にある辺を使う。したがって表示・取得範囲外のチケットを含む全プロジェクトの完全な経路を保証しない。[実装](../../spa/src/scheduling/criticalPath.ts)、[単体テスト](../../spa/src/scheduling/criticalPath.test.ts)、[比較テスト](../../spa/src/scheduling/criticalPath.differential.test.ts)、[E2E](../../spa/tests/e2e/gantt-critical-path.pw.ts) を参照。

## 性能上の境界

クリティカルパスや複数移動の計算はロード済みグラフの規模と辺の密度に影響される。[選択移動 benchmark](../../spa/scripts/benchmark-selected-drag.bench.ts) は測定手段であり、過去の結果は現在の環境や任意の件数での応答時間を保証しない。store 単体の測定値から、描画・入力・通信を含むブラウザー全体の応答性を判断しない。今回の文書作成では benchmark を実行していない。

## 失敗と検証の観点

競合、権限喪失、対象の非表示・削除、日程の不正、依存循環、外部依存違反、カレンダー変更、通信結果不明では、プレビューを確定扱いにしない。成功済みの他操作と未保存意図を区別して回復する。保存・再取得の遅延応答が新しい編集を上書きしないことも必要である。

根拠となるテストには [依存関係 E2E](../../spa/tests/e2e/gantt-dependency.pw.ts)、[競合 E2E](../../spa/tests/e2e/gantt-conflicts.pw.ts)、[カレンダー付き日程テスト](../../spec/lib/redmine_canvas_gantt/issue_schedule_calendar_patch_spec.rb) がある。これらの参照は今回テストを実行したことを意味しない。
