# Redmine Canvas Gantt SPA

This directory contains the Single Page Application (SPA) frontend for the **Redmine Canvas Gantt** plugin. It is built using React, TypeScript, and Vite, designed to provide an interactive and modern Gantt chart experience within Redmine.

## Project Overview

*   **Type:** Frontend Application (SPA)
*   **Framework:** React 19
*   **Language:** TypeScript
*   **Build Tool:** Vite 7
*   **State Management:** Zustand 5
*   **Testing:** Vitest
*   **Styling:** CSS Modules / Standard CSS (`src/App.css`, `src/index.css`)

The application renders a Gantt chart that allows users to visualize tasks, dependencies (relations), and versions. It communicates with the Redmine backend via a REST API to fetch data and persist changes (e.g., rescheduling tasks, creating dependencies).

## Key Directories and Files

*   **`src/`**: Source code root.
    *   **`main.tsx`**: Application entry point.
    *   **`App.tsx`**: Main application component, handles layout and global event listeners.
    *   **`api/`**: Contains `client.ts` for handling API requests to Redmine (fetch tasks, update tasks, etc.).
    *   **`components/`**: React components.
        *   `GanttContainer.tsx`: The main container for the Gantt chart visualization.
        *   `GanttToolbar.tsx`: Toolbar for filtering, zooming, and view controls.
        *   `TaskDetailPanel.tsx`: Side panel for editing task details.
    *   **`stores/`**: State management using Zustand.
        *   `TaskStore.ts`: Manages the core data (tasks, relations, versions) and view state (zoom, viewport).
        *   `UIStore.ts`: Manages UI-specific state (sidebar visibility, columns).
    *   **`types/`**: TypeScript type definitions for Redmine entities (Task, Project, Relation, etc.).
    *   **`engines/`**: Logic for layout and interaction (e.g., drag-and-drop handling).
    *   **`renderers/`**: Components responsible for rendering specific parts of the Gantt chart (canvas drawing).
*   **`vite.config.ts`**: Vite configuration file.
*   **`package.json`**: Project dependencies and scripts.
*   **`eslint.config.js`**: ESLint configuration.

## Setup and Development

This project uses `pnpm` for package management (inferred from `pnpm-lock.yaml`), but `npm` scripts are standard.

### Prerequisites

*   Node.js (Latest LTS recommended)
*   pnpm (recommended) or npm

### Common Commands

*   **Install Dependencies:**
    ```bash
    pnpm install
    # or
    npm install
    ```

*   **Start Development Server:**
    ```bash
    npm run dev
    ```
    Starts the Vite development server with Hot Module Replacement (HMR).

*   **Build for Production:**
    ```bash
    npm run build
    ```
    Compiles the application into the `dist` directory (or configured output), ready to be served by the Redmine plugin.

*   **Run Tests:**
    ```bash
    npm run test
    ```
    Executes unit tests using Vitest.

*   **Lint Code:**
    ```bash
    npm run lint
    ```
    Runs ESLint to check for code quality and style issues.

## Architecture & Conventions

*   **State Management:** The app uses **Zustand** for global state. Stores are split by domain (`TaskStore` for data, `UIStore` for interface). Avoid prop drilling deep hierarchies.
*   **API Integration:** All backend interactions are centralized in `src/api/client.ts`. The app expects a global `window.RedmineCanvasGantt` object to be present, providing configuration like API base URL, auth tokens, and project ID.
*   **Rendering:** The Gantt chart likely uses a combination of DOM elements and Canvas (or SVG) for performance. Heavy rendering logic is separated into "Renderers".
*   **Styling:** Standard CSS is used. Class names should ideally follow a consistent naming convention.
*   **Type Safety:** TypeScript is enforced. Types for API responses and internal models should be defined in `src/types`.

## Integration with Redmine

The SPA is intended to be embedded within a Redmine page. The Redmine plugin (server-side) is responsible for:
1.  Serving the compiled assets (JS/CSS).
2.  Injecting the necessary configuration (`window.RedmineCanvasGantt`) into the HTML.
3.  Providing the API endpoints consumed by `src/api/client.ts`.
