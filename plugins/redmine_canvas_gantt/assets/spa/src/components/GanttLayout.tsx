import React, { useEffect } from 'react';
import { useTaskStore } from '../store/taskStore';
import WBSTable from './WBSTable';
import GanttChart from './GanttChart';

const GanttLayout: React.FC = () => {
  const { initialize, headerHeight } = useTaskStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="flex flex-col h-full w-full bg-white text-[#172b4d]">
        <div className="h-14 border-b border-gray-300 flex items-center px-4 bg-gray-50 shrink-0 justify-between">
            <span className="font-bold text-lg text-gray-800">Project WBS</span>
            <div className="space-x-2">
                <button className="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-100 transition-colors">Day</button>
                <button className="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-100 transition-colors">Week</button>
                <button className="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-100 transition-colors">Month</button>
            </div>
        </div>

        <div className="flex border-b border-gray-300 bg-gray-50 shrink-0" style={{ height: headerHeight }}>
            <div className="w-[40%] min-w-[400px] border-r border-gray-300 flex">
                <div className="flex-1 px-4 flex items-center border-r border-gray-200 font-semibold text-xs text-gray-600 uppercase tracking-wider">Task Name</div>
                <div className="w-28 px-4 flex items-center border-r border-gray-200 font-semibold text-xs text-gray-600 uppercase tracking-wider">Status</div>
                <div className="w-32 px-4 flex items-center font-semibold text-xs text-gray-600 uppercase tracking-wider">Assignee</div>
            </div>
            <div className="flex-1 flex items-center px-4 font-semibold text-xs text-gray-600 uppercase tracking-wider overflow-hidden">
                Timeline
            </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden relative scroll-smooth">
            <div className="flex min-h-full">
                <div className="w-[40%] min-w-[400px] border-r border-gray-300 shrink-0 bg-white z-10">
                    <WBSTable />
                </div>

                <div className="flex-1 overflow-x-auto relative bg-white">
                    <GanttChart />
                </div>
            </div>
        </div>
    </div>
  );
};
export default GanttLayout;
