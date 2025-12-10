import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GanttContainer } from './components/GanttContainer'
import './index.css'

createRoot(document.getElementById('redmine-canvas-gantt-root')!).render(
  <StrictMode>
    <GanttContainer />
  </StrictMode>,
)
