import { designTokens } from '../../styles/designTokens';
import React from 'react';
import { useWorkloadStore } from '../../stores/WorkloadStore';
import { useTaskStore } from '../../stores/TaskStore';
import { useUIStore } from '../../stores/UIStore';
import { i18n } from '../../utils/i18n';
import { compareWorkloadAssignees } from '../../services/WorkloadLogicService';
import { WORKLOAD_HEADER_HEIGHT } from '../../constants';
import { useWorkloadScrollSync } from './workloadScrollSync';

interface WorkloadSidebarProps {
    scrollTop?: number;
    onScroll?: (scrollTop: number) => void;
}

const METRIC_COLUMN_MIN_WIDTH = 44;
const METRIC_COLUMN_MAX_WIDTH = 72;
const OVERLOAD_COLUMN_MIN_WIDTH = 124;
const OVERLOAD_COLUMN_MAX_WIDTH = 170;
const WORKLOAD_GRID_TEMPLATE = [
    'minmax(0, 1fr)',
    `clamp(${METRIC_COLUMN_MIN_WIDTH}px, 16%, ${METRIC_COLUMN_MAX_WIDTH}px)`,
    `clamp(${METRIC_COLUMN_MIN_WIDTH}px, 16%, ${METRIC_COLUMN_MAX_WIDTH}px)`,
    `clamp(${OVERLOAD_COLUMN_MIN_WIDTH}px, 35%, ${OVERLOAD_COLUMN_MAX_WIDTH}px)`
].join(' ');

export const WorkloadSidebar: React.FC<WorkloadSidebarProps> = ({
    scrollTop = 0,
    onScroll
}) => {
    const {
        workloadData,
        actualStatus,
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
        ? Array.from(workloadData.assignees.values()).sort(compareWorkloadAssignees)
        : [];
    const hasAssignees = assignees.length > 0;
    const handleScroll = useWorkloadScrollSync(scrollRef, scrollTop, onScroll);

    if (!workloadData) {
        return <div style={{ padding: '10px', color: '#666', fontSize: '13px' }}>{i18n.t('label_loading') || 'Loading...'}</div>;
    }

    return (
        <div
            data-testid="workload-sidebar"
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, width: '100%', height: '100%', boxSizing: 'border-box', borderTop: '1px solid #e0e0e0', backgroundColor: '#fafafa' }}
        >
            <div style={{
                height: `${WORKLOAD_HEADER_HEIGHT}px`,
                flex: `0 0 ${WORKLOAD_HEADER_HEIGHT}px`,
                boxSizing: 'border-box',
                borderBottom: '1px solid #e0e0e0',
                display: 'grid',
                gridTemplateColumns: WORKLOAD_GRID_TEMPLATE,
                alignItems: 'center',
                padding: '0 16px',
                fontWeight: 600,
                fontSize: '12px',
                color: '#666',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
            }} data-testid="workload-sidebar-header">
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                onScroll={handleScroll}
                style={{ flex: 1, minHeight: 0, overflowY: hasAssignees ? 'auto' : 'hidden', overflowX: 'hidden', position: 'relative' }}
            >
                {hasAssignees ? (
                    <div style={{ minHeight: `${assignees.length * rowHeight}px` }}>
                        {assignees.map((assignee) => {

                            return (
                                <div
                                    key={assignee.assigneeId}
                                    data-testid={`workload-sidebar-row-${assignee.assigneeId}`}
                                    style={{
                                        height: `${rowHeight}px`,
                                        borderBottom: '1px solid #f0f0f0',
                                        padding: '8px 16px',
                                        display: 'grid',
                                        gridTemplateColumns: WORKLOAD_GRID_TEMPLATE,
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
                                        style={{ gridColumn: '2 / 3', gridRow: '1 / 3', minWidth: 0, overflow: 'hidden', textAlign: 'right', fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}
                                    >
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} aria-label={`${i18n.t('label_workload_planned')} ${assignee.plannedPeak.toFixed(1)}h`}>{i18n.t('label_workload_planned_short')} {assignee.plannedPeak.toFixed(1)}h</div>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} aria-label={`${i18n.t('label_workload_actual')} ${actualStatus === 'ready' ? `${assignee.actualPeak.toFixed(1)}h` : '—'}`}>{i18n.t('label_workload_actual_short')} {actualStatus === 'ready' ? `${assignee.actualPeak.toFixed(1)}h` : '—'}</div>
                                    </div>
                                    <div
                                        data-testid={`workload-sidebar-total-${assignee.assigneeId}`}
                                        style={{ gridColumn: '3 / 4', gridRow: '1 / 3', minWidth: 0, overflow: 'hidden', textAlign: 'right', fontSize: '12px', color: '#666', whiteSpace: 'nowrap' }}
                                    >
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} aria-label={`${i18n.t('label_workload_planned')} ${assignee.plannedTotal.toFixed(1)}h`}>{i18n.t('label_workload_planned_short')} {assignee.plannedTotal.toFixed(1)}h</div>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} aria-label={`${i18n.t('label_workload_actual')} ${actualStatus === 'ready' ? `${assignee.actualTotal.toFixed(1)}h` : '—'}`}>{i18n.t('label_workload_actual_short')} {actualStatus === 'ready' ? `${assignee.actualTotal.toFixed(1)}h` : '—'}</div>
                                    </div>
                                    {(['planned', 'actual'] as const).map(series => {
                                        const hasOverload = Array.from(assignee.dailyWorkloads.values()).some(d => series === 'planned' ? d.isPlannedOverload : actualStatus === 'ready' && d.isActualOverload);
                                        const overloadCycleInfo = getOverloadCycleInfo(assignee.assigneeId, series);
                                        return hasOverload && (
                                        <div
                                            key={series}
                                            data-testid={`${series === 'actual' ? 'actual-' : ''}overload-action-area-${assignee.assigneeId}`}
                                            style={{
                                                gridColumn: '4 / 5',
                                                gridRow: series === 'planned' ? '1 / 2' : '2 / 3',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'flex-end',
                                                gap: '4px',
                                                width: '100%',
                                                minWidth: 0,
                                                justifySelf: 'end'
                                            }}
                                        >
                                            <button
                                                type="button"
                                                aria-label={`${i18n.t('label_workload_focus_overload', { name: assignee.assigneeName })} (${i18n.t(`label_workload_${series}`)})`}
                                                onClick={() => {
                                                    const selectedBar = resolveNextOverloadBar(assignee.assigneeId, series);
                                                    if (!selectedBar) return;

                                                    suppressNextFocusedHistogramBarVerticalScroll(selectedBar);
                                                    resetHistogramSelectionCycle();
                                                    const { taskId } = resolveNextHistogramTask(selectedBar.assigneeId, selectedBar.dateStr, series);
                                                    if (!taskId) return;

                                                    const result = useTaskStore.getState().focusTask(taskId);
                                                    if (result.status === 'filtered_out') {
                                                        useUIStore.getState().addNotification(i18n.t('label_selected_task_is_hidden') || 'Selected task is hidden by the current filters.', 'warning');
                                                    }
                                                }}
                                                style={{
                                                    backgroundColor: designTokens.controlBg,
                                                    color: designTokens.taskDelayed,
                                                    padding: '2px 4px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    flex: '1 1 auto',
                                                    minWidth: 0,
                                                    maxWidth: '100%',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                {i18n.t(`label_workload_${series}_overload`)}
                                            </button>
                                            <span
                                                data-testid={`${series === 'actual' ? 'actual-' : ''}overload-cycle-count-${assignee.assigneeId}`}
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
                                    ); })}
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
