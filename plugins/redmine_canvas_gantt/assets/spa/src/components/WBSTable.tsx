import React from 'react';
import { useTaskStore } from '../store/taskStore';
import classNames from 'classnames';

const WBSTable: React.FC = () => {
  const { visibleTasks, rowHeight, toggleExpand } = useTaskStore();

  return (
    <div className="w-full flex flex-col font-sans bg-white">
      {visibleTasks.map(task => (
        <div
            key={task.id}
            className="flex border-b border-gray-200 hover:bg-gray-50 transition-colors box-border text-gray-700 whitespace-nowrap"
            style={{ height: rowHeight }}
        >
          {/* Name Column */}
          <div className="flex-1 flex items-center border-r border-gray-200 overflow-hidden pr-2" style={{ paddingLeft: task.depth * 24 + 8 }}>
            <div className="w-6 flex justify-center shrink-0 mr-1">
                {task.hasChildren && (
                    <button
                        className="w-5 h-5 flex items-center justify-center text-gray-500 hover:bg-gray-200 rounded cursor-pointer border-none bg-transparent p-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(task.id);
                        }}
                    >
                        <span className={classNames("transform transition-transform text-[10px]", { "rotate-90": task.isExpanded })}>
                            ▶
                        </span>
                    </button>
                )}
            </div>
            <div className="flex-1 truncate text-sm flex items-center">
                <span className="mr-2 text-xs font-mono text-gray-400">#{task.id}</span>
                <span title={task.subject}>{task.subject}</span>
            </div>
          </div>

          {/* Status Column */}
          <div className="w-28 px-4 flex items-center border-r border-gray-200">
             <span className={classNames("px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wide", {
                  'bg-blue-100 text-blue-800': task.status === 'In Progress',
                  'bg-gray-100 text-gray-800': task.status === 'New',
                  'bg-green-100 text-green-800': task.status === 'Done'
              })}>{task.status}</span>
          </div>

          {/* Assignee Column */}
          <div className="w-32 px-4 flex items-center text-sm truncate">
               <div className="w-5 h-5 rounded-full bg-gray-300 mr-2 flex items-center justify-center text-[10px] text-white font-bold">
                   {task.assignee.charAt(5)}
               </div>
               {task.assignee}
          </div>
        </div>
      ))}
    </div>
  );
};

export default WBSTable;
