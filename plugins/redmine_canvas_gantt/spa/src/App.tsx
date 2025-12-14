import { useTaskStore } from './stores/TaskStore';
import { useUIStore } from './stores/UIStore';
import { GanttContainer } from './components/GanttContainer';
import { GanttToolbar } from './components/GanttToolbar';
import { EditDialog } from './components/EditDialog';
import Toast from './components/Toast';
import './App.css';

function App() {
  const { zoomLevel, setZoomLevel } = useTaskStore();
  const { isEditing, setEditMode } = useUIStore();

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {isEditing ? (
        <EditDialog onClose={() => setEditMode(false)} />
      ) : (
        <>
            <GanttToolbar zoomLevel={zoomLevel} onZoomChange={setZoomLevel} />
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <GanttContainer />
            </div>
        </>
      )}
      <Toast />
    </div>
  );
}

export default App;
