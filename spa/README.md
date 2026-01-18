# Redmine Canvas Gantt SPA

English | [日本語](README_ja.md)

Single Page Application frontend for the Redmine Canvas Gantt plugin. Built with React, TypeScript, and Vite to render an interactive Gantt chart inside Redmine.

## Highlights

- Interactive Gantt chart focused on tasks, relations, and versions
- Inline edits and rescheduling backed by Redmine APIs
- Canvas-based rendering for large timelines
- Clean state separation with Zustand stores

## Tech Stack

- React 19
- TypeScript 5
- Vite 7
- Zustand 5
- Vitest

## Requirements

- Node.js (LTS recommended)
- npm or pnpm

## Quick Start

```bash
npm install
```

```bash
npm run dev
```

The dev server runs at `http://localhost:5173` with CORS enabled (see `vite.config.ts`).

## Scripts

```bash
npm run dev      # start Vite dev server
npm run build    # build to ../assets/build with manifest
npm run test     # run unit tests (Vitest)
npm run lint     # run ESLint
```

## Build Output

- Output directory: `../assets/build`
- Manifest: `../assets/build/.vite/manifest.json`

These assets are consumed by the Redmine plugin and injected into the page.

## Integration with Redmine

1. Build the SPA from this directory.
2. The Redmine plugin serves the compiled assets.
3. The host page injects a `window.RedmineCanvasGantt` object for configuration.

```ts
window.RedmineCanvasGantt = {
  projectId: 1,
  apiBase: '/projects/1/canvas_gantt',
  redmineBase: '',
  authToken: 'csrf-token',
  apiKey: 'api-key',
  settings: {
    row_height: '32',
    inline_edit_subject: '1',
    inline_edit_status: '1',
    inline_edit_start_date: '1'
  },
  i18n: {
    field_subject: 'Subject',
    field_assigned_to: 'Assignee'
  }
}
```

## Project Structure

- `src/api/` API client for Redmine endpoints
- `src/components/` UI components
- `src/engines/` layout and interaction logic
- `src/renderers/` canvas renderers
- `src/stores/` Zustand stores
- `src/types/` shared types

## Testing Notes

Some tests may log `HTMLCanvasElement.getContext()` warnings in jsdom. This does not fail tests.

## License

This SPA is part of the Redmine Canvas Gantt plugin. See the root project for licensing details.
