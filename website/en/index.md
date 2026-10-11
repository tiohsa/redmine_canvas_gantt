# Redmine Canvas Gantt Manual

This manual targets stable v0.18.0, verified on 2026-10-11, and is grounded in the repository documentation and implementation. [v0.18.0 Release](https://github.com/tiohsa/redmine_canvas_gantt/releases/tag/v0.18.0)

## Find a task

- New to the plugin: [Introduction](/en/guide/introduction), [Installation and setup](/en/guide/installation)
- Use the chart: [Basic operations](/en/guide/basic-operations)
- Manage issue relationships: [Hierarchy](/en/features/hierarchy), [Dependencies](/en/features/dependencies)
- Narrow or share a view: [Filters and saved queries](/en/features/filters), [URL and query parameters](/en/features/query-parameters)
- Review schedule and effort: [Baselines](/en/features/baseline), [Workload](/en/features/workload), [Work Timer](/en/features/work-timer)
- Adjust or export a view: [Display settings and export](/en/features/display-export)

## About Canvas Gantt

Canvas Gantt draws Redmine issues on an HTML Canvas timeline and keeps an editable issue list alongside it. It supports schedule changes by dragging, dependencies, inline edits, and integration with saved queries. Redmine permissions govern issue access and updates.

![English UI day view of Canvas Gantt 0.18.0 on Redmine 7.0.0.stable, showing fictional issues and dependencies.](/images/canvas-gantt-overview-en.png)

This real application screenshot was captured on 2026-10-11 with Redmine 7.0.0.stable and Canvas Gantt 0.18.0. It uses fictional issue data and the English UI. [View full-size image](/images/canvas-gantt-overview-en.png)

## Requirements

Supported Redmine versions are the 6.0, 6.1, and 7.0 series. Enable the REST API. Supported browsers are current desktop versions of Chrome, Edge, Firefox, and Safari with Canvas, ES modules, and `localStorage`. Internet Explorer, mobile browsers, and embedded webviews are outside the supported test matrix. See [Introduction](/en/guide/introduction) and [Installation](/en/guide/installation).

## Manual version

This manual covers stable v0.18.0, verified on 2026-10-11. Historical UI captures are labeled as such and do not document current controls.
