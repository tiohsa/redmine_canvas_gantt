<a id="クエリとプロジェクト範囲の現行仕様"></a>

# Queries and Project Scope

Reference: development HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22` (code 0.20.0, 2026-11-13). The public manual covers tag v0.20.0 (`0c2b68a`); distinguish it from this developer record's reviewed commit.

<a id="境界と状態"></a>

## Boundaries and state

- The normal scope is the view's root project and its descendants, subject to Redmine visibility.
- Project candidates must be visible and active. Normal mode offers projects in the tree; membership mode offers projects the user belongs to, including ordinary group membership. Administrators can choose all visible, active projects.
- Read scope expands outside the tree only to explicitly selected, permitted projects in membership mode. A project appearing in the candidate list does not itself expand scope.
- The presence of `canvas_project_ids` or its compatibility alias `project_ids` determines explicit selection. Without either, `show_subprojects` selects the tree or root. An explicitly empty selection means empty scope, not all projects.
- IDs accept positive integers, separators `,` / `|`, empty values, and `none` / `_none`; other tokens return 422. Requested IDs are intersected with the permitted scope.
- The server returns `project_scope` containing `root_project_id`, `candidate_mode`, `selection_explicit`, `selected_project_ids`, `effective_project_ids`, and `scheduling_allowed`. Without explicit selection, empty selected IDs do not necessarily mean empty effective IDs.

<a id="フィルターと保存クエリ"></a>

## Filters and saved queries

- `GET /projects/:project_id/canvas_gantt/data.json` returns data and resolved initial state; `queries.json` supplies selectable saved queries.
- Query state consists of a base `query_id` and explicit overrides. Selecting a saved query clears previous overrides; filter changes remain differences from the base. Clearing the saved query transfers effective overrides to independent state.
- Status, assignee, version, and tracker overrides can represent inheritance, all values, or a subset. An unassigned issue is represented by `null`; an unset version by `_none`.
- The server applies a visible Redmine `IssueQuery`, overrides it with explicit request values, then reapplies project boundaries. An invisible or missing query, or resolution failure, produces warnings and continues without the saved query.
- An empty `=` condition in a saved query means no matches unless the same field is overridden. This differs from explicitly selecting all values.
- Actual selection must satisfy both Redmine issue visibility and resolved project scope. Operation scope is not identical to display filters.

<a id="画面操作と-redmine-クエリ編集"></a>

### Controls and Redmine query editing

- The toolbar provides project, tracker, version, assignee, and status selectors. Projects support candidate search, bulk selection of visible candidates, membership mode, and grouping. Hidden selections outside the candidate list produce a warning. Statuses provide open/closed selection actions. Versions include unset values and header display; assignees include unassigned values and grouping by assignee.
- Search text is a view quick filter, distinct from saved-query conditions. Project/assignee grouping, subproject display, columns, and sorting also affect shared view state.
- The saved-query menu shows loading, failure, and empty states and marks a selected query as modified when overrides exist. “クリア” (Clear in the Japanese UI) removes the selection; it does not delete the Redmine saved query.
- Saving a custom query converts current state to Redmine issue-list parameters, removes the existing `query_id`, and opens an iframe. A separate Redmine query-edit action navigates to a path containing the current ID. Query editing/deletion and permissions remain Redmine responsibilities; there is no Canvas-specific query deletion API.
- In the iframe, `#query_form` is the search form and `#query-form` the save form. A footer save button appears only after reaching the latter. Saving submits the native form; validation errors allow resubmission. A successful navigation or closing the dialog triggers a saved-query list refresh.

<a id="並び順と列の対応"></a>

### Sort and column mapping

The default sort is ascending start date. The URL codec maps Redmine names `id`, `subject`, `project`, `tracker`, `status`, `priority`, `assigned_to`, `author`, `start_date`, `due_date`, `estimated_hours`, `done_ratio`, `fixed_version`, `category`, `created_on`, `updated_on`, and `spent_hours` to Canvas fields. Any direction other than `desc` is ascending; the first input sort is interpreted.

Column conversion covers the corresponding Redmine columns above and `cf_<id>` custom fields. Canvas uses `cf:<id>` internally. Timer and notification columns have no Redmine column names and cannot be exported as Redmine query columns. The column catalog and sort mapping are separate; consult each implementation.

<a id="url-と保存設定"></a>

## URLs and stored preferences

For initial shared query state, the presence of a supported URL parameter makes the entire URL state take precedence; otherwise normalized stored state is used, then defaults. Do not merge URL and stored state field by field.

- `query_id`, filters, `group_by`, `sort`, `show_subprojects`, `c[]`, or Redmine's `set_filter=1` with `f[]` determine whether shared state exists.
- When Redmine-format and Canvas-specific values coexist, Redmine format wins for the corresponding fields. Array keys and singular compatibility keys are also read.
- Explicitly empty project scope is emitted as `canvas_project_ids[]=none`, distinct from omission. Assignee/version `none` means an unset value; do not confuse these meanings.
- Browser URL updates replace only controlled parameters and preserve other query parameters and the hash. Membership mode is excluded from this URL update.
- Preferences are stored in `localStorage` under `canvasGantt:preferences`, with general and display preferences per project. Corrupt JSON becomes empty preferences; legacy formats migrate during normalization.
- Treat server resolution as the confirmed scope, not merely the client's requested scope. Async loading checks generation and view context and rejects stale responses.

<a id="実装と回帰確認箇所"></a>

## Implementation and regression references

- [Scope policy](../../lib/redmine_canvas_gantt/project_scope_policy.rb), [query resolution](../../lib/redmine_canvas_gantt/query_state_resolver.rb), [issue selection](../../lib/redmine_canvas_gantt/issue_selector.rb)
- [URL and initial precedence](../../spa/src/utils/queryParams.ts), [URL codec](../../spa/src/query/canvasQueryUrlCodec.ts), [query state](../../spa/src/query/queryState.ts), [preferences](../../spa/src/utils/preferences.ts)
- [Toolbar](../../spa/src/components/GanttToolbar.tsx), [Redmine conversion](../../spa/src/query/redmineQueryUrlCodec.ts), [column catalog](../../spa/src/components/sidebar/sidebarColumnCatalog.ts), [sort codec](../../spa/src/query/querySortCodec.ts), [form dialog](../../spa/src/components/IssueIframeDialog.tsx)
- [Server specification tests](../../spec/lib/redmine_canvas_gantt/query_state_resolver_spec.rb), [URL tests](../../spa/src/utils/queryParams.test.ts), [query codec tests](../../spa/src/query/queryStateCodec.test.ts)

This document is a static record based on implementation and test code. It does not mean those tests were run during this documentation update.
