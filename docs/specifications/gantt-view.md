<a id="ガント表示仕様"></a>

# Gantt Display and Interaction

Reference: development HEAD `d1d910fd0a0ea6f02d34d78fa68f1e3abe61cb22` (2026-11-13, code 0.20.0). This document records behavior at that development reference; the specification index identifies the public manual's current target version.

<a id="表示モデル"></a>

## Display model

The left list and right Canvas chart share row layout and vertical scroll position. Headers, background, baselines, tasks, and overlays render separately. Tasks carry start/due dates, progress, parent ID, project, assignee, display order, and other fields. Layout derives row number, indentation, and whether displayed children exist. Displayed children differ from `hasPhysicalChildren`, which represents actual Redmine children. Do not infer physical hierarchy or parent-date editability solely from the loaded graph.

Current filters are applied to loaded `allTasks`; grouping, sorting, expansion, and version settings produce `tasks`, `layoutRows`, and `rowCount`. `layoutRows` also represents group/version headers rather than issues. Client display selection and Redmine retrieval/visibility contracts are separate.

<a id="階層グループ順序"></a>

## Hierarchy, grouping, and order

- Group by project, assignee, or neither. Project and assignee grouping are mutually exclusive. Unassigned issues use a dedicated group.
- A child appears under its parent if the parent is displayed and grouping is disabled or both share a group. If the parent is excluded or in another group, the child becomes a display root. This does not rewrite the Redmine hierarchy.
- Enabling version display can add version rows. Projects/assignees, versions, and tasks have expansion state; collapsing hides descendants. Expand-all and collapse-all actions are also available.
- Sorting uses the configured key and direction, comparing numeric, boolean, and date custom fields by type. Without a setting, display order is used. Organizing by dependencies is also available.
- Server-derived parent dates may depend on children. Reconstructing display hierarchy must not generate parent-date mutations on the client.

<a id="ズームと操作"></a>

## Zoom and navigation

Toolbar month/week/day views correspond to zoom levels 0/1/2. Switching applies that level's custom or default scale and adjusts the display center. Ctrl / Meta plus the chart mouse wheel changes scale continuously; the ordinary wheel scrolls.

Right-clicking a list row opens its issue context menu. In chart keyboard handling, up/down arrows move selection among displayed tasks; down selects the first task if none is selected. Left/right arrows scroll horizontally. Escape cancels dragging and clears selection. Input and scroll locks impose additional constraints.

<a id="選択と移動"></a>

## Selection and focus

An ordinary list-row click selects one task. Ctrl / Meta adds or removes selection; Shift selects the visible-task range from anchor to target. If the anchor or target is absent from current visible tasks, only the target is selected. Selection changes clear the selected relation, unfinished `draftRelation`, and context menu. Manually pending relation operations in `pendingRelationChanges` are separate and survive selection changes. Multiple selection and the primary selected ID are distinct.

Focusing an issue returns `missing` if it does not exist and `filtered_out` if it fails current filters. The operation expands its parents, group, and version; after relayout, it updates selection and viewport. Horizontal positioning uses start date, then due date, then today. It does not silently clear filters to display the issue.

Expansion, collapse, and scrolling change display state; they do not save issues. Date-only values use UTC midnight as an internal calendar-date representation and explicitly convert at local display boundaries.

<a id="アクセシビリティ"></a>

## Accessibility

A visually hidden task list accompanies the Canvas. Accessible labels include subject, start/end dates, and progress. Each row records total count and position. Rendering virtualizes rows around focus and selected boundary rows such as the first/last; when a row disappears, focus recovery attempts a nearby remaining row. Tab / Shift+Tab navigates visible tasks; Enter shows an alert with issue details. Expansion buttons have expand/collapse labels.

The presence of these implementations does not guarantee accessibility conformance for all assistive technologies or interactions.

<a id="実装と確認先"></a>

## Implementation and verification references

- [Layout construction](../../spa/src/stores/taskStore/layout.ts), [expansion state](../../spa/src/stores/taskStore/expansion.ts), [hierarchy helpers](../../spa/src/stores/taskStore/hierarchy.ts), [TaskStore](../../spa/src/stores/TaskStore.ts), [types](../../spa/src/types/index.ts)
- [Gantt container](../../spa/src/components/GanttContainer.tsx), [sidebar](../../spa/src/components/UiSidebar.tsx), [coordinates and viewport](../../spa/src/engines/LayoutEngine.ts), [accessibility layer](../../spa/src/components/A11yLayer.tsx)
- [Accessibility tests](../../spa/src/components/A11yLayer.test.tsx), [sidebar tests](../../spa/src/components/UiSidebar.test.tsx), [layout engine tests](../../spa/src/engines/LayoutEngine.test.ts), [TaskStore tests](../../spa/src/stores/TaskStore.test.ts)
- References identify implementation and tests; they do not mean those tests were run during this update.
