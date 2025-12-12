import { useTaskStore } from './stores/TaskStore';
import { GanttContainer } from './components/GanttContainer';
import { GanttToolbar } from './components/GanttToolbar';
import './App.css';

function App() {
  const { viewMode, setViewMode } = useTaskStore();

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <GanttToolbar viewMode={viewMode} onViewModeChange={setViewMode} />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <GanttContainer />
      </div>
    </div>
  );
}

export default App;
