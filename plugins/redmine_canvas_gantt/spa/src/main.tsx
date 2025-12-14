import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './stores/preferencesWatcher'

const rootElement = document.getElementById('redmine-canvas-gantt-root') || document.getElementById('root');
createRoot(rootElement!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
