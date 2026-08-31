import { useEffect, useRef } from 'react';
import { useTaskStore } from './stores/TaskStore';
import { GanttContainer } from './components/GanttContainer';
import { GanttToolbar } from './components/GanttToolbar';
import Toast from './components/Toast';
import { ConflictResolutionPanel } from './components/ConflictResolutionPanel';
import { GlobalTimer } from './components/timer/GlobalTimer';
import { TimerStartModal } from './components/timer/TimerStartModal';
import { PendingWorkModal } from './components/timer/PendingWorkModal';
import { OtherNoticeModal } from './components/timer/OtherNoticeModal';
import type { GanttExportHandle } from './export/types';

import { useUIStore } from './stores/UIStore';
import './App.css';

function App() {
  const zoomLevel = useTaskStore(state => state.zoomLevel);
  const setZoomLevel = useTaskStore(state => state.setZoomLevel);
  const isFullScreen = useUIStore(state => state.isFullScreen);
  const setFullScreen = useUIStore(state => state.setFullScreen);
  const previousOverflow = useRef<string | undefined>(undefined);
  const exportRef = useRef<GanttExportHandle>(null);

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
      if (event.defaultPrevented) {
        return;
      }

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
      <GanttToolbar zoomLevel={zoomLevel} onZoomChange={setZoomLevel} exportRef={exportRef} />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <GanttContainer ref={exportRef} />
      </div>

      <Toast />
      <ConflictResolutionPanel />
      <GlobalTimer />
      <TimerStartModal />
      <PendingWorkModal />
      <OtherNoticeModal />
    </div>
  );
}

export default App;
