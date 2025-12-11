import { useState } from 'react';
import { GanttContainer } from './components/GanttContainer';
import { GanttToolbar } from './components/GanttToolbar';
import './App.css';

function App() {
  const [viewMode, setViewMode] = useState<'Day' | 'Week' | 'Month' | 'Quarter'>('Week');

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <GanttToolbar viewMode={viewMode} onViewModeChange={setViewMode} />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <GanttContainer />
      </div>
    </div>
  );
}

export default App;
