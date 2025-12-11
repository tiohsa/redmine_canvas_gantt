# Gantt Chart Plugin Improvement Design (Jira-like WBS)

## 1. Objective
Improve the existing Redmine Canvas Gantt plugin to resemble Jira's WBS (Work Breakdown Structure) Gantt Chart. The goal is a modern, responsive, and high-performance user interface.

## 2. Visual & Functional Requirements
The design aims for a clean "Professional / Enterprise" look (similar to Jira/BigPicture).

### 2.1. Layout
- **Split Pane**: Resizable divider separating the WBS Table (left) and Gantt Chart (right).
- **Toolbar**: Controls for Zoom (Day, Week, Month, Quarter), Today button, Filter toggles.

### 2.2. WBS Table (Left Pane)
- **Hierarchical Grid**: Tree view reflecting the task parent-child relationships.
- **Columns**:
  - **Key**: Issue ID (clickable link to Redmine issue).
  - **Subject**: Indented task name with Expand/Collapse toggle for parents.
  - **Status**: Colored status badge.
  - **Assignee**: Avatar/Name.
  - **Start Date**: formatted date.
  - **Due Date**: formatted date.
  - **Progress**: Progress bar or percentage.
- **Interactions**:
  - Click to select task.
  - Toggle collapse/expand.

### 2.3. Gantt Chart (Right Pane)
- **Timeline Header**: Dual level (e.g., Year/Month, Month/Week, Week/Day).
- **Canvas Rendering**: High-performance rendering using HTML5 Canvas.
- **Task Bars**:
  - **Normal Task**: Rectangular bar, colored by tracker/status.
  - **Parent Task**: Bracket style or specific summary bar style.
  - **Milestone**: Diamond shape.
  - **Progress**: Darker fill overlay indicating % done.
  - **Label**: Task name next to or inside the bar.
- **Dependencies**: Bezier curves connecting tasks (Finish-to-Start, etc.).
- **Grid**: Vertical lines for time divisions, highlighting weekends.

## 3. Architecture

### 3.1. Tech Stack
- **Framework**: React 19 + TypeScript.
- **State Management**: Zustand.
- **Build Tool**: Vite.
- **CSS**: CSS Modules or Standard CSS with Variables (Jira-like theme).

### 3.2. Data Model (`TaskStore`)
```typescript
interface Task {
  id: number;
  parentId: number | null;
  subject: string;
  startDate: string; // ISO
  dueDate: string; // ISO
  doneRatio: number;
  status: { id: number; name: string; color?: string };
  assignee: { id: number; name: string; avatarUrl?: string };
  isExpanded: boolean;
  depth: number; // calculated
  index: number; // for vertical positioning
}

interface GanttState {
  tasks: Task[];
  visibleTasks: Task[]; // Flattened list of currently visible (expanded) tasks
  timeRange: { start: Date; end: Date };
  zoomLevel: 'day' | 'week' | 'month';
  scrollX: number;
  selection: number | null; // Selected Task ID
}
```

### 3.3. Component Structure
- `App`
  - `Toolbar`
  - `SplitPane`
    - `WBSTable`
      - `TableHeader`
      - `TableRow` (Virtualization recommended for large datasets)
    - `GanttChart`
      - `GanttCanvas` (ref to HTMLCanvasElement)
      - `GanttTooltip` (Overlay)

### 3.4. Rendering Strategy
- **WBS**: React DOM rendering. Efficient enough for < 1000 visible rows.
- **Gantt**: Canvas API (`CanvasRenderingContext2D`).
  - `GanttRenderer` class handles drawing.
  - `requestAnimationFrame` for smooth scrolling.
  - Off-screen canvas for static elements if optimization needed.

## 4. Expert Review & Plan Refinement

### 4.1. Feedback
- **UX/Architect**: Vertical scrolling must be perfectly synchronized between the WBS Table and the Gantt Chart.
  - *Decision*: Use a shared vertical scroll container. The Table and Gantt will sit side-by-side in a container that handles vertical scrolling. The Gantt component will handle its own horizontal scrolling.
  - *Layout*:
    ```
    [ Toolbar ]
    [ Headers (Table Header | Timeline Header) ] -> Sticky Top
    [ Scrollable Area (overflow-y: auto)       ]
      [ Table Body | Gantt Canvas Container ]
    ```
    *Correction*: The Timeline Header needs to scroll horizontally with the Gantt Canvas.
    *Refined Layout*:
    ```
    [ Toolbar ]
    [ Main Content (Flex Row, h-full) ]
      [ Left Pane (WBS) ]
         [ Header ]
         [ Body (overflow: hidden, scroll controlled by Right Pane or shared wrapper?) ]
      [ Right Pane (Gantt) ]
         [ Header (overflow: hidden, syncs with Body X-scroll) ]
         [ Body (overflow: auto) ] -> Drives vertical scroll of Left Pane.
    ```
    *Simpler Approach*: A single outer container `overflow-y: auto`.
    Inside: `Header` (Sticky) and `Body`.
    Body is Flex Row: `Table` (width fixed/resizable) + `Gantt` (flex-1, overflow-x: auto).
    *Issue*: If Gantt has `overflow-x: auto`, the scrollbar is at the bottom of the Gantt part. If the list is long, you have to scroll down to see the X-scrollbar.
    *Standard Gantt Solution*:
    - Vertical Scrollbar is shared (on the right edge of the viewport).
    - Horizontal Scrollbar is on the bottom of the Gantt pane (always visible or sticky bottom).
    - Headers are sticky top.

### 4.2. Implementation Plan Updates
1.  **Project Setup**:
    -   Configure standard Jira-like colors in CSS variables.
2.  **Store**:
    -   Add `scrollTop` to store (optional) or use event listeners to sync.
    -   Add `taskHeight` (e.g., 40px) and `headerHeight`.
3.  **Components**:
    -   `GanttLayout`: The main grid.
    -   `WBSRow`: React component.
    -   `TimelineHeader`: Canvas or DOM.
    -   `GanttBody`: Canvas.
4.  **Mock Data**:
    -   Generate 50+ tasks with varying depth to test scrolling.

### 4.3. Actionable Tasks
1.  Setup `src/store/useTaskStore.ts`.
2.  Create `src/components/GanttLayout.tsx`.
3.  Implement `src/components/WBSTable.tsx`.
4.  Implement `src/components/GanttChart.tsx` (Canvas).
5.  Implement `src/engines/DateEngine.ts` (Time scale logic).
