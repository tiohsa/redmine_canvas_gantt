# Baselines

A baseline is a schedule snapshot for comparison. It is not used for scheduling or critical-path calculations.

## Save a baseline

<a id="note"></a>

1. Open Canvas Gantt for the project.
2. Open **Save Baseline** in the toolbar and choose **Save filtered view as baseline** or **Save whole project as baseline**.
3. Review and confirm. Saving replaces the existing baseline, so keep any required record before saving.

Each project stores one baseline. Even when you save the whole project, comparison appears only for issues currently visible in the chart.

![English UI showing baseline save controls.](/images/baseline-save-en.png)

Baseline save controls (English UI). [View full-size image](/images/baseline-save-en.png)

## Compare with the current schedule

Open the toolbar's **Save Baseline** menu and select **Show baseline comparison** to overlay saved dates on each issue's current task bar. Hover over or select an issue to open a comparison popover with the current and baseline start date, due date, and duration. Differences are shown in calendar days. A positive start-date or due-date difference means the date is later than the saved date; a positive duration difference means the duration is longer.

![English UI comparing current task dates with a saved baseline.](/images/baseline-compare-en.png)

Saved baseline comparison (English UI). [View full-size image](/images/baseline-compare-en.png)

## Permissions and storage

- `view_canvas_gantt` is required to view baseline comparison.
- `manage_canvas_gantt_baseline` is required to save or replace a baseline.
- See [Administration settings](/en/administration/settings) for baseline storage and settings management.
- See [Installation and removal](/en/guide/installation) for data removal during uninstall.
