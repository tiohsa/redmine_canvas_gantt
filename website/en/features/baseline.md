# Baselines

A baseline is a schedule snapshot for comparison. It is not used for scheduling or critical-path calculations.

## Save a baseline

1. Open Canvas Gantt for the project.
2. In the toolbar, choose whether to save the current filtered view or the whole project.
3. Confirm the save. The new snapshot replaces the existing baseline for that project.

Each project stores one baseline. Even when the whole project was saved, comparison bars and difference popovers render only for issues currently visible in the chart.

![English UI showing baseline save controls.](/images/baseline-save-en.png)

English UI screenshot of saving a project baseline. [View full-size image](/images/baseline-save-en.png)

## Permissions and storage

- `view_canvas_gantt` is required to view baseline comparison.
- `manage_canvas_gantt_baseline` is required to save or replace a baseline.
- Snapshots are stored in Redmine's `Setting.plugin_redmine_canvas_gantt`. No database migration or separate table is added.
- Removing the plugin directory alone does not delete stored data. Run the uninstall cleanup task first to remove plugin settings and baselines.

![English UI comparing current task dates with a saved baseline.](/images/baseline-compare-en.png)

English UI screenshot of a saved baseline comparison. [View full-size image](/images/baseline-compare-en.png)

### Note

Saving a new baseline replaces the previous snapshot. Keep any required record according to your team's operating procedure before replacing it.
