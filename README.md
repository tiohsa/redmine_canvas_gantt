# Redmine Canvas Gantt Plugin

A high-performance Gantt chart plugin for Redmine, built with React, TypeScript, and the HTML5 Canvas API.

## Features

*   **High Performance**: Efficiently renders large datasets using HTML5 Canvas.
*   **Smooth Interaction**: Drag & drop tasks for rescheduling, dependency creation.
*   **Customizable Columns**: Choose from standard Redmine fields (Project, Tracker, Status, Priority, Author, Category, etc.) to display in the side panel.
*   **Smart Sorting**: Sort tasks by clicking column headers. Supports alphabetical, numeric, and logical (Redmine position-based) sorting.
*   **Project & Version Management**: Consolidated filter and display toggles for projects and versions. Ensures all selected projects are visible, even if they have no tasks matching active filters.
*   **Smart Project Grouping**: Correctly handles cross-project parent-child relationships, ensuring tasks always appear under their respective project headers when grouping is active.
*   **Inline Editing**: Edit subject, status, priority, dates, category, project, tracker, version, and estimated hours directly in the sidebar. Features permission-aware safeguards and contextual dropdowns.
*   **Clutter-Free Sidebar**: Simplified task display by removing redundant project/version text next to subjects, relying on the hierarchical grouping for context.
*   **Enhanced Data Visibility**: Color-coded badges for status and priority. Automatic placeholders (`-`) and click-targets for unset fields to improve readability and editability.
*   **Manhattan-style Dependencies**: Visualizes dependencies with smart Manhattan-style (orthogonal) paths.
*   **Zoom Levels**: Supports Month, Week, and Day views.
*   **Customizable UI**: Adjustable task row height (20px to 52px) and persistent column widths. Customizable column display and grouping.
*   **Theme Support**: Integrates with Redmine's theming.

![alt text](./images/gantt.png)

## Requirements

*   **Redmine**: 6.x
*   **Ruby**: 3.x
*   **Node.js**: 18+ (required for building the frontend)
*   **pnpm**: (required for frontend package management)

## Installation

1.  **Clone the Repository**
    Navigate to your Redmine `plugins` directory and clone the repository:
    ```bash
    cd /path/to/redmine/plugins
    git clone https://github.com/your-repo/redmine_canvas_gantt.git
    ```

2.  **Build the Frontend**
    The frontend is a React SPA that needs to be built before use.
    ```bash
    cd redmine_canvas_gantt/spa
    pnpm install
    pnpm run build
    ```

3.  **Run Migrations**
    Run the Redmine plugin migration command.
    ```bash
    cd /path/to/redmine
    bundle exec rake redmine:plugins:migrate
    ```

4.  **Restart Redmine**
    Restart your Redmine application server (e.g., Puma, Passenger).

## Usage

1.  **Enable the Module**
    *   Go to your Project's **Settings** > **Modules**.
    *   Check **Canvas Gantt** and save.

2.  **Configure Permissions**
    *   Go to **Administration** > **Roles and permissions**.
    *   Grant **View canvas gantt** and **Edit canvas gantt** permissions to the appropriate roles.

3.  **Access the Chart**
    *   Click the **Canvas Gantt** tab in the project menu.
    *   Use the mouse wheel (with Ctrl/Cmd) or toolbar buttons to zoom.
    *   Drag tasks to move them. Drag the ends of tasks to resize.
    *   Drag from the dot at the end of a task to another task to create a dependency.

## Development

The frontend code is located in `plugins/redmine_canvas_gantt/spa`.

### Setup

```bash
cd plugins/redmine_canvas_gantt/spa
pnpm install
```

### Development Server

You can run the standalone frontend development server:

```bash
pnpm run dev
```

**Note**: To run in standalone mode, you may need to mock the `window.RedmineCanvasGantt` configuration object in `main.tsx` or `index.html` to provide necessary API endpoints and tokens.

### Architecture Overview

*   **State Management**: Zustand (`TaskStore`, `UIStore`).
*   **Rendering**: Custom Canvas renderers (`TaskRenderer`, `OverlayRenderer`, `BackgroundRenderer`).
*   **Logic**: `TaskLogicService` handles constraints and date propagation.

## License

MIT License

Copyright (c) 2024 tiohsa

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
