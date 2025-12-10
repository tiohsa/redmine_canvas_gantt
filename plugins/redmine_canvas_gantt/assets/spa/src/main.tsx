import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('redmine-canvas-gantt-root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
