import React from 'react';
import { useWorkloadStore } from '../../stores/WorkloadStore';
import { useTaskStore } from '../../stores/TaskStore';
import { i18n } from '../../utils/i18n';

interface WorkloadSidebarProps {
    scrollTop?: number;
    onScroll?: (scrollTop: number) => void;
}

export const WorkloadSidebar: React.FC<WorkloadSidebarProps> = ({
    scrollTop = 0,
    onScroll
}) => {
    const { workloadData } = useWorkloadStore();
    const { viewport } = useTaskStore();
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const rowHeight = viewport.rowHeight * 2;
    const assignees = workloadData
        ? Array.from(workloadData.assignees.values()).sort((a, b) => a.assigneeName.localeCompare(b.assigneeName))
        : [];
    const hasAssignees = assignees.length > 0;

    React.useEffect(() => {
        if (!scrollRef.current) return;
        if (Math.abs(scrollRef.current.scrollTop - scrollTop) > 1) {
            scrollRef.current.scrollTop = scrollTop;
        }
    }, [scrollTop]);

    if (!workloadData) {
        return <div style={{ padding: '10px', color: '#666', fontSize: '13px' }}>{i18n.t('label_loading') || 'Loading...'}</div>;
    }

    return (
        <div
            data-testid="workload-sidebar"
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, width: '100%', height: '100%', borderTop: '1px solid #e0e0e0', backgroundColor: '#fafafa' }}
        >
            <div style={{
                height: '40px',
                borderBottom: '1px solid #e0e0e0',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                fontWeight: 600,
                fontSize: '12px',
                color: '#666',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
            }}>
                {i18n.t('label_assignee_plural') || 'Assignees'}
            </div>
            <div
                ref={scrollRef}
                data-testid="workload-sidebar-scroll"
                onScroll={(event) => onScroll?.(event.currentTarget.scrollTop)}
                style={{ flex: 1, overflowY: hasAssignees ? 'auto' : 'hidden', overflowX: 'hidden', position: 'relative' }}
            >
                {hasAssignees ? (
                    <div style={{ minHeight: `${assignees.length * rowHeight}px` }}>
                        {assignees.map((assignee) => {
                            const hasOverload = Array.from(assignee.dailyWorkloads.values()).some(d => d.isOverload);
                            return (
                                <div
                                    key={assignee.assigneeId}
                                    style={{
                                        height: `${rowHeight}px`,
                                        borderBottom: '1px solid #f0f0f0',
                                        padding: '8px 16px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        boxSizing: 'border-box'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {assignee.assigneeName}
                                        </div>
                                        {hasOverload && (
                                            <div style={{
                                                backgroundColor: '#fce8e6',
                                                color: '#d93025',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: 600
                                            }}>
                                                OVERLOAD
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                        Peak {assignee.peakLoad.toFixed(1)}h &bull; Total {assignee.totalLoad.toFixed(1)}h
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ padding: '16px', color: '#666', fontSize: '13px', lineHeight: '1.5' }}>
                        No workload data matches the current filters.
                    </div>
                )}
            </div>
        </div>
    );
};
