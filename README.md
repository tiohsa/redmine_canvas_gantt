# Redmine Canvas Gantt Plugin

A high-performance Gantt chart plugin for Redmine, built with React, TypeScript, and the HTML5 Canvas API.

## Features

*   **High Performance**: Efficiently renders large datasets using HTML5 Canvas.
*   **Smooth Interaction**: Drag & drop tasks for rescheduling, dependency creation.
*   **Project Grouping**: Automatically groups tasks by project.
*   **Inline Editing**: Edit subject, status, dates, and progress directly on the chart.
*   **Smart Dependencies**: Visualizes dependencies with Manhattan-style (orthogonal) paths.
*   **Zoom Levels**: Supports Month, Week, and Day views.
*   **Theme Support**: Integrates with Redmine's theming.

## Requirements

*   **Redmine**: 5.x
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

Copyright (c) 2024 Antigravity

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
