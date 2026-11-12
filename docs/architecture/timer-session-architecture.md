# 作業タイマーのアーキテクチャー

確認日: 2026-11-13。基準: `30e4e6fbdde1ed270bd4ed5e8aeffaee99e17c47`（コード上の 0.20.0）。公開マニュアル v0.19.0 のリリース範囲とは区別する。

旧 PNG の構成図を、現行実装から確認した Mermaid の図に置き換えた。詳細な操作・保存契約の正本は [作業タイマー・時間記録仕様](../specifications/timer.md)。この文書はその構成と実行順序を可視化する。Mermaid 対応の Markdown ビューアーで表示でき、未対応の環境でもコードブロックをテキストとして読める。

## 構成とデータの境界

```mermaid
flowchart TB
    subgraph browserScope["同じ Redmine インスタンス・ユーザーのブラウザー内"]
        taskStore["TaskStore: Issue 情報・canLogTime"]
        timerUi["一覧のタイマー列・GlobalTimer・各モーダル"]
        timerStore["TimerStore: 操作・期限の調整・結果の反映"]
        domain["timerDomain: 時間計算・純粋な状態変換"]
        coordinator["timerStorage.mutateStoredTimerSession: 排他内で正本を読んで更新"]
        lockBackend["排他: Web Locks / IndexedDB / localStorage lease"]
        sessionStorage["localStorage: TimerSession v4 の正本"]
        preferences["localStorage: autoStop 設定"]
        otherTab["他タブの TimerStore"]
        uiStore["UIStore: ダイアログ URL・記録 context・toast"]
        dialog["IssueIframeDialog: 標準フォーム・送信制御・結果判定"]
        notifications["timerNotification: ブラウザー通知 / toast"]

        taskStore -->|"Issue を選択"| timerUi
        timerUi -->|"開始・延長・停止・記録・回復"| timerStore
        timerStore -->|"セッション変更を要求"| coordinator
        coordinator -->|"選択した方式で排他"| lockBackend
        sessionStorage -->|"最新セッションを読む"| coordinator
        coordinator -->|"mutation 内の状態変換"| domain
        domain -->|"変更候補 / 変更なし"| coordinator
        coordinator -->|"revision 更新・保存または削除"| sessionStorage
        coordinator -->|"applied / unchanged / locked / storage_error"| timerStore
        timerStore -.->|"表示用 snapshot"| timerUi
        sessionStorage -.->|"storage event を受けて再読込"| otherTab
        timerStore -->|"設定の読込・保存"| preferences
        timerStore -->|"記録予約の保存後にフォームを開く"| uiStore
        uiStore --> dialog
        dialog -->|"送信前の予約確認・結果の反映"| timerStore
        timerStore -->|"期限通知の請求を保存できた場合"| notifications
        notifications -.->|"通知不可・失敗時の toast"| uiStore
    end

    subgraph redmineServer["Redmine サーバー"]
        taskApi["Canvas Gantt API: 可視 Issue と log_time 可否"]
        timeEntryForm["標準 TimeEntry フォーム: 権限・CSRF・入力検証"]
        timeEntryDb["DB: TimeEntry"]
    end

    taskApi --> taskStore
    dialog -->|"標準フォームの GET / POST"| timeEntryForm
    timeEntryForm -->|"検証成功時に保存"| timeEntryDb
    timeEntryForm -.->|"遷移先ページ・検証エラー・成功表示"| dialog
```

実線は操作・読込・保存、破線は表示更新・イベント・結果の通知を表す。図の矢印は概念的な依存関係であり、各箱が独立プロセスや API であることを意味しない。

- **タイマーの正本はブラウザー内**にあり、TimeEntry の正本は Redmine の DB にある。タイマー専用のサーバー保存 API はない。計測した時間は標準フォームの初期値へ渡し、フォームが保存する。
- セッションは origin + Redmine の base path + user ID のスコープで共有する。タブ ID は `sessionStorage` に保存し、記録予約の所有者として使用する。別ブラウザー・端末との同期は行わない。
- セッション変更の排他は `timerStorage.ts` 内で実装する。Web Locks があればそれを使い、なければ IndexedDB、さらに localStorage lease の経路を使う。IndexedDB の callback 実行後の障害で同じ mutation を再実行しない。Web Locks の失敗を無条件に別方式で再実行する設計ではない。
- IndexedDB は調停に使い、TimerSession の保存先は localStorage。autoStop の利用者設定はセッションとは別の保存経路を持つ。
- `storage` イベントは相互排他ではなく、他タブが正本を読み直すきっかけ。同一 session ID の古い revision は表示へ採用しない。
- GlobalTimer の毎秒更新は表示用の時計を更新する。期限は `setTimeout` と起動・tick 時の再評価で処理し、毎秒の描画のために共有ロックを取得しない。

## 計測状態

この図の `running`、`expired`、`stopped_pending_record` が `TimerSession.state` の値である。「セッションなし」は localStorage の正本がない状態を表す。図の開始点は新規計測の経路であり、アプリ起動時に必ずこの状態へ戻す意味ではない。起動時は既存の正本を復元し、期限を再評価する。

```mermaid
stateDiagram-v2
    state "セッションなし" as idle
    state "計測中: running" as running
    state "目標超過・計測継続: expired" as expired
    state "停止・記録待ち: stopped_pending_record" as pending

    [*] --> idle
    idle --> running: 開始・正本の取得成功
    running --> running: 延長・既存期限へ加算
    running --> expired: 期限到達・autoStop OFF
    running --> pending: 期限到達・autoStop ON
    running --> pending: 手動停止・editing 予約とフォーム起動
    expired --> running: 延長・現在から期限を再設定
    expired --> pending: 手動停止・editing 予約とフォーム起動
    pending --> pending: 記録予約・フォーム操作
    pending --> running: 予約なしで再開・新しい計測区間
    pending --> idle: 予約なしで破棄
    pending --> idle: 記録成功後の cleanup・または結果不明を記録済みと確認
```

自動停止時は最後の区間を期限ちょうどで閉じる。手動停止は停止と `editing` 予約を一つのセッション変更で作る。自動停止は予約を作らず、利用者が記録を選んでからフォームを開く。停止中の空白時間は再開後の計測に含めない。

## 記録予約と障害回復

次の図は `recordingAttempt.phase` を表し、前節の `TimerSession.state` とは別である。予約中のセッションは引き続き `stopped_pending_record` に留まる。「予約なし」も phase の値ではない。

```mermaid
stateDiagram-v2
    state "予約なし・記録待ち" as noAttempt
    state "フォーム編集中: editing" as editing
    state "送信中: submitting" as submitting
    state "成功確認済み: confirmed" as confirmed
    state "結果不明: unknown" as unknown
    state "セッション削除済み" as removed

    [*] --> noAttempt
    noAttempt --> editing: 記録予約を保存・フォームを開く
    editing --> noAttempt: キャンセル・明示回復
    editing --> submitting: 送信状態の保存に成功
    submitting --> editing: フォームの検証エラー
    submitting --> confirmed: 成功判定と context 一致・confirmed を保存
    submitting --> unknown: 結果不明・明示回復
    unknown --> noAttempt: 利用者が未登録と確認
    unknown --> removed: 利用者が記録済みと確認
    confirmed --> confirmed: cleanup 失敗・再試行待ち
    confirmed --> removed: cleanup 成功
    removed --> [*]
```

図の遷移は、正本上の対象・予約が一致し、必要な保存に成功した場合の経路である。ストレージ障害で `confirmed` 自体を保存できたと確認できない場合まで、成功済み phase が確実に残るとは限らない。表示状態と正本を照合して回復し、フォームを自動再送しない。

**`confirmed` から行うのはローカル cleanup の再試行だけ**である。`editing`／`submitting`／`unknown` に戻したり、Time Entry POST を再送したりしない。予約がある間は通常の再開・延長・破棄・別の記録開始を抑止する。

## Redmine への記録順序

```mermaid
sequenceDiagram
    actor user as 利用者
    participant dialog as IssueIframeDialog
    participant store as TimerStore
    participant canonical as timerStorage と localStorage
    participant redmine as Redmine 標準フォームと DB

    user->>store: 停止または記録
    store->>canonical: 排他内で editing 予約を保存
    canonical-->>store: 保存結果と session・attempt ID
    store->>dialog: 時間の初期値と timerRecording context で開く
    dialog->>redmine: 時間記録フォーム GET
    redmine-->>dialog: 標準フォーム
    user->>dialog: 送信
    dialog->>store: beginTimerRecordingSubmission
    store->>canonical: context を照合・submitting を保存
    canonical-->>store: 保存結果
    store-->>dialog: 送信可否
    alt submitting の保存に成功
        dialog->>redmine: 標準フォーム POST
        redmine-->>dialog: 検証結果または遷移先
        alt 成功を判定でき context が一致
            dialog->>store: completeTimerRecording
            store->>canonical: confirmed を保存
            canonical-->>store: 保存結果
            alt 正本または保持 snapshot で confirmed を確認
                store->>canonical: 正本の confirmed と context を確認して cleanup
                canonical-->>store: 削除成功または確認済み状態を保持
            else confirmed を確認できない
                store-->>dialog: セッションを保持・cleanup しない
            end
        else フォームに検証エラー
            dialog->>store: editing へ戻す
            store->>canonical: 予約の状態を更新
        else 成否を判断できない
            dialog->>store: unknown への遷移を要求
            store->>canonical: 一致する submitting 予約を更新
        end
    else 保存失敗または予約の不一致
        dialog-->>user: 送信を止めて回復を促す
    end
```

成功判定は「送信中で、直前が時間記録フォーム」という前提に加えて、フォームの消失と成功表示を確認する。遷移先から Issue show の ID を取得できる場合は対象 ID と照合し、取得不能の場合は一致扱いにするのが現行実装である。これとは別に、記録 context の `origin`、session ID、Issue ID、attempt ID と、指定されている owner tab・scope を照合する。単なる iframe の読込完了や HTTP 成功だけでタイマーを削除しない。`confirmed` の確定と cleanup は別々のセッション変更であり、Redmine の保存とブラウザー保存をまたぐ一つのトランザクションではない。

## モデル・通知・失敗時の不変条件

| 領域 | 現行契約 |
| --- | --- |
| 共有モデル | `TimerSession` v4。session ID、revision、Issue、user ID、segments、deadlineAt、autoStop、state、createdAt、updatedAt を保持 |
| 記録予約 | 任意の `recordingAttempt`: id、ownerTabId、openedAt、phase。phase は `editing`／`submitting`／`confirmed`／`unknown` |
| 時刻 | epoch milliseconds の実時刻差を計測。Redmine の date-only 値と混ぜない |
| 読込 | 正本を読むだけでは保存・削除しない。不正データや読込障害をセッション不在として上書きしない |
| 変更失敗 | `locked`／`storage_error` のとき、既存の表示状態を維持する。操作の適用成功と見なさない |
| 起動・期限 | 起動時と期限評価時に正本を再確認。期限前の tick は読込と表示反映で済ませる |
| 通知請求 | 期限の状態変更と同じ mutation で `notifiedDeadlineAt`／`notifiedType` を記録し、適用成功した場合に通知を試みる |
| 通知の制限 | 許可済み Web Notification、失敗・未許可時は toast。請求の保存は通知の配送保証ではなく、通知直前の正本再読込も行わない |
| プラグイン間共有 | `redmine_kanban` と保存キー・schema v4 を共有。schema・phase・version の変更は両方で実装・検証する |

## 実装・テストへの入口

- 操作と期限: [TimerStore](../../spa/src/stores/TimerStore.ts)、[型](../../spa/src/types/timer.ts)、[timerDomain](../../spa/src/domain/timer/timerDomain.ts)。
- 正本と相互排他: [timerStorage](../../spa/src/services/timerStorage.ts)。独立した Timer Mutation Coordinator モジュールはなく、同ファイル内の関数が調停を担う。
- 表示とフォーム: [GlobalTimer](../../spa/src/components/timer/GlobalTimer.tsx)、[UIStore](../../spa/src/stores/UIStore.ts)、[IssueIframeDialog](../../spa/src/components/IssueIframeDialog.tsx)、[結果判定](../../spa/src/domain/timer/timerRecordingOutcome.ts)。
- 通知: [timerNotification](../../spa/src/services/timerNotification.ts)。
- 回帰確認: [domain](../../spa/src/domain/timer/timerDomain.test.ts)、[storage](../../spa/src/services/timerStorage.test.ts)、[store](../../spa/src/stores/TimerStore.test.ts)、[記録結果](../../spa/src/domain/timer/timerRecordingOutcome.test.ts)、[複数タブ E2E](../../spa/tests/e2e/gantt-work-timer-multitab.pw.ts)。これらの参照は、この図の更新時にアプリケーションの全テストを実行したことを意味しない。
