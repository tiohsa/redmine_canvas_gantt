import { useState } from 'react';
import { GanttContainer } from './components/GanttContainer';
import { GanttToolbar } from './components/GanttToolbar';
import './App.css';

function App() {
  const [viewMode, setViewMode] = useState<'Day' | 'Week' | 'Month' | 'Quarter'>('Week');

  return (
    <div className="app-shell">
      <div className="gantt-card">
        <GanttToolbar viewMode={viewMode} onViewModeChange={setViewMode} />
        <div className="gantt-body">
          <GanttContainer />
        </div>
      </div>
    </div>
  );
}

export default App;
