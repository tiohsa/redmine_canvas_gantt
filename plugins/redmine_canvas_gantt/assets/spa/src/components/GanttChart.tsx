import React from 'react';
import { useTaskStore } from '../store/taskStore';

const GanttChart: React.FC = () => {
    const { visibleTasks, rowHeight } = useTaskStore();
    const totalHeight = visibleTasks.length * rowHeight;

    return (
        <div style={{ height: totalHeight, minWidth: '100%', width: '2000px', position: 'relative' }}>
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: 'linear-gradient(to right, #eee 1px, transparent 1px)',
                    backgroundSize: '50px 100%'
                }}
            />
            {visibleTasks.map((task, i) => (
                <div
                    key={task.id}
                    className="absolute bg-[#0052cc] rounded shadow-sm hover:bg-[#0065ff] cursor-pointer"
                    style={{
                        top: i * rowHeight + 8,
                        height: rowHeight - 16,
                        left: 50 + (task.id * 15) % 600,
                        width: 100 + (task.id * 5) % 150
                    }}
                    title={task.subject}
                />
            ))}
        </div>
    );
};
export default GanttChart;
