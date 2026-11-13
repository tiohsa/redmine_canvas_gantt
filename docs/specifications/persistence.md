# タスク変更の永続化と競合回復

対象: 開発 HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`、コード版 0.20.0、確認日 2026-11-13。公開マニュアルは v0.19.0 を対象とするため、本書をリリース済み機能の案内として扱わない。

## 目的と範囲

ガント上の編集を即時表示しつつ、Redmine の確定状態と未保存の意図を区別する。タスク、日程、一部の関連変更について、保存順序、部分成功、古い応答、競合を扱う。日程計画の制約と原子性は [スケジューリング](scheduling.md)、編集操作は [チケット編集](issue-editing.md) を参照。

主要実装は [TaskStore](../../spa/src/stores/TaskStore.ts)、[状態契約](../../spa/src/stores/taskStore/stateContract.ts)、[永続化処理](../../spa/src/stores/taskStore/taskPersistence.ts)、[更新サービス](../../spa/src/services/taskMutationService.ts)。

## 状態の構成

| 状態 | 役割 |
| --- | --- |
| `ServerSnapshot` | ID 別のサーバー entity、revision、読み込みコンテキスト。確定した基準となる。 |
| `LocalPatch` | entity ID、表示用 `projection`、送信意図 `mutationIntent`、generation、operation ID を保持する。バー操作 ID と日付配置モードを伴う場合がある。 |
| `MutationOperation` | 操作 ID、種別、context、generation、対象 ID、patch と rollback patch、再試行回数、状態を表す契約。 |
| 変更済み ID と関連 draft | 未保存のタスク意図と関連作成・更新・削除を追跡する。表示上の関連は確定値に draft を投影する。 |

表示は snapshot にローカル patch を重ねた結果であり、表示用 projection の全フィールドをそのままサーバーへ送るわけではない。送信対象は `mutationIntent` として管理する。patch の確定は generation とフィールド単位で行い、送信後に生じた新しい編集を残す。削除済み entity は tombstone により管理する。[draftIntent](../../spa/src/stores/taskStore/draftIntent.ts) と [状態契約テスト](../../spa/src/stores/taskStore/stateContract.test.ts) を参照。

## 自動保存と手動保存

- 初期設定は保存済み設定がなければ自動保存オフ。自動保存中の編集は更新経路へ送られ、応答から確定状態を取り込む。
- 手動保存中はタスクと関連の意図を draft として保持する。未保存状態はタスクまたは関連のいずれかに残る意図で判定する。
- 未保存変更がある状態で自動保存をオンにする場合、先に `saveChanges` を実行する。失敗または未保存変更が残ればオンに切り替えない。切り替え中の重複要求は共有される。
- `saveChanges` 自体も実行中の promise を共有し、重複する保存処理を起動しない。保存中に加わった編集を古い応答で消さない。
- 関連 draft は作成・更新・削除を正規化して有効な関連として表示する。保存中や結果不明の操作では、同じ関連の追加編集を制限する。[関連 draft 実装](../../spa/src/stores/taskStore/relationDrafts.ts)を参照。

### モード遷移と所有権

| 状態・操作 | 実際の遷移 |
| --- | --- |
| manual / `idle` | タスク patch と関連 draft を保持し、明示的な保存を待つ。 |
| auto 有効化要求 | 未保存変更がなければ即時有効化。あれば `enabling` に入り、実効 auto は false のまま保存を待つ。 |
| 保存完了 | failure がなく task・relation とも dirty が空の場合のみ auto を true にする。失敗、残存 draft、例外では manual に戻り `idle` となる。 |
| auto 無効化 | false に切り替える。既に進行中の mutation はそのまま応答の決着処理を行う。 |

保存はアクティブなバー操作が終わるまで待ち、ドラッグ中の暫定 patch を捕捉しない。各保存反復で task generation と関連 draft generation を捕捉する。確定応答はその操作が所有するフィールド・世代のみを settle し、同じ対象にその後加わった意図を残す。保存待ちの間に加わった変更も残存状況に応じて処理される。[TaskStore](../../spa/src/stores/TaskStore.ts)、[バー操作](../../spa/src/stores/taskStore/barOperations.ts)を参照。

## 手動保存の決着

保存時に対象と世代を捕捉し、日程に関わる変更とその他のフィールドを処理する。日程の計画は専用の一括 mutation を使い、残りのタスク変更は依存関係を考慮して送信する。先行タスクの決着は後続の送信条件となり、同順位では親の深さも順序の基準となる。独立して準備できた書き込みは最大 8 件まで並行できるので、手動保存全体が一つの DB トランザクションという意味ではない。

結果は `failures`、`savedTaskIds`、`unsentTaskIds`、`abortedTaskIds`、タスク別 `settledFieldsByTask` と `batchStatus`（`completed` / `partial_failure` / `preflight_failure`）で表現される。成功を確認できたフィールドだけを確定し、未送信・失敗分は残す。循環や事前検証エラー、先行処理の失敗は後続をブロックし得る。関連操作も順序付けて保存され、失敗後の残りは未処理として維持される。[永続化テスト](../../spa/src/stores/taskStore/taskPersistence.test.ts)、[関連 draft テスト](../../spa/src/stores/taskStore/relationDrafts.test.ts)を参照。

関連 draft は task draft とは独立の状態を持つ。捕捉した関連を事前検証した後、task 保存の結果とスコープを確認し、保存可能な関連を `delete → update → create`、同種では draft ID 順に処理する。関連は一件ずつ結果を確定し、該当 generation の draft のみ除去する。task や関連の一部が成功しても全体の原子性はなく、失敗・未送信分は残る。関連に関わる未確定の task 競合、表示範囲変更、検証失敗は関連保存を妨げる。結果不明の関連は安易に再送せず、確認を要する。[関連 draft](../../spa/src/stores/taskStore/relationDrafts.ts)、[関連 E2E](../../spa/tests/e2e/gantt-manual-relations.pw.ts)を参照。

## 書き込みキューと応答

`enqueueMutationOperation` は操作 ID、対象と resource key、generation を発行する。同一 resource key の操作は先行操作の完了後に実行し、異なるリソースは上限内で並行できる。日程 mutation は対象が重ならなくてもクライアント内で一つの順序付きストリームに入る。操作の記録には `queued`、`running`、`succeeded`、`conflict`、`failed`、`cancelled` があり、完了履歴は最大 128 件を保持する。

タスク更新には `lock_version` 等の revision を使う。結果の内部分類には成功、検証エラー、競合、権限拒否、未発見、一時エラーなどがある。成功応答であっても対象 ID、revision、意図したフィールドなどの正規の確認が不足する場合、信用できる確定応答として扱わない。HTTP 応答が欠落した場合はサーバー側で実行済みか不明なことがあり、単純な失敗と同一視しない。[結果分類](../../spa/src/api/mutationOutcome.ts)、[応答デコーダー](../../spa/src/api/mutationDecoders.ts)を参照。

結果分類の基本は次のとおり。`protocol_error` は応答契約の失敗として terminal に分類されるが、実際のサーバー保存の成否が不明な場合があるため、応答中の未検証 metadata を確定状態に適用しない。

| status | 分類と扱い |
| --- | --- |
| `ok` | `success`。必要な正規応答・revision を検証して確定する。 |
| `conflict` | `conflict`。リモート取得とローカル意図の競合解決へ進む。 |
| `validation_error` / `forbidden` / `not_found` | `terminal`。失敗した対象の役割も考慮する。参照先不在は対象そのものの削除と同一ではない。 |
| `protocol_error`、status 欠落・不正 | `terminal`。不正な応答を成功として settle しない。 |
| `error` / `transient_error`、分類不能の例外 | `transient`。結果不明や再試行の可否を呼び出し側で扱う。 |

構造化 `failure` は `resource_role`（`target` / `reference` / `relation` / `scope`）、対象種別・ID、`remote_availability` を含み得る。scope 自体の競合は単一タスクの古い revision と同一視せず、意図を残してスコープを再取得する。詳しい分類は [mutationOutcome](../../spa/src/api/mutationOutcome.ts) と [そのテスト](../../spa/src/api/mutationOutcome.test.ts)を参照。

## 読み込みの鮮度と巻き戻し

`ReadContext` は generation、project、query と scope の識別子、目的、merge policy を持つ。現行 context と一致しない遅延応答は superseded として適用しない。snapshot の同一 entity では古い revision を新しい revision に上書きさせず、部分応答は既存 entity にマージする。再取得時も dirty な patch の保持を考慮する。読み込みと mutation 後の再同期はそれぞれの context・generation ガードを通す。

競合時にはローカル意図と有効なリモート状態を区別し、競合解決 UI で回復する。失敗操作を巻き戻すときはサーバー snapshot を基礎とし、その操作より後の patch を再適用する。古い操作の失敗で後続編集を破棄しない。削除・閲覧不能・権限喪失など、最新値を得られないケースは再取得成功を前提にしない。[競合リモート処理](../../spa/src/stores/taskStore/conflictRemote.ts)、[競合 UI](../../spa/src/components/ConflictResolutionPanel.tsx)、[競合 E2E](../../spa/tests/e2e/gantt-conflicts.pw.ts)を参照。

## 境界と確認対象

日付専用値は暦日として扱い UTC midnight の内部表現を使用する。一般的なタイムスタンプ変換で日付をずらさない。権限と可視性はサーバー側でも確認する。ブラウザーを閉じた後まで未保存 draft が復元されることは本仕様では保証しない。通信断の結果不明状態は、応答から確定できない限り成功と断定しない。

関連テストには [状態機械](../../spa/src/stores/taskStore/stateMachine.test.ts)、[draft intent](../../spa/src/stores/taskStore/draftIntent.test.ts)、[mutation service](../../spa/src/services/taskMutationService.test.ts)、[手動関連 E2E](../../spa/tests/e2e/gantt-manual-relations.pw.ts) がある。これらは根拠として参照したものであり、この文書作成時に実行したことを意味しない。
