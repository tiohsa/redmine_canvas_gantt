# Introduction

## What is Redmine Canvas Gantt?

Redmine Canvas Gantt is a plugin that draws Redmine issues on an HTML5 Canvas Gantt chart. This page targets stable v0.18.0, verified on 2026-10-11 ([release](https://github.com/tiohsa/redmine_canvas_gantt/releases/tag/v0.18.0)). The sidebar lists issue fields, while the timeline shows task bars and dependencies. It brings schedule editing and timeline navigation into one view.

![English-language day view of Canvas Gantt 0.18.0 on Redmine 7.0.0.stable, showing fictional issues and dependencies.](/images/canvas-gantt-overview-en.png)

This real application screenshot was captured on 2026-10-11 with Redmine 7.0.0.stable and Canvas Gantt 0.18.0. It uses fictional issue data and the English UI. [View full-size image](/images/canvas-gantt-overview-en.png)

## Main features

- Drag task bars to move or resize schedules; create dependencies from task endpoints
- Inline edits for assignee, status, progress, due date, custom fields, and other editable columns
- Change parent-child relationships in the sidebar and create multiple child issues at once
- Work with Redmine saved queries and supported issue-list filters
- Group by project or assignee; compare baselines; review workload
- Measure work with a timer; export PNG / CSV; save display preferences

## Relationship to Redmine Gantt

Canvas Gantt draws the timeline on Canvas, while Redmine remains responsible for issue storage and permissions. The plugin adds no issue table or database migration. Users need `view_canvas_gantt` to open Canvas Gantt. Redmine's standard permissions on the target issue's project control issue edits and other actions.

## Supported environment

The plugin supports Redmine 6.0, 6.1, and 7.0. CI references Redmine 6.0.6, 6.1.2, and 7.0.0; that does not establish support for every patch release in those series. Use a Ruby version supported by the selected Redmine version.

Node.js is not required for normal operation. Node.js 20 or newer is required to build the SPA from source or use frontend development tools. Enable Redmine's REST API.

Supported browsers are current desktop versions of Chrome, Edge, Firefox, and Safari with Canvas, ES modules, and `localStorage`. Internet Explorer is unsupported. Mobile browsers and embedded webviews are not part of the test matrix.

## Screen areas

The sidebar on the left lists issues and selected columns. The timeline on the right shows task bars and dependencies. Use the toolbar to adjust the visible range and zoom. See [Basic operations](/en/guide/basic-operations) for details.

## Next steps

- [Installation and setup](/en/guide/installation)
- [Basic operations](/en/guide/basic-operations)
- [Permissions](/en/administration/permissions), [Settings](/en/administration/settings), and [Business calendars](/en/administration/calendars)
