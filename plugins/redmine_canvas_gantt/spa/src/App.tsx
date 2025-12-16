import { useEffect, useRef } from 'react';
import { useTaskStore } from './stores/TaskStore';
import { GanttContainer } from './components/GanttContainer';
import { GanttToolbar } from './components/GanttToolbar';
import Toast from './components/Toast';
import BatchEditDialog from './components/BatchEditDialog';
import { useUIStore } from './stores/UIStore';
import './App.css';

function App() {
  const { zoomLevel, setZoomLevel, isBatchEditMode } = useTaskStore();
  const { isFullScreen, setFullScreen } = useUIStore();
  const previousOverflow = useRef<string | undefined>(undefined);

  useEffect(() => {
    const bodyStyle = document.body.style;

    if (isFullScreen) {
      previousOverflow.current = bodyStyle.overflow;
      bodyStyle.overflow = 'hidden';
    } else if (previousOverflow.current !== undefined) {
      bodyStyle.overflow = previousOverflow.current;
    }
  }, [isFullScreen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFullScreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setFullScreen]);

  return (
    <div
      className={`app-container ${isFullScreen ? 'is-fullscreen' : ''}`}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}
    >
      <GanttToolbar zoomLevel={zoomLevel} onZoomChange={setZoomLevel} />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <GanttContainer />
      </div>
      {isBatchEditMode && <BatchEditDialog />}
      <Toast />
    </div>
  );
}

export default App;
