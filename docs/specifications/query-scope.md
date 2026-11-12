# クエリとプロジェクト範囲の現行仕様

対象: 開発 HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22`（コード 0.20.0、2026-11-13）。公開マニュアルの対象 v0.19.0 とは異なる開発者向け記録である。

## 境界と状態

- 画面のルートプロジェクトとその子孫が通常の範囲である。Redmine の可視性も適用する。
- プロジェクト候補は可視かつ有効なプロジェクトに限定される。通常モードはツリー内、メンバーモードは所属するプロジェクトを候補とする。所属には通常のグループ所属を含み、管理者は可視かつ有効な全プロジェクトが候補となる。
- ツリー外への読み取り範囲の拡張は、メンバーモードで明示選択された許可対象に限る。候補一覧の存在自体は範囲拡張を意味しない。
- `canvas_project_ids` または互換の `project_ids` の指定有無が明示選択を決める。未指定時は `show_subprojects` に従い、ツリーまたはルートを使う。明示された空選択は全件ではなく空範囲である。
- ID は正の整数、区切り `,` / `|`、空値、`none` / `_none` を受け付け、その他のトークンは 422 となる。要求 ID は許可範囲との積集合に制限される。
- サーバーは `project_scope` に `root_project_id`、`candidate_mode`、`selection_explicit`、`selected_project_ids`、`effective_project_ids`、`scheduling_allowed` を返す。未明示の場合、選択 ID は空でも実効 ID は空とは限らない。

## フィルターと保存クエリ

- `GET /projects/:project_id/canvas_gantt/data.json` がデータと解決済み初期状態を返し、`queries.json` が選択可能な保存クエリを供給する。
- クエリ状態はベースの `query_id` と明示上書きからなる。保存クエリ選択時には旧上書きを消し、フィルターの変更はそのベースからの差分として保持する。保存クエリの解除は実効上書きを独立した状態へ移す。
- 状態、担当者、バージョン、トラッカーの上書きは継承、全件、部分集合を表せる。担当者未設定は `null`、バージョン未設定は `_none` で表現する。
- サーバーは可視な Redmine `IssueQuery` の条件を適用し、リクエストの明示値で上書きした後、プロジェクト境界を再適用する。不可視・存在しないクエリや解決失敗は警告を返して保存クエリなしで続行する。
- 保存クエリの `=` 条件が空で、同じフィールドの上書きもない場合は該当なしとして扱う。明示的な全件への変更とは異なる。
- 実際の選択は Redmine の issue 可視性と解決したプロジェクト範囲の両方を通る。操作時の範囲は表示フィルターそのものではない。

### 画面操作と Redmine クエリ編集

- ツールバーにはプロジェクト、トラッカー、バージョン、担当者、ステータスの選択がある。プロジェクトは候補検索、可視候補の一括選択、メンバーモード、グループ化を提供する。候補外に隠れている選択は警告する。ステータスには完了・未完了の選択操作がある。バージョンには未設定とヘッダー表示、担当者には未割り当てと担当者別グループ化がある。
- 検索テキストは画面のクイックフィルターであり、保存クエリの条件と区別する。プロジェクト別と担当者別のグループ化、子プロジェクト表示、列、並び順は共有表示状態にも関わる。
- 保存クエリメニューは読み込み中・失敗・空を表示し、選択中クエリに上書きがあると変更済みを示す。「クリア」は選択を解除する操作で、Redmine の保存クエリそのものの削除ではない。
- カスタムクエリ保存は現在の状態を Redmine issue 一覧のパラメーターへ変換し、既存 `query_id` を除いて iframe で開く。Redmine クエリ編集への別操作は現在の ID を含むパスへ遷移する。Redmine 側のクエリ編集・削除操作と権限は Redmine に委ね、Canvas 専用のクエリ削除 API はない。
- iframe の `#query_form` は検索フォーム、`#query-form` は保存フォームとして区別し、後者に到達した場合だけフッターに保存ボタンを出す。保存はネイティブフォームを送信し、検証エラーなら再送できる。成功遷移後またはダイアログを閉じたときに保存クエリ一覧の再読込を促す。

### 並び順と列の対応

並び順の既定は開始日昇順。URL codec は Redmine 名 `id`, `subject`, `project`, `tracker`, `status`, `priority`, `assigned_to`, `author`, `start_date`, `due_date`, `estimated_hours`, `done_ratio`, `fixed_version`, `category`, `created_on`, `updated_on`, `spent_hours` を対応する Canvas フィールドに変換する。方向は `desc` 以外を昇順とし、入力の最初の並び順を解釈する。

列の変換対象は上記の Redmine 対応列と `cf_<id>` カスタムフィールドである。Canvas 内部では `cf:<id>` を使う。タイマーと通知列には Redmine 列名がなく、Redmine クエリの列としては出力できない。列カタログと並び順の対応表は別々なので、それぞれの実装を参照する。

## URL と保存設定

初期の共有クエリ状態は、対応する URL パラメーターが存在すれば URL 全体を優先し、なければ正規化した保存状態、最後にデフォルトを使う。URL と保存状態をフィールドごとに混合しない。

- `query_id`、フィルター、`group_by`、`sort`、`show_subprojects`、`c[]` または Redmine の `set_filter=1` と `f[]` が共有状態の存在判定に使われる。
- Redmine 形式の値と Canvas 固有形式が同時にあれば、対応フィールドは Redmine 形式を優先する。配列キーや単数形の互換キーも読み取る。
- 明示空プロジェクトは `canvas_project_ids[]=none` として出力し、未指定と区別する。担当者やバージョンの `none` は未設定値を意味するので混同しない。
- ブラウザー URL の更新は制御対象パラメーターだけを置き換え、他のクエリとハッシュを維持する。メンバーモードはこの URL 更新には含めない。
- 設定は `localStorage` の `canvasGantt:preferences` に保存され、プロジェクト単位の一般設定と表示設定を持つ。破損 JSON は空設定として扱い、旧形式は正規化時に移行する。
- サーバーの解決結果はクライアントの希望ではなく確定範囲として扱う。非同期読み込みでは世代と表示コンテキストを照合して古い応答を採用しない。

## 実装と回帰確認箇所

- [範囲ポリシー](../../lib/redmine_canvas_gantt/project_scope_policy.rb)、[クエリ解決](../../lib/redmine_canvas_gantt/query_state_resolver.rb)、[issue 選択](../../lib/redmine_canvas_gantt/issue_selector.rb)
- [URL と初期優先順位](../../spa/src/utils/queryParams.ts)、[URL codec](../../spa/src/query/canvasQueryUrlCodec.ts)、[クエリ状態](../../spa/src/query/queryState.ts)、[設定](../../spa/src/utils/preferences.ts)
- [ツールバー](../../spa/src/components/GanttToolbar.tsx)、[Redmine 形式への変換](../../spa/src/query/redmineQueryUrlCodec.ts)、[列カタログ](../../spa/src/components/sidebar/sidebarColumnCatalog.ts)、[並び順 codec](../../spa/src/query/querySortCodec.ts)、[フォームダイアログ](../../spa/src/components/IssueIframeDialog.tsx)
- [サーバー仕様テスト](../../spec/lib/redmine_canvas_gantt/query_state_resolver_spec.rb)、[URL テスト](../../spa/src/utils/queryParams.test.ts)、[クエリ codec テスト](../../spa/src/query/queryStateCodec.test.ts)

この文書は実装とテストコードを根拠とする静的記録であり、今回テストを実行したことを意味しない。
