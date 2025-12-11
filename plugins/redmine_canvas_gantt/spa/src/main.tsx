import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GanttContainer } from './components/GanttContainer'
import './index.css'

const rootElement = document.getElementById('redmine-canvas-gantt-root') || document.getElementById('root');
createRoot(rootElement!).render(
  <StrictMode>
    <GanttContainer />
  </StrictMode>,
)
