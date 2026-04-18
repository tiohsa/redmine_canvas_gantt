import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/500.css'
import '@fontsource/noto-sans-jp/700.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SvgSpriteDefs } from './icons/SvgSpriteDefs'
import './index.css'
import './stores/preferencesWatcher'

const rootElement = document.getElementById('redmine-canvas-gantt-root') || document.getElementById('root');
createRoot(rootElement!).render(
  <StrictMode>
    <SvgSpriteDefs />
    <App />
  </StrictMode>,
)
