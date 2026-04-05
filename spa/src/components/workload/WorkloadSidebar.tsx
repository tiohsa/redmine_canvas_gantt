import React from 'react';
import { useWorkloadStore } from '../../stores/WorkloadStore';
import { useTaskStore } from '../../stores/TaskStore';
import { useUIStore } from '../../stores/UIStore';
import { i18n } from '../../utils/i18n';

interface WorkloadSidebarProps {
    scrollTop?: number;
    onScroll?: (scrollTop: number) => void;
}

export const WorkloadSidebar: React.FC<WorkloadSidebarProps> = ({
    scrollTop = 0,
    onScroll
}) => {
    const METRIC_COLUMN_WIDTH = 72;
    const OVERLOAD_COLUMN_WIDTH = 170;
    const {
        workloadData,
        resolveNextOverloadBar,
        resetHistogramSelectionCycle,
        resolveNextHistogramTask,
        getOverloadCycleInfo,
        suppressNextFocusedHistogramBarVerticalScroll
    } = useWorkloadStore();
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
                display: 'grid',
                gridTemplateColumns: `minmax(0, 1fr) ${METRIC_COLUMN_WIDTH}px ${METRIC_COLUMN_WIDTH}px ${OVERLOAD_COLUMN_WIDTH}px`,
                alignItems: 'center',
                padding: '0 16px',
                fontWeight: 600,
                fontSize: '12px',
                color: '#666',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
            }}>
                <div style={{ minWidth: 0 }}>
                    {i18n.t('label_assignee_plural') || 'Assignees'}
                </div>
                <div
                    data-testid="workload-sidebar-header-peak"
                    style={{ textAlign: 'right' }}
                >
                    {i18n.t('label_peak') || 'Peak'}
                </div>
                <div
                    data-testid="workload-sidebar-header-total"
                    style={{ textAlign: 'right' }}
                >
                    {i18n.t('label_total') || 'Total'}
                </div>
                <div />
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
                            const overloadCycleInfo = getOverloadCycleInfo(assignee.assigneeId);
                            return (
                                <div
                                    key={assignee.assigneeId}
                                    data-testid={`workload-sidebar-row-${assignee.assigneeId}`}
                                    style={{
                                        height: `${rowHeight}px`,
                                        borderBottom: '1px solid #f0f0f0',
                                        padding: '8px 16px',
                                        display: 'grid',
                                        gridTemplateColumns: `minmax(0, 1fr) ${METRIC_COLUMN_WIDTH}px ${METRIC_COLUMN_WIDTH}px ${OVERLOAD_COLUMN_WIDTH}px`,
                                        gridTemplateRows: '1fr 1fr',
                                        alignItems: 'center',
                                        boxSizing: 'border-box'
                                    }}
                                >
                                    <div
                                        style={{
                                            gridColumn: '1 / 2',
                                            gridRow: '1 / 3',
                                            minWidth: 0,
                                            fontWeight: 600,
                                            fontSize: '14px',
                                            color: '#333',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            alignSelf: 'center'
                                        }}
                                    >
                                        {assignee.assigneeName}
                                    </div>
                                    <div
                                        data-testid={`workload-sidebar-peak-${assignee.assigneeId}`}
                                        style={{ gridColumn: '2 / 3', gridRow: '2 / 3', textAlign: 'right', fontSize: '12px', color: '#666' }}
                                    >
                                        {assignee.peakLoad.toFixed(1)}h
                                    </div>
                                    <div
                                        data-testid={`workload-sidebar-total-${assignee.assigneeId}`}
                                        style={{ gridColumn: '3 / 4', gridRow: '2 / 3', textAlign: 'right', fontSize: '12px', color: '#666' }}
                                    >
                                        {assignee.totalLoad.toFixed(1)}h
                                    </div>
                                    {hasOverload && (
                                        <div
                                            data-testid={`overload-action-area-${assignee.assigneeId}`}
                                            style={{
                                                gridColumn: '4 / 5',
                                                gridRow: '1 / 3',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'flex-end',
                                                gap: '6px',
                                                width: `${OVERLOAD_COLUMN_WIDTH}px`,
                                                justifySelf: 'end'
                                            }}
                                        >
                                            <button
                                                type="button"
                                                aria-label={`Focus overload histogram for ${assignee.assigneeName}`}
                                                onClick={() => {
                                                    const selectedBar = resolveNextOverloadBar(assignee.assigneeId);
                                                    if (!selectedBar) return;

                                                    suppressNextFocusedHistogramBarVerticalScroll(selectedBar);
                                                    resetHistogramSelectionCycle();
                                                    const { taskId } = resolveNextHistogramTask(selectedBar.assigneeId, selectedBar.dateStr);
                                                    if (!taskId) return;

                                                    const result = useTaskStore.getState().focusTask(taskId);
                                                    if (result.status === 'filtered_out') {
                                                        useUIStore.getState().addNotification(i18n.t('label_selected_task_is_hidden') || 'Selected task is hidden by the current filters.', 'warning');
                                                    }
                                                }}
                                                style={{
                                                    backgroundColor: '#fce8e6',
                                                    color: '#d93025',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    border: 'none',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                OVERLOAD
                                            </button>
                                            <span
                                                data-testid={`overload-cycle-count-${assignee.assigneeId}`}
                                                style={{
                                                    width: '32px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    color: '#666',
                                                    textAlign: 'right',
                                                    visibility: overloadCycleInfo ? 'visible' : 'hidden'
                                                }}
                                            >
                                                {overloadCycleInfo ? `${overloadCycleInfo.current}/${overloadCycleInfo.total}` : '0/0'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ padding: '16px', color: '#666', fontSize: '13px', lineHeight: '1.5' }}>
                        {i18n.t('label_no_workload_data_matches_filters') || 'No workload data matches the current filters.'}
                    </div>
                )}
            </div>
        </div>
    );
};
