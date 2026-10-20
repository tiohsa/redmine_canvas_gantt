# Baselines

A baseline is a schedule snapshot for comparison. It is not used for scheduling or critical-path calculations.

## Save a baseline

<a id="note"></a>

1. Open Canvas Gantt for the project.
2. Open **Save Baseline** in the toolbar and choose **Save filtered view as baseline** or **Save whole project as baseline**.
3. Review and confirm. Saving replaces the existing baseline, so keep any required record before saving.

Each project stores one baseline. Even when you save the whole project, comparison appears only for issues currently visible in the chart.

![Baseline save controls.](/images/baseline-save-en.png)

Baseline save controls. [View full-size image](/images/baseline-save-en.png)

## Compare with the current schedule

Open the toolbar's **Save Baseline** menu and select **Show baseline comparison** to overlay saved dates on each issue's current task bar. Hover over or select an issue to open a comparison popover with the current and baseline start date, due date, and duration. Differences are shown in calendar days. A positive start-date or due-date difference means the date is later than the saved date; a positive duration difference means the duration is longer.

![Current task dates compared with a saved baseline.](/images/baseline-compare-en.png)

Saved baseline comparison. [View full-size image](/images/baseline-compare-en.png)

## Delete a saved baseline (development feature)

Baseline deletion is under development and is not included in release v0.18.0. In the development version, the delete control removes the single snapshot saved for the current project, including a snapshot saved from a filtered view; it does not delete only the currently visible issues. Before deletion, a confirmation dialog shows the snapshot's save time, saver, and scope and warns that the action cannot be undone. Deletion does not change issues or their current dates.

In the development version, the delete control is available to users who can manage project baselines. If another user replaces the snapshot before deletion, the dialog refreshes the current baseline and does not retry the old snapshot ID. When the server's result is uncertain, Canvas Gantt refreshes the baseline state and does not automatically send the deletion again.

The confirmation dialog uses the same rounded button design as the issue dialog for Cancel and Delete.

In the development version, a deletion request times out after 15 seconds, followed by up to 10 seconds of checking the server state. A timeout does not prove that deletion failed. If the result still cannot be confirmed, an error notification appears and the confirmation dialog closes so you can continue using the chart. The displayed snapshot is retained until a current server response confirms its state; the deletion request is not automatically retried.

## Permissions and storage

- `view_canvas_gantt` is required to view baseline comparison.
- `manage_canvas_gantt_baseline` is required to save or replace a baseline.
- See [Administration settings](/en/administration/settings) for baseline storage and settings management.
- See [Installation and removal](/en/guide/installation) for data removal during uninstall.
