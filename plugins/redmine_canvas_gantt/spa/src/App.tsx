import { useTaskStore } from './stores/TaskStore';
import { GanttContainer } from './components/GanttContainer';
import { GanttToolbar } from './components/GanttToolbar';
import Toast from './components/Toast';
import BatchEditDialog from './components/BatchEditDialog';
import './App.css';

function App() {
  const { zoomLevel, setZoomLevel, isBatchEditMode } = useTaskStore();

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
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
